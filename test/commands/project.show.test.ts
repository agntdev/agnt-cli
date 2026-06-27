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
// the v0.15.1 unwrap bug for months.
//
// v0.18.0: whole_bot is the only build_pipeline (agnt-api #240). The
// task_manager + phase pipelines are gone from the backend.
//
// v0.19.0: `build_mode` (local_agent / platform_agent) is no longer
// surfaced in the human output — the agent just builds the bot, no
// STOP gate, no mode branch. The field is still in the JSON response
// for backward compat with existing scripts.

function wrapped(p: Record<string, unknown>) {
  return { project: p, task_count: 7 };
}

function fullProject(overrides: Record<string, unknown> = {}) {
  return wrapped({
    id: "proj_abc",
    slug: "my-project",
    name: "My Project",
    status: "live",
    build_mode: "platform_agent",  // present in API response but ignored by human output
    build_pipeline: "whole_bot",
    ...overrides,
  });
}

describe("project show (v0.19.0: no build_mode in human output)", () => {
  describe("human output (no build_mode, no mode hint)", () => {
    it("renders name, status, pipeline — no Build mode line", async () => {
      nock(API)
        .get("/api/builder/projects/proj_abc")
        .reply(200, fullProject({ build_mode: "platform_agent" }));

      const { stdout, error } = await runCommand(["project", "show", "proj_abc"]);
      expect(error).toBeUndefined();
      expect(stdout).toContain("My Project");
      expect(stdout).toContain("Status:  live");
      expect(stdout).toContain("Pipeline: whole_bot");
      // v0.19.0: no build_mode line, no mode hint
      expect(stdout).not.toContain("Build mode:");
      expect(stdout).not.toContain("cloud agent drives");
      expect(stdout).not.toContain("YOU build the whole bot");
    });

    it("renders the same output regardless of build_mode value", async () => {
      // Both modes produce identical output — the agent doesn't branch.
      for (const mode of ["platform_agent", "local_agent"] as const) {
        nock(API)
          .get(`/api/builder/projects/proj_${mode}`)
          .reply(200, fullProject({
            slug: `${mode}-bot`,
            name: `${mode} Bot`,
            build_mode: mode,
          }));

        const { stdout, error } = await runCommand(["project", "show", `proj_${mode}`]);
        expect(error).toBeUndefined();
        expect(stdout).toContain(`${mode} Bot`);
        expect(stdout).not.toContain("Build mode:");
      }
    });
  });

  describe("JSON output (build_mode still surfaced for compat)", () => {
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

    it("passes through build_mode in JSON for backward compat", async () => {
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
  });

  describe("quiet mode", () => {
    it("outputs just the project id", async () => {
      // --quiet strips everything except the primary key (id).
      // JSON consumers should use --json instead.
      nock(API)
        .get("/api/builder/projects/proj_abc")
        .reply(200, fullProject({ build_mode: "platform_agent" }));

      const { stdout, error } = await runCommand([
        "project",
        "show",
        "proj_abc",
        "--quiet",
      ]);
      expect(error).toBeUndefined();
      expect(stdout.trim()).toBe("proj_abc");
    });
  });

  describe("legacy rows", () => {
    it("marks legacy phase / task_manager rows as (legacy)", async () => {
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
    expect(stdout.split("\n")[0]).toBe("Project: Glower Studio Bot (my-project)");
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