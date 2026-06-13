import { runCommand } from "@oclif/test";
import { describe, it, expect } from "vitest";
import nock from "nock";

const API = "https://api.agnt-gm.ai";

describe("project show (v0.13.0: build_mode, C12)", () => {
  describe("platform_agent (legacy)", () => {
    it("surfaces build_mode: platform_agent in human output", async () => {
      nock(API)
        .get("/api/builder/projects/proj_abc")
        .reply(200, {
          id: "proj_abc",
          slug: "my-project",
          name: "My Project",
          status: "live",
          build_mode: "platform_agent",
        });

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
        .reply(200, {
          id: "proj_abc",
          slug: "my-project",
          name: "My Project",
          status: "live",
          build_mode: "platform_agent",
        });

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
        .reply(200, {
          id: "proj_abc",
          slug: "my-project",
          name: "My Project",
          status: "live",
          build_mode: "local_agent",
        });

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
        .reply(200, {
          id: "proj_abc",
          slug: "my-project",
          name: "My Project",
          status: "live",
          build_mode: "local_agent",
        });

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

  describe("missing build_mode (backward compat)", () => {
    it("defaults to platform_agent when the field is absent", async () => {
      // Older server (pre-#backend-feat) doesn't return build_mode.
      nock(API)
        .get("/api/builder/projects/proj_abc")
        .reply(200, {
          id: "proj_abc",
          slug: "my-project",
          status: "live",
        });

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
