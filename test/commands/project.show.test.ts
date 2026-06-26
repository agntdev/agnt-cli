import { runCommand } from "@oclif/test";
import { describe, it, expect } from "vitest";
import nock from "nock";

const API = "https://api.agnt-gm.ai";

// v0.15.1: GET /builder/projects/{id} returns a { project, ... } wrapper
// (M1 build_pipeline patch). All tests use the wrapped shape — that's
// what the real API ships today. The CLI must unwrap before reading
// project fields. (Tests for the unwrap helper itself live in
// test/lib/client.test.ts.)
//
// v0.16.0: `build_pipeline` is now REQUIRED. Pre-v0.16.0 silently
// defaulted to "phase" on missing/undefined — that fallback masked
// the v0.15.1 unwrap bug for months. Now: if the field is missing,
// the CLI throws with a clear "upgrade agnt-api to v0.14.0 or later"
// hint. Tests below pin both paths.

function wrapped(p: Record<string, unknown>) {
  return { project: p, task_count: 7 };
}

// Most existing tests need a project with both build_mode AND
// build_pipeline set — the typical current-server response. A few
// tests intentionally omit one to pin the failure mode.
function fullProject(overrides: Record<string, unknown> = {}) {
  return wrapped({
    id: "proj_abc",
    slug: "my-project",
    name: "My Project",
    status: "live",
    build_mode: "platform_agent",
    build_pipeline: "phase",
    ...overrides,
  });
}

describe("project show (v0.15.1: unwrap ProjectDetailResponse)", () => {
  describe("platform_agent (legacy)", () => {
    it("surfaces build_mode: platform_agent in human output", async () => {
      nock(API)
        .get("/api/builder/projects/proj_abc")
        .reply(200, fullProject({ build_mode: "platform_agent" }));

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
        .reply(200, fullProject({ build_mode: "platform_agent" }));

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
        .reply(200, fullProject({ build_mode: "local_agent" }));

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
        .reply(200, fullProject({ build_mode: "local_agent" }));

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
        .reply(200, fullProject({
          slug: "tm-bot",
          name: "TM Bot",
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
        .reply(200, fullProject({
          slug: "ph-bot",
          name: "Phase Bot",
          build_pipeline: "phase",
        }));

      const { stdout, error } = await runCommand(["project", "show", "proj_ph"]);
      expect(error).toBeUndefined();
      expect(stdout).toContain("Build pipeline: phase");
      expect(stdout).toContain("legacy 6-phase flow");
    });

    // v0.17.1: whole_bot has TWO drivers (decided by build_mode). The render
    // must surface the pipeline label + a hint that points the agent at the
    // correct "what to do" branch (build it yourself vs. platform builds it).
    describe("whole_bot (v0.17.1: build_mode distinguishes the driver)", () => {
      it("renders whole_bot + local_agent as YOU build it", async () => {
        nock(API)
          .get("/api/builder/projects/proj_wb")
          .reply(200, fullProject({
            slug: "wb-bot",
            name: "Whole Bot",
            build_mode: "local_agent",
            build_pipeline: "whole_bot",
          }));

        const { stdout, error } = await runCommand(["project", "show", "proj_wb"]);
        expect(error).toBeUndefined();
        expect(stdout).toContain("Build pipeline: whole_bot");
        expect(stdout).toContain("N-pass build against docs/blueprint.md");
        // Hint must point the agent at the work, not away from it.
        expect(stdout).toContain("YOU build the whole bot");
        expect(stdout).toContain("docs/blueprint.md");
      });

      it("renders whole_bot + platform_agent as platform builds it", async () => {
        nock(API)
          .get("/api/builder/projects/proj_wb_cloud")
          .reply(200, fullProject({
            slug: "wb-cloud",
            name: "Cloud Whole Bot",
            build_mode: "platform_agent",
            build_pipeline: "whole_bot",
          }));

        const { stdout, error } = await runCommand(["project", "show", "proj_wb_cloud"]);
        expect(error).toBeUndefined();
        expect(stdout).toContain("Build pipeline: whole_bot");
        expect(stdout).toContain("platform cloud agent");
      });
    });

    it("exposes build_pipeline=whole_bot in JSON output", async () => {
      nock(API)
        .get("/api/builder/projects/proj_wb")
        .reply(200, fullProject({ build_pipeline: "whole_bot" }));

      const { stdout, error } = await runCommand([
        "project",
        "show",
        "proj_wb",
        "--json",
      ]);
      expect(error).toBeUndefined();
      const out = JSON.parse(stdout);
      expect(out.build_pipeline).toBe("whole_bot");
    });

    it("exposes the real project name (was falling back to slug)", async () => {
      nock(API)
        .get("/api/builder/projects/proj_abc")
        .reply(200, fullProject({
          slug: "my-slug",
          name: "My Real Name",
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
      // build_pipeline IS present (the M1 patch ships it on every
      // current server), so we don't trigger the fail-loud path.
      nock(API)
        .get("/api/builder/projects/proj_abc")
        .reply(200, wrapped({
          id: "proj_abc",
          slug: "my-project",
          name: "My Project",
          status: "live",
          build_pipeline: "phase",
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

  // v0.16.0: the v0.15.1 fix removed the silent fallback for
  // `build_pipeline` — missing field is a real error now. Pin the
  // behavior: a clear error message pointing at the agnt-api version
  // the agent needs to upgrade to.
  describe("missing build_pipeline (v0.16.0 fail-loud)", () => {
    it("throws with an upgrade hint when the server omits build_pipeline", async () => {
      nock(API)
        .get("/api/builder/projects/proj_old")
        .reply(200, wrapped({
          id: "proj_old",
          slug: "old-project",
          name: "Old Project",
          status: "live",
          build_mode: "platform_agent",
          // build_pipeline intentionally absent
        }));

      const { error } = await runCommand(["project", "show", "proj_old"]);
      expect(error).toBeDefined();
      // The thrown error includes a clear upgrade hint. We test the
      // message text so future "make this friendlier" edits don't
      // accidentally remove the actionable guidance.
      expect(error?.message).toContain("build_pipeline");
      expect(error?.message).toContain("v0.14.0");
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
