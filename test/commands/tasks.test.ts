import { runCommand } from "@oclif/test";
import { describe, it, expect, beforeEach } from "vitest";
import nock from "nock";
import { saveCredentials, clearCredentials } from "../../src/lib/auth.js";

const API = "https://api.agnt-gm.ai";

describe("tasks", () => {
  beforeEach(() => {
    nock.cleanAll();
    clearCredentials();
  });

  describe("default (full graph)", () => {
    it("returns the full DAG JSON by default", async () => {
      nock(API)
        .get("/api/builder/projects/hydrationhelper/dag")
        .reply(200, {
          project_id: "proj_1",
          project_slug: "hydrationhelper",
          current_phase: "design",
          phase_status: "active",
          tasks: [
            {
              slug: "T901",
              title: "Author the design doc",
              task_kind: "doc",
              status: "open",
              claimable: true,
            },
            {
              slug: "T902",
              title: "Write tests",
              task_kind: "test",
              status: "open",
              claimable: false,
              claim_reason: "blocked by T901 (not merged)",
            },
          ],
        });

      const { stdout, error } = await runCommand([
        "tasks",
        "hydrationhelper",
        "--json",
      ]);
      expect(error).toBeUndefined();

      const out = JSON.parse(stdout);
      expect(out.project_slug).toBe("hydrationhelper");
      expect(out.tasks).toHaveLength(2);
    });
  });

  describe("--status filter", () => {
    it("filters tasks by status in the CLI (no extra round-trip)", async () => {
      // One /dag call, then narrow in-memory.
      const scope = nock(API)
        .get("/api/builder/projects/proj_abc/dag")
        .reply(200, {
          project_slug: "proj_abc",
          current_phase: "dev",
          phase_status: "active",
          tasks: [
            { slug: "T01", title: "Add login", task_kind: "feature", status: "open" },
            { slug: "T02", title: "Add dashboard", task_kind: "feature", status: "in_progress" },
            { slug: "T03", title: "Polish", task_kind: "feature", status: "open" },
          ],
        });

      const { stdout, error } = await runCommand([
        "tasks",
        "proj_abc",
        "--status",
        "open",
        "--json",
      ]);
      expect(error).toBeUndefined();
      expect(scope.isDone()).toBe(true);

      const out = JSON.parse(stdout);
      expect(out.tasks).toHaveLength(2);
      expect(out.tasks.map((t: { slug: string }) => t.slug)).toEqual(["T01", "T03"]);
    });
  });

  describe("--kind filter", () => {
    it("filters tasks by task_kind in the CLI", async () => {
      nock(API)
        .get("/api/builder/projects/proj_abc/dag")
        .reply(200, {
          project_slug: "proj_abc",
          current_phase: "dev",
          phase_status: "active",
          tasks: [
            { slug: "T01", title: "Add login", task_kind: "feature", status: "open" },
            { slug: "T02", title: "Add dashboard", task_kind: "foundation", status: "open" },
            { slug: "T03", title: "Polish", task_kind: "feature", status: "open" },
          ],
        });

      const { stdout, error } = await runCommand([
        "tasks",
        "proj_abc",
        "--kind",
        "feature",
        "--json",
      ]);
      expect(error).toBeUndefined();

      const out = JSON.parse(stdout);
      expect(out.tasks).toHaveLength(2);
      expect(out.tasks.map((t: { slug: string }) => t.slug)).toEqual(["T01", "T03"]);
    });
  });

  describe("--summary (TTY debug table)", () => {
    it("renders end-to-end with --summary on a TTY", async () => {
      const scope = nock(API)
        .get("/api/builder/projects/hydrationhelper/dag")
        .reply(200, {
          project_slug: "hydrationhelper",
          current_phase: "design",
          phase_status: "active",
          tasks: [
            {
              slug: "T901",
              title: "Author the design doc",
              task_kind: "doc",
              status: "open",
              claimable: true,
            },
            {
              slug: "T902",
              title: "Write tests",
              task_kind: "test",
              status: "open",
              claimable: false,
              claim_reason: "blocked by T901 (not merged)",
            },
          ],
        });

      const { error } = await runCommand([
        "tasks",
        "hydrationhelper",
        "--summary",
      ]);
      expect(error).toBeUndefined();
      expect(scope.isDone()).toBe(true);
    });
  });

  describe("--mine", () => {
    it("filters to my active claims via per-task /tasks/:slug N+1", async () => {
      saveCredentials({ token: "amk_test", agent_id: "agent-1" });

      nock(API)
        .get("/api/builder/projects/proj_abc/dag")
        .reply(200, {
          project_slug: "proj_abc",
          current_phase: "design",
          phase_status: "active",
          tasks: [
            { slug: "T01", title: "Add login", claimable: true },
            { slug: "T02", title: "Add dashboard", claimable: true },
          ],
        });

      nock(API)
        .get("/api/builder/agents/me")
        .reply(200, { agent: { id: "agent-1", github_username: "alice" } });

      nock(API)
        .get("/api/builder/projects/proj_abc/tasks/T01")
        .reply(200, {
          task: {
            slug: "T01",
            title: "Add login",
            status: "open",
            is_claimed: true,
            claimers: [
              { agent_id: "agent-1", username: "alice", claimed_at: "t1", expires_at: "t2" },
            ],
          },
        });

      nock(API)
        .get("/api/builder/projects/proj_abc/tasks/T02")
        .reply(200, {
          task: {
            slug: "T02",
            title: "Add dashboard",
            status: "open",
            is_claimed: true,
            claimers: [
              { agent_id: "agent-2", username: "bob", claimed_at: "t1", expires_at: "t2" },
            ],
          },
        });

      const { stdout, error } = await runCommand([
        "tasks",
        "proj_abc",
        "--mine",
        "--json",
      ]);
      expect(error).toBeUndefined();

      const out = JSON.parse(stdout);
      expect(out.tasks).toHaveLength(1);
      expect(out.tasks[0].slug).toBe("T01");
    });

    it("exits 3 when not authenticated and --mine is set", async () => {
      nock(API)
        .get("/api/builder/projects/proj_abc/dag")
        .reply(200, {
          project_slug: "proj_abc",
          current_phase: "design",
          phase_status: "active",
          tasks: [],
        });

      const { error } = await runCommand(["tasks", "proj_abc", "--mine"]);
      expect(error?.oclif?.exit).toBe(3);
    });
  });

  describe("error paths", () => {
    it("exits 4 when project not found", async () => {
      nock(API).get("/api/builder/projects/nope/dag").reply(404, { error: "not_found" });
      const { error } = await runCommand(["tasks", "nope"]);
      expect(error?.oclif?.exit).toBe(4);
    });

    it("exits 1 on API error", async () => {
      nock(API).get("/api/builder/projects/proj_abc/dag").reply(500, { error: "down" });
      const { error } = await runCommand(["tasks", "proj_abc"]);
      expect(error?.oclif?.exit).toBe(1);
    });

    it("requires project id", async () => {
      const { error } = await runCommand(["tasks"]);
      expect(error?.oclif?.exit).toBe(2);
    });
  });

  describe("dag/show is gone", () => {
    it("404s on the old command", async () => {
      const { error } = await runCommand(["dag", "show", "proj_abc"]);
      expect(error?.oclif?.exit).toBeGreaterThanOrEqual(1);
    });
  });

  describe("task/list is gone", () => {
    it("404s on the old command", async () => {
      const { error } = await runCommand(["task", "list", "proj_abc"]);
      expect(error?.oclif?.exit).toBeGreaterThanOrEqual(1);
    });
  });
});
