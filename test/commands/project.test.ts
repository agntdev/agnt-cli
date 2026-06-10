import { runCommand } from "@oclif/test";
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import nock from "nock";
import { clearCredentials } from "../../src/lib/auth.js";

const API = "https://api.agnt-gm.ai";

describe("project", () => {
  beforeEach(() => {
    nock.cleanAll();
  });

  afterAll(() => {
    clearCredentials();
  });

  describe("list", () => {
    it("returns projects", async () => {
      nock(API)
        .get("/api/builder/projects?limit=20")
        .reply(200, {
          projects: [
            { id: "proj_1", name: "DeFi Aggregator", status: "live" },
            { id: "proj_2", name: "CLI Tool", status: "draft" },
          ],
          total: 2,
        });

      const { stdout, error } = await runCommand(["project", "list", "--json"]);
      expect(error).toBeUndefined();

      const out = JSON.parse(stdout);
      expect(out.projects).toHaveLength(2);
      expect(out.projects[0].id).toBe("proj_1");
    });

    it("filters by status", async () => {
      const scope = nock(API)
        .get("/api/builder/projects?limit=20&status=live")
        .reply(200, { projects: [], total: 0 });

      await runCommand(["project", "list", "--status", "live", "--json"]);
      expect(scope.isDone()).toBe(true);
    });

    it("exits 2 for --limit 0", async () => {
      const { error } = await runCommand(["project", "list", "--limit", "0"]);
      expect(error?.oclif?.exit).toBe(2);
    });

    it("exits 1 on API error", async () => {
      nock(API)
        .get("/api/builder/projects?limit=20")
        .reply(500, { error: "down" });
      const { error } = await runCommand(["project", "list"]);
      expect(error?.oclif?.exit).toBe(1);
    });
  });

  describe("show", () => {
    it("returns project by id", async () => {
      nock(API).get("/api/builder/projects/proj_abc").reply(200, {
        id: "proj_abc",
        name: "My Project",
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
      expect(out.id).toBe("proj_abc");
    });

    it("exits 4 when not found", async () => {
      nock(API)
        .get("/api/builder/projects/nope")
        .reply(404, { error: "not_found" });
      const { error } = await runCommand(["project", "show", "nope"]);
      expect(error?.oclif?.exit).toBe(4);
    });

    it("requires project id", async () => {
      const { error } = await runCommand(["project", "show"]);
      expect(error?.oclif?.exit).toBe(2);
    });
  });

});
