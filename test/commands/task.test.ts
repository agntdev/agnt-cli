import { runCommand } from "@oclif/test";
import { describe, it, expect, beforeEach } from "vitest";
import nock from "nock";
import { saveCredentials } from "../../src/lib/auth.js";

const API = "https://api.agnt-gm.ai";

describe("task", () => {
  beforeEach(() => {
    nock.cleanAll();
  });

  describe("list", () => {
    it("returns tasks", async () => {
      nock(API)
        .get("/api/builder/projects/proj_abc/tasks")
        .reply(200, {
          tasks: [
            { slug: "T01", title: "Add login", status: "open" },
            { slug: "T02", title: "Add dashboard", status: "in_progress" },
          ],
        });

      const { stdout, error } = await runCommand([
        "task",
        "list",
        "proj_abc",
        "--json",
      ]);
      expect(error).toBeUndefined();

      const out = JSON.parse(stdout);
      expect(out.tasks).toHaveLength(2);
      expect(out.tasks[0].slug).toBe("T01");
    });

    it("filters by status", async () => {
      const scope = nock(API)
        .get("/api/builder/projects/proj_abc/tasks?status=open")
        .reply(200, { tasks: [] });

      await runCommand([
        "task",
        "list",
        "proj_abc",
        "--status",
        "open",
        "--json",
      ]);
      expect(scope.isDone()).toBe(true);
    });

    it("requires project id", async () => {
      const { error } = await runCommand(["task", "list"]);
      expect(error?.oclif?.exit).toBe(2);
    });

    it("exits 1 on API error", async () => {
      nock(API)
        .get("/api/builder/projects/proj_abc/tasks")
        .reply(500, { error: "down" });
      const { error } = await runCommand(["task", "list", "proj_abc"]);
      expect(error?.oclif?.exit).toBe(1);
    });
  });

  describe("show", () => {
    it("returns task details", async () => {
      nock(API)
        .get("/api/builder/projects/proj_abc/tasks/T01")
        .reply(200, {
          task: {
            slug: "T01",
            title: "Add login",
            body_md: "# Login\nImplement OAuth",
            status: "open",
          },
        });

      const { stdout, error } = await runCommand([
        "task",
        "show",
        "proj_abc",
        "T01",
        "--json",
      ]);
      expect(error).toBeUndefined();

      const out = JSON.parse(stdout);
      expect(out.task.slug).toBe("T01");
      expect(out.task.body_md).toContain("OAuth");
    });

    it("outputs only body_md with --body flag", async () => {
      nock(API)
        .get("/api/builder/projects/proj_abc/tasks/T01")
        .reply(200, {
          task: {
            slug: "T01",
            title: "Add login",
            body_md: "# Markdown body",
            status: "open",
          },
        });

      const { stdout, error } = await runCommand([
        "task",
        "show",
        "proj_abc",
        "T01",
        "--body",
      ]);
      expect(error).toBeUndefined();
      expect(stdout).toBe("# Markdown body");
    });

    it("exits 4 when not found", async () => {
      nock(API)
        .get("/api/builder/projects/proj_abc/tasks/T99")
        .reply(404, { error: "not_found" });
      const { error } = await runCommand(["task", "show", "proj_abc", "T99"]);
      expect(error?.oclif?.exit).toBe(4);
    });

    it("requires args", async () => {
      const { error } = await runCommand(["task", "show"]);
      expect(error?.oclif?.exit).toBe(2);
    });
  });

  describe("create", () => {
    beforeEach(() => {
      saveCredentials({ token: "amk_test", agent_id: "agent-1" });
    });

    it("creates a task", async () => {
      nock(API)
        .post("/api/builder/projects/proj_abc/stages/1/add-tasks", (body) => {
          return (
            body.tasks[0].title === "FixBug" &&
            body.tasks[0].weight_within_new === 0.5 &&
            body.delta_ton_nano === 100
          );
        })
        .matchHeader("authorization", /^Bearer amk_/)
        .reply(200, {
          tasks: [{ slug: "T03", title: "FixBug", status: "open" }],
        });

      const { stdout, error } = await runCommand([
        "task",
        "create",
        "proj_abc",
        "--stage",
        "1",
        "--title",
        "FixBug",
        "--body-md",
        "FixTheThing",
        "--weight",
        "0.5",
        "--ton",
        "100",
        "--difficulty",
        "easy",
        "--json",
      ]);

      expect(error).toBeUndefined();
      const out = JSON.parse(stdout);
      expect(out.tasks[0].slug).toBe("T03");
    });

    it("exits 4 when stage not found", async () => {
      nock(API)
        .post("/api/builder/projects/proj_abc/stages/99/add-tasks")
        .matchHeader("authorization", /^Bearer amk_/)
        .reply(404, { error: "not_found" });

      const { error } = await runCommand([
        "task",
        "create",
        "proj_abc",
        "--stage",
        "99",
        "--title",
        "FixBug",
        "--body-md",
        "Details",
        "--weight",
        "0.5",
        "--ton",
        "100",
      ]);
      expect(error?.oclif?.exit).toBe(4);
    });

    it("exits 2 for invalid weight", async () => {
      const { error } = await runCommand([
        "task",
        "create",
        "proj_abc",
        "--stage",
        "1",
        "--title",
        "FixBug",
        "--body-md",
        "Details",
        "--weight",
        "2.0",
        "--ton",
        "100",
      ]);
      expect(error?.oclif?.exit).toBe(2);
    });
  });
});
