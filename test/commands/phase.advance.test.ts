import { runCommand } from "@oclif/test";
import { describe, it, expect } from "vitest";
import nock from "nock";

const API = "https://api.agnt-gm.ai";

describe("phase advance (v0.13.0: C11, owner escape hatch)", () => {
  describe("happy path: failed phase on platform_agent", () => {
    it("prints what it's about to do, then POSTs and reports the audit log entry", async () => {
      // 1. /phase returns a failed phase
      nock(API)
        .get("/api/builder/projects/proj_abc/phase")
        .reply(200, {
          project_slug: "proj_abc",
          current_phase: "dev",
          phase_status: "failed",
          next_action: "advance to tests",
          phase_runs: [
            {
              id: "run-1",
              verdict: {
                verdict: "reject",
                notes:
                  "Missing OAuth tests. Add the tests per details.md §3. " +
                  "Don't forget the refresh-token integration.",
              },
            },
          ],
        });

      // 2. /builder/projects/{id} returns build_mode
      nock(API)
        .get("/api/builder/projects/proj_abc")
        .reply(200, { build_mode: "platform_agent" });

      // 3. POST /phase/advance succeeds
      nock(API)
        .post("/api/builder/projects/proj_abc/phase/advance")
        .reply(200, {
          ok: true,
          advanced_to: "tests",
          audit_log: "owner_override",
        });

      const { stdout, error } = await runCommand(["phase", "advance", "proj_abc"]);
      expect(error).toBeUndefined();
      // "About to POST" preamble
      expect(stdout).toContain("About to POST /phase/advance");
      expect(stdout).toContain("phase_status:  failed");
      expect(stdout).toContain("last verdict:  reject");
      // Success line mentions the audit log entry
      expect(stdout).toContain("Audit log: owner_override");
      expect(stdout).toContain("advanced to tests");
    });

    it("JSON output passes through the response shape", async () => {
      nock(API)
        .get("/api/builder/projects/proj_abc/phase")
        .reply(200, {
          project_slug: "proj_abc",
          current_phase: "dev",
          phase_status: "failed",
          phase_runs: [],
        });
      nock(API)
        .get("/api/builder/projects/proj_abc")
        .reply(200, { build_mode: "platform_agent" });
      nock(API)
        .post("/api/builder/projects/proj_abc/phase/advance")
        .reply(200, {
          ok: true,
          advanced_to: "tests",
          audit_log: "owner_override",
        });

      const { stdout, error } = await runCommand([
        "phase",
        "advance",
        "proj_abc",
        "--json",
      ]);
      expect(error).toBeUndefined();
      const out = JSON.parse(stdout);
      expect(out.advanced_to).toBe("tests");
      expect(out.audit_log).toBe("owner_override");
    });
  });

  describe("local_agent (warns but allows)", () => {
    it("prints a note that the executor auto-advances, then POSTs", async () => {
      nock(API)
        .get("/api/builder/projects/proj_abc/phase")
        .reply(200, {
          project_slug: "proj_abc",
          current_phase: "dev",
          phase_status: "failed",
          phase_runs: [],
        });
      nock(API)
        .get("/api/builder/projects/proj_abc")
        .reply(200, { build_mode: "local_agent" });
      nock(API)
        .post("/api/builder/projects/proj_abc/phase/advance")
        .reply(200, { ok: true, advanced_to: "tests" });

      const { stdout, error } = await runCommand(["phase", "advance", "proj_abc"]);
      expect(error).toBeUndefined();
      expect(stdout).toContain("local_agent mode");
      expect(stdout).toContain("auto-advances");
      // Still posts and reports success
      expect(stdout).toContain("Audit log: owner_override");
    });
  });

  describe("safety gates", () => {
    it("refuses if phase_status is not 'failed' (exit 1)", async () => {
      nock(API)
        .get("/api/builder/projects/proj_abc/phase")
        .reply(200, {
          project_slug: "proj_abc",
          current_phase: "dev",
          phase_status: "active",
        });
      nock(API)
        .get("/api/builder/projects/proj_abc")
        .reply(200, { build_mode: "platform_agent" });
      // No /phase/advance POST expected — the gate fires first.

      const { error } = await runCommand(["phase", "advance", "proj_abc"]);
      expect(error?.oclif?.exit).toBe(1);
      // oclif puts the error message on `error.message` (and on
      // stderr in production). The "About to POST" preamble
      // shouldn't be printed when we refuse up front.
      expect(error?.message).toContain('phase_status is "active"');
      expect(error?.message).toContain("Refusing to advance");
    });

    it("refuses on 403 owner-not-authorized (exit 1)", async () => {
      nock(API)
        .get("/api/builder/projects/proj_abc/phase")
        .reply(200, {
          project_slug: "proj_abc",
          current_phase: "dev",
          phase_status: "failed",
        });
      nock(API)
        .get("/api/builder/projects/proj_abc")
        .reply(200, { build_mode: "platform_agent" });
      nock(API)
        .post("/api/builder/projects/proj_abc/phase/advance")
        .reply(403, { error: "not the project owner" });

      const { error } = await runCommand(["phase", "advance", "proj_abc"]);
      expect(error?.oclif?.exit).toBe(1);
      expect(error?.message).toContain("Owner authorization required");
    });

    it("exits 1 on generic /phase/advance API error", async () => {
      nock(API)
        .get("/api/builder/projects/proj_abc/phase")
        .reply(200, {
          project_slug: "proj_abc",
          current_phase: "dev",
          phase_status: "failed",
        });
      nock(API)
        .get("/api/builder/projects/proj_abc")
        .reply(200, { build_mode: "platform_agent" });
      nock(API)
        .post("/api/builder/projects/proj_abc/phase/advance")
        .reply(500, { error: "down" });

      const { error } = await runCommand(["phase", "advance", "proj_abc"]);
      expect(error?.oclif?.exit).toBe(1);
      expect(error?.message).toContain("Phase advance failed");
    });
  });

  describe("error paths", () => {
    it("exits 4 when project not found at /phase", async () => {
      nock(API)
        .get("/api/builder/projects/nope/phase")
        .reply(404, { error: "not_found" });
      const { error } = await runCommand(["phase", "advance", "nope"]);
      expect(error?.oclif?.exit).toBe(4);
    });

    it("exits 1 on /phase API error", async () => {
      nock(API)
        .get("/api/builder/projects/proj_abc/phase")
        .reply(500, { error: "down" });
      const { error } = await runCommand(["phase", "advance", "proj_abc"]);
      expect(error?.oclif?.exit).toBe(1);
    });

    it("requires project id", async () => {
      const { error } = await runCommand(["phase", "advance"]);
      expect(error?.oclif?.exit).toBe(2);
    });
  });
});
