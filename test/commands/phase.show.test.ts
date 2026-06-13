import { runCommand } from "@oclif/test";
import { describe, it, expect } from "vitest";
import nock from "nock";

const API = "https://api.agnt-gm.ai";

describe("phase show (v0.13.0: verdict history, short by default)", () => {
  describe("platform_agent (legacy, full pipeline)", () => {
    it("returns phase JSON with --json (includes phase_runs)", async () => {
      nock(API)
        .get("/api/builder/projects/proj_abc/phase")
        .reply(200, {
          project_id: "proj_abc",
          project_slug: "proj_abc",
          current_phase: "dev",
          phase_status: "active",
          phase_order: ["general", "design", "details", "dev", "tests", "published"],
          next_action: "continue dev",
        });

      nock(API)
        .get("/api/builder/projects/proj_abc")
        .reply(200, { build_mode: "platform_agent" });

      nock(API)
        .get("/api/builder/projects/proj_abc/phases/dev/runs")
        .reply(200, {
          runs: [
            {
              id: "run-1",
              phase: "dev",
              run_at: "2026-06-10T14:00:00Z",
              verdict: {
                verdict: "approve",
                notes: "All looks good.",
                missing: [],
                contradictions: [],
                suggestions: [],
              },
            },
          ],
        });

      const { stdout, error } = await runCommand([
        "phase",
        "show",
        "proj_abc",
        "--json",
      ]);
      expect(error).toBeUndefined();

      const out = JSON.parse(stdout);
      expect(out.current_phase).toBe("dev");
      expect(out.build_mode).toBe("platform_agent");
      expect(out.phase_runs).toHaveLength(1);
      expect(out.phase_runs[0].verdict.verdict).toBe("approve");
    });

    it("default human output is short (last verdict notes only)", async () => {
      nock(API)
        .get("/api/builder/projects/proj_abc/phase")
        .reply(200, {
          project_slug: "proj_abc",
          current_phase: "dev",
          phase_status: "active",
          next_action: "continue dev",
        });

      nock(API)
        .get("/api/builder/projects/proj_abc")
        .reply(200, { build_mode: "platform_agent" });

      nock(API)
        .get("/api/builder/projects/proj_abc/phases/dev/runs")
        .reply(200, {
          runs: [
            {
              id: "run-1",
              phase: "dev",
              run_at: "2026-06-10T14:00:00Z",
              verdict: {
                verdict: "reject",
                notes:
                  "Missing tests for /login. See missing list. Add the OAuth tests per details.md §3.",
                missing: ["OAuth tests", "Refresh-token integration test"],
                contradictions: [],
                suggestions: ["Add /login OAuth tests", "Wire refresh-token endpoint"],
              },
            },
          ],
        });

      const { stdout, error } = await runCommand(["phase", "show", "proj_abc"]);
      expect(error).toBeUndefined();
      // Short summary: phase + status + reviews count
      expect(stdout).toContain("Phase: dev");
      expect(stdout).toContain("Reviews: 1");
      // Last verdict sentence
      expect(stdout).toContain("reject");
      // --full output is NOT included in default
      expect(stdout).not.toContain("Full verdict history");
      expect(stdout).not.toContain("OAuth tests");
    });

    it("--full dumps the complete verdict history", async () => {
      nock(API)
        .get("/api/builder/projects/proj_abc/phase")
        .reply(200, {
          project_slug: "proj_abc",
          current_phase: "dev",
          phase_status: "failed",
          next_action: "fix and re-run",
        });

      nock(API)
        .get("/api/builder/projects/proj_abc")
        .reply(200, { build_mode: "platform_agent" });

      nock(API)
        .get("/api/builder/projects/proj_abc/phases/dev/runs")
        .reply(200, {
          runs: [
            {
              id: "run-1",
              phase: "dev",
              run_at: "2026-06-10T14:00:00Z",
              verdict: {
                verdict: "reject",
                notes: "Missing tests.",
                missing: ["OAuth tests"],
                contradictions: [],
                suggestions: ["Add /login OAuth tests"],
              },
            },
          ],
        });

      const { stdout, error } = await runCommand([
        "phase",
        "show",
        "proj_abc",
        "--full",
      ]);
      expect(error).toBeUndefined();
      expect(stdout).toContain("Full verdict history");
      expect(stdout).toContain("OAuth tests");
      expect(stdout).toContain("Add /login OAuth tests");
    });

    it("default human output says '(no reviews yet)' when phase_runs is empty", async () => {
      nock(API)
        .get("/api/builder/projects/proj_abc/phase")
        .reply(200, {
          project_slug: "proj_abc",
          current_phase: "design",
          phase_status: "active",
        });

      nock(API)
        .get("/api/builder/projects/proj_abc")
        .reply(200, { build_mode: "platform_agent" });

      nock(API)
        .get("/api/builder/projects/proj_abc/phases/design/runs")
        .reply(200, { runs: [] });

      const { stdout, error } = await runCommand(["phase", "show", "proj_abc"]);
      expect(error).toBeUndefined();
      expect(stdout).toContain("Reviews: 0");
      expect(stdout).toContain("no reviews yet");
    });
  });

  describe("local_agent mode", () => {
    it("shows 'no reviews (local_agent mode)' and skips the runs call", async () => {
      // Only 2 calls expected: /phase and /builder/projects/{id}.
      // The /phases/:phase/runs call is SKIPPED for local_agent.
      nock(API)
        .get("/api/builder/projects/proj_abc/phase")
        .reply(200, {
          project_slug: "proj_abc",
          current_phase: "dev",
          phase_status: "active",
        });

      nock(API)
        .get("/api/builder/projects/proj_abc")
        .reply(200, { build_mode: "local_agent" });

      const { stdout, error } = await runCommand(["phase", "show", "proj_abc"]);
      expect(error).toBeUndefined();
      expect(stdout).toContain("Phase: dev");
      expect(stdout).toContain("no reviews (local_agent mode");
      // The "(no reviews yet)" message is platform_agent-specific.
      expect(stdout).not.toContain("no reviews yet");
    });

    it("JSON output includes build_mode: local_agent", async () => {
      nock(API)
        .get("/api/builder/projects/proj_abc/phase")
        .reply(200, {
          project_slug: "proj_abc",
          current_phase: "dev",
          phase_status: "active",
        });

      nock(API)
        .get("/api/builder/projects/proj_abc")
        .reply(200, { build_mode: "local_agent" });

      const { stdout, error } = await runCommand([
        "phase",
        "show",
        "proj_abc",
        "--json",
      ]);
      expect(error).toBeUndefined();

      const out = JSON.parse(stdout);
      expect(out.build_mode).toBe("local_agent");
      expect(out.phase_runs).toEqual([]);
    });
  });

  describe("error paths", () => {
    it("exits 1 on /phase API error", async () => {
      nock(API)
        .get("/api/builder/projects/proj_abc/phase")
        .reply(500, { error: "down" });

      const { error } = await runCommand(["phase", "show", "proj_abc"]);
      expect(error?.oclif?.exit).toBe(1);
    });

    it("requires project id", async () => {
      const { error } = await runCommand(["phase", "show"]);
      expect(error?.oclif?.exit).toBe(2);
    });
  });
});
