import { runCommand } from "@oclif/test";
import { describe, it, expect } from "vitest";
import nock from "nock";

const API = "https://api.agnt-gm.ai";

// v0.15.1: GET /builder/projects/{id} returns a { project, ... } wrapper
// (M1 build_pipeline patch). All tests use the wrapped shape — that's
// what the real API ships today. The CLI must unwrap before reading
// project fields.
//
// v0.16.0: `build_pipeline` is now REQUIRED. Pre-v0.16.0 silently
// defaulted to "phase" on missing/undefined — that fallback masked
// the v0.15.1 unwrap bug for months. Now: if the field is missing,
// the CLI throws with a clear "upgrade agnt-api to v0.14.0 or later"
// hint.
//
// v0.18.0: whole_bot is the only build_pipeline (agnt-api #240). The
// task_manager + phase pipelines are gone from the backend. The CLI
// drops the BUILD_PIPELINES map + the pipelineHint branching; the
// whole_bot label is the only one rendered (legacy rows still carrying
// `phase` or `task_manager` get a "(legacy)" hint so the agent knows
// it's looking at a pre-cut row).

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
    build_pipeline: "whole_bot",
    ...overrides,
  });
}

describe("project show (v0.15.1: unwrap ProjectDetailResponse)", () => {
  describe("build_mode rendering", () => {
    it("surfaces build_mode: platform_agent in human output", async () => {
      nock(API)
        .get("/api/builder/projects/proj_abc")
        .reply(200, fullProject({ build_mode: "platform_agent" }));

      const { stdout, error } = await runCommand(["project", "show", "proj_abc"]);
      expect(error).toBeUndefined();
      expect(stdout).toContain("My Project");
      expect(stdout).toContain("Build mode: platform_agent");
      // Hint mentions cloud agent driving (platform_agent-specific)
      expect(stdout).toContain("cloud agent");
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
    });

    it("surfaces build_mode: local_agent in human output", async () => {
      nock(API)
        .get("/api/builder/projects/proj_abc")
        .reply(200, fullProject({ build_mode: "local_agent" }));

      const { stdout, error } = await runCommand(["project", "show", "proj_abc"]);
      expect(error).toBeUndefined();
      expect(stdout).toContain("Build mode: local_agent");
      // Hint points the agent at the work, not away from it.
      expect(stdout).toContain("YOU build the whole bot");
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

  describe("build_pipeline (v0.18.0: whole_bot only)", () => {
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
      expect(stdout).toContain("YOU build the whole bot");
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
      expect(stdout).toContain("cloud agent drives the build");
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

    it("marks legacy phase / task_manager rows as (legacy)", async () => {
      // Some pre-v0.18.0 rows may still carry `phase` or `task_manager`
      // in the DB — the CLI must NOT crash, and must surface the legacy
      // hint so the agent doesn't assume the modern whole_bot flow.
      nock(API)
        .get("/api/builder/projects/proj_legacy")
        .reply(200, fullProject({
          slug: "legacy-bot",
          build_pipeline: "phase",
        }));

      const { stdout, error } = await runCommand(["project", "show", "proj_legacy"]);
      expect(error).toBeUndefined();
      expect(stdout).toContain("phase");
      expect(stdout).toContain("(legacy");
    });
  });

  it("exposes the real project name (was falling back to slug)", async () => {
    nock(API)
      .get("/api/builder/projects/proj_abc")
      .reply(200, fullProject({ name: "Glower Studio Bot" }));

    const { stdout, error } = await runCommand(["project", "show", "proj_abc"]);
    expect(error).toBeUndefined();
    expect(stdout).toMatch(/^Project: Glower Studio Bot \(my-project\)/m);
    // The name is rendered in the headline; the slug in parens is just a hint.
    expect(stdout.split("\n")[0]).toBe("Project: Glower Studio Bot (my-project)");
  });

  describe("missing build_mode (backward compat)", () => {
    it("defaults to platform_agent when the field is absent", async () => {
      nock(API)
        .get("/api/builder/projects/proj_abc")
        .reply(200, fullProject({ build_mode: undefined }));

      const { stdout, error } = await runCommand(["project", "show", "proj_abc"]);
      expect(error).toBeUndefined();
      expect(stdout).toContain("Build mode: platform_agent");
    });
  });

  describe("missing build_pipeline (v0.18.0 fail-loud)", () => {
    it("defaults to whole_bot when the server omits the field", async () => {
      // v0.18.0: backend ALWAYS stamps build_pipeline=whole_bot on
      // new projects (resolveBuildPipeline in builder_chat.go). If
      // a row is missing it, that's a server bug — but the CLI
      // shouldn't crash. Default to whole_bot (the only legal value
      // for new projects) and let the agent continue.
      nock(API)
        .get("/api/builder/projects/proj_abc")
        .reply(200, fullProject({ build_pipeline: undefined }));

      const { stdout, error } = await runCommand(["project", "show", "proj_abc"]);
      expect(error).toBeUndefined();
      expect(stdout).toContain("Build pipeline: whole_bot");
    });
  });

  describe("error paths", () => {
    it("exits 4 when not found", async () => {
      nock(API)
        .get("/api/builder/projects/proj_nope")
        .reply(404, { error: "not_found" });

      const { error } = await runCommand(["project", "show", "proj_nope"]);
      expect(error?.message).toContain("Project not found");
    });

    it("exits 1 on API error", async () => {
      nock(API)
        .get("/api/builder/projects/proj_boom")
        .reply(500, { error: "boom" });

      const { error } = await runCommand(["project", "show", "proj_boom"]);
      expect(error?.message).toContain("API error");
    });
  });
});