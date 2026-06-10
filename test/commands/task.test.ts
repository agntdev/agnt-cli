import { runCommand } from "@oclif/test";
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import nock from "nock";
import { saveCredentials, clearCredentials } from "../../src/lib/auth.js";

const API = "https://api.agnt-gm.ai";

describe("task", () => {
  beforeEach(() => {
    nock.cleanAll();
  });

  afterAll(() => {
    clearCredentials();
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

    it("filters to claimable only via /dag when --claimable is set", async () => {
      nock(API)
        .get("/api/builder/projects/proj_abc/dag")
        .reply(200, {
          project_id: "proj_abc",
          project_slug: "proj_abc",
          current_phase: "dev",
          phase_status: "active",
          tasks: [
            {
              slug: "T01",
              title: "Add login",
              task_kind: "foundation",
              phase: "dev",
              status: "open",
              depends_on: [],
              claimable: true,
            },
            {
              slug: "T02",
              title: "Add dashboard",
              task_kind: "feature",
              phase: "dev",
              status: "open",
              depends_on: ["T01"],
              claimable: false,
              claim_reason: "blocked by T01 (not merged)",
            },
            {
              slug: "T03",
              title: "Polish",
              task_kind: "feature",
              phase: "dev",
              status: "open",
              depends_on: ["T01"],
              claimable: true,
            },
          ],
        });

      const { stdout, error } = await runCommand([
        "task",
        "list",
        "proj_abc",
        "--claimable",
        "--json",
      ]);
      expect(error).toBeUndefined();

      const out = JSON.parse(stdout);
      expect(out.filter).toBe("claimable");
      expect(out.current_phase).toBe("dev");
      expect(out.total).toBe(2);
      expect(out.tasks.map((t: { slug: string }) => t.slug)).toEqual([
        "T01",
        "T03",
      ]);
    });

    it("exits 4 when project not found with --claimable", async () => {
      nock(API)
        .get("/api/builder/projects/nope/dag")
        .reply(404, { error: "not_found" });
      const { error } = await runCommand([
        "task",
        "list",
        "nope",
        "--claimable",
      ]);
      expect(error?.oclif?.exit).toBe(4);
    });

    it("exits 1 on /dag API error with --claimable", async () => {
      nock(API)
        .get("/api/builder/projects/proj_abc/dag")
        .reply(500, { error: "down" });
      const { error } = await runCommand([
        "task",
        "list",
        "proj_abc",
        "--claimable",
      ]);
      expect(error?.oclif?.exit).toBe(1);
    });
  });

  describe("claim", () => {
    beforeEach(() => {
      saveCredentials({ token: "amk_test", agent_id: "agent-1" });
    });

    it("claims a task and returns the response", async () => {
      const scope = nock(API)
        .post("/api/builder/projects/proj_abc/tasks/T01/claim")
        .matchHeader("authorization", /^Bearer amk_/)
        .reply(200, {
          ok: true,
          task_id: "task_1",
          slug: "T01",
          claimed_by_you: true,
          claim_expires_at: "2026-06-10T15:00:00Z",
          claimers_count: 1,
          claimers: [
            {
              agent_id: "agent-1",
              username: "alice",
              claimed_at: "2026-06-10T13:00:00Z",
              expires_at: "2026-06-10T15:00:00Z",
            },
          ],
          note: "Claimed for 2h (advisory — not a lock).",
        });

      const { stdout, error } = await runCommand([
        "task",
        "claim",
        "proj_abc",
        "T01",
        "--json",
      ]);
      expect(error).toBeUndefined();
      expect(scope.isDone()).toBe(true);

      const out = JSON.parse(stdout);
      expect(out.claimed_by_you).toBe(true);
      expect(out.claimers_count).toBe(1);
    });

    it("shows multi-claimer warning in human output", async () => {
      nock(API)
        .post("/api/builder/projects/proj_abc/tasks/T01/claim")
        .reply(200, {
          ok: true,
          slug: "T01",
          claimed_by_you: true,
          claim_expires_at: "2026-06-10T15:00:00Z",
          claimers_count: 3,
          claimers: [
            { agent_id: "a", username: "alice", claimed_at: "2026-06-10T13:00:00Z", expires_at: "2026-06-10T15:00:00Z" },
            { agent_id: "b", username: "bob", claimed_at: "2026-06-10T13:30:00Z", expires_at: "2026-06-10T15:30:00Z" },
            { agent_id: "c", username: "carol", claimed_at: "2026-06-10T14:00:00Z", expires_at: "2026-06-10T16:00:00Z" },
          ],
          note: "3 agents are working on this",
        });

      const { stdout, error } = await runCommand([
        "task",
        "claim",
        "proj_abc",
        "T01",
      ]);
      expect(error).toBeUndefined();
      expect(stdout).toContain("Claimed");
      expect(stdout).toContain("T01");
      expect(stdout).toContain("2 other agents");
    });

    it("exits 3 when not authenticated", async () => {
      const { clearCredentials } = await import("../../src/lib/auth.js");
      clearCredentials();

      const { error } = await runCommand([
        "task",
        "claim",
        "proj_abc",
        "T01",
      ]);
      expect(error?.oclif?.exit).toBe(3);
    });

    it("exits 4 when project or task not found", async () => {
      nock(API)
        .post("/api/builder/projects/proj_abc/tasks/T99/claim")
        .reply(404, { error: "project or task not found" });

      const { error } = await runCommand([
        "task",
        "claim",
        "proj_abc",
        "T99",
      ]);
      expect(error?.oclif?.exit).toBe(4);
    });

    it("exits 1 when task is not claimable (phase / dep / status gate)", async () => {
      nock(API)
        .post("/api/builder/projects/proj_abc/tasks/T01/claim")
        .reply(409, { error: "blocked by T00 (not merged)" });

      const { error } = await runCommand([
        "task",
        "claim",
        "proj_abc",
        "T01",
      ]);
      expect(error?.oclif?.exit).toBe(1);
    });

    it("requires project id and slug args", async () => {
      const { error } = await runCommand(["task", "claim"]);
      expect(error?.oclif?.exit).toBe(2);
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
});
