import { runCommand } from "@oclif/test";
import { describe, it, expect } from "vitest";
import nock from "nock";

const API = "https://api.agnt-gm.ai";

// v0.15.1: GET /builder/projects/{id} returns a { project, ... } wrapper
// (M1 build_pipeline patch). All tests use the wrapped shape — that's
// what the real API ships today. The CLI must unwrap before reading
// project fields. (Tests for the unwrap helper itself live in
// test/lib/client.test.ts.)

function wrapped(p: Record<string, unknown>) {
  return { project: p, task_count: 7 };
}

describe("project show (v0.15.1: unwrap ProjectDetailResponse)", () => {
  describe("platform_agent (legacy)", () => {
    it("surfaces build_mode: platform_agent in human output", async () => {
      nock(API)
        .get("/api/builder/projects/proj_abc")
        .reply(200, wrapped({
          id: "proj_abc",
          slug: "my-project",
          name: "My Project",
          status: "live",
          build_mode: "platform_agent",
        }));

      const { stdout, error } = await runCommand(["project", "show", "proj_abc"]);
      expect(error).toBeUndefined();
      expect(stdout).toContain("My Project");
      expect(stdout).toContain("Build mode: platform_agent");
      expect(stdout).toContain("legacy, full pipeline");
      // Hint mentions LLM reviewer (platform_agent-specific)
      expect(stdout).toContain("LLM reviewer");
    });

    it("surfaces build_mode: platform_agent in JSON output", async () => {
      nock(API)
        .get("/api/builder/projects/proj_abc")
        .reply(200, wrapped({
          id: "proj_abc",
          slug: "my-project",
          name: "My Project",
          status: "live",
          build_mode: "platform_agent",
        }));

      const { stdout, error } = await runCommand([
        "project",
        "show",
        "proj_abc",
        "--json",
      ]);
      expect(error).toBeUndefined();
      const out = JSON.parse(stdout);
      expect(out.build_mode).toBe("platform_agent");
      expect(out.slug).toBe("my-project");
    });
  });

  describe("local_agent (pivot)", () => {
    it("surfaces build_mode: local_agent in human output", async () => {
      nock(API)
        .get("/api/builder/projects/proj_abc")
        .reply(200, wrapped({
          id: "proj_abc",
          slug: "my-project",
          name: "My Project",
          status: "live",
          build_mode: "local_agent",
        }));

      const { stdout, error } = await runCommand(["project", "show", "proj_abc"]);
      expect(error).toBeUndefined();
      expect(stdout).toContain("Build mode: local_agent");
      expect(stdout).toContain("you write the code");
      // The local_agent hint mentions the platform hosting, not the reviewer.
      expect(stdout).toContain("platform just hosts it");
    });

    it("surfaces build_mode: local_agent in JSON output", async () => {
      nock(API)
        .get("/api/builder/projects/proj_abc")
        .reply(200, wrapped({
          id: "proj_abc",
          slug: "my-project",
          name: "My Project",
          status: "live",
          build_mode: "local_agent",
        }));

      const { stdout, error } = await runCommand([
        "project",
        "show",
        "proj_abc",
        "--json",
      ]);
      expect(error).toBeUndefined();
      const out = JSON.parse(stdout);
      expect(out.build_mode).toBe("local_agent");
    });
  });

  // v0.15.1: build_pipeline was the field the unwrap bug hid. The
  // human-readable pipeline line was defaulting to "phase (legacy ...)"
  // for every project because the CLI was reading the wrong path. These
  // tests pin the correct rendering for both pipelines.
  describe("build_pipeline (v0.15.1 unwrap fix)", () => {
    it("renders task_manager correctly (the bug)", async () => {
      nock(API)
        .get("/api/builder/projects/proj_tm")
        .reply(200, wrapped({
          id: "proj_tm",
          slug: "tm-bot",
          name: "TM Bot",
          status: "live",
          build_mode: "local_agent",
          build_pipeline: "task_manager",
        }));

      const { stdout, error } = await runCommand(["project", "show", "proj_tm"]);
      expect(error).toBeUndefined();
      expect(stdout).toContain("Build pipeline: task_manager");
      expect(stdout).toContain("living-DAG");
      expect(stdout).not.toContain("legacy 6-phase flow");
    });

    it("renders phase correctly", async () => {
      nock(API)
        .get("/api/builder/projects/proj_ph")
        .reply(200, wrapped({
          id: "proj_ph",
          slug: "ph-bot",
          name: "Phase Bot",
          status: "live",
          build_mode: "platform_agent",
          build_pipeline: "phase",
        }));

      const { stdout, error } = await runCommand(["project", "show", "proj_ph"]);
      expect(error).toBeUndefined();
      expect(stdout).toContain("Build pipeline: phase");
      expect(stdout).toContain("legacy 6-phase flow");
    });

    it("exposes the real project name (was falling back to slug)", async () => {
      nock(API)
        .get("/api/builder/projects/proj_abc")
        .reply(200, wrapped({
          id: "proj_abc",
          slug: "my-slug",
          name: "My Real Name",
          status: "live",
        }));

      const { stdout, error } = await runCommand(["project", "show", "proj_abc"]);
      expect(error).toBeUndefined();
      // Before the fix: showed "my-slug (my-slug)". Now: "My Real Name (my-slug)".
      expect(stdout).toContain("My Real Name");
      expect(stdout).toContain("(my-slug)");
    });
  });

  describe("missing build_mode (backward compat)", () => {
    it("defaults to platform_agent when the field is absent", async () => {
      // Older server (pre-#backend-feat) doesn't return build_mode.
      nock(API)
        .get("/api/builder/projects/proj_abc")
        .reply(200, wrapped({
          id: "proj_abc",
          slug: "my-project",
          status: "live",
        }));

      const { stdout, error } = await runCommand([
        "project",
        "show",
        "proj_abc",
        "--json",
      ]);
      expect(error).toBeUndefined();
      const out = JSON.parse(stdout);
      expect(out.build_mode).toBe("platform_agent");
    });
  });

  describe("error paths", () => {
    it("exits 4 when not found", async () => {
      nock(API).get("/api/builder/projects/nope").reply(404, { error: "not_found" });
      const { error } = await runCommand(["project", "show", "nope"]);
      expect(error?.oclif?.exit).toBe(4);
    });

    it("exits 1 on API error", async () => {
      nock(API).get("/api/builder/projects/proj_abc").reply(500, { error: "down" });
      const { error } = await runCommand(["project", "show", "proj_abc"]);
      expect(error?.oclif?.exit).toBe(1);
    });
  });
});
