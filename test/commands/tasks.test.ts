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

  // v0.16.0: --next and --blocked short-circuit the /dag fetch and
  // hit dedicated endpoints. See the human + JSON rendering tests
  // below.
  describe("--next (v0.16.0)", () => {
    it("returns the recommended task in JSON form", async () => {
      nock(API)
        .get("/api/builder/projects/proj_abc/tasks/next")
        .reply(200, {
          task: {
            slug: "T42",
            title: "Add login",
            task_kind: "feature",
          },
        });
      const { stdout, error } = await runCommand([
        "tasks",
        "proj_abc",
        "--next",
        "--json",
      ]);
      expect(error).toBeUndefined();
      const out = JSON.parse(stdout);
      expect(out.next.slug).toBe("T42");
      expect(out.next.title).toBe("Add login");
    });

    it("renders the recommended task in human form", async () => {
      nock(API)
        .get("/api/builder/projects/proj_abc/tasks/next")
        .reply(200, {
          task: {
            slug: "T42",
            title: "Add login",
            task_kind: "feature",
          },
        });
      const { stdout, error } = await runCommand([
        "tasks",
        "proj_abc",
        "--next",
      ]);
      expect(error).toBeUndefined();
      expect(stdout).toContain("Next task to claim");
      expect(stdout).toContain("T42");
      expect(stdout).toContain("Add login");
      expect(stdout).toContain("agnt task claim proj_abc T42");
    });

    it("prints a friendly 'no work' message when the platform returns 204", async () => {
      nock(API)
        .get("/api/builder/projects/proj_abc/tasks/next")
        .reply(204);
      const { stdout, error } = await runCommand([
        "tasks",
        "proj_abc",
        "--next",
      ]);
      expect(error).toBeUndefined();
      expect(stdout).toContain("No recommended next task");
    });

    it("exits 4 when the project is not found", async () => {
      nock(API)
        .get("/api/builder/projects/nope/tasks/next")
        .reply(404, { error: "not_found" });
      const { error } = await runCommand(["tasks", "nope", "--next"]);
      expect(error?.oclif?.exit).toBe(4);
    });
  });

  // v0.16.0: --blocked hits an owner-only endpoint on the backend.
  // Non-owner agents get 403 — we surface that with a clear hint
  // pointing at the default `agnt tasks` view for builder-side
  // "what's claimable" info.
  describe("--blocked (v0.16.0)", () => {
    it("returns the blocked list in JSON form (for owners)", async () => {
      nock(API)
        .get("/api/builder/projects/proj_abc/blocked")
        .reply(200, {
          items: [
            {
              slug: "Q-1",
              title: "What color palette?",
              node_kind: "question",
              status: "open",
              blocked_since: "2026-06-19T10:00:00Z",
            },
          ],
        });
      const { stdout, error } = await runCommand([
        "tasks",
        "proj_abc",
        "--blocked",
        "--json",
      ]);
      expect(error).toBeUndefined();
      const out = JSON.parse(stdout);
      expect(out.items).toHaveLength(1);
      expect(out.items[0].slug).toBe("Q-1");
    });

    it("renders the blocked list in human form (for owners)", async () => {
      nock(API)
        .get("/api/builder/projects/proj_abc/blocked")
        .reply(200, {
          items: [
            {
              slug: "Q-1",
              title: "What color palette?",
              node_kind: "question",
              status: "open",
              blocked_since: "2026-06-19T10:00:00Z",
            },
          ],
        });
      const { stdout, error } = await runCommand([
        "tasks",
        "proj_abc",
        "--blocked",
      ]);
      expect(error).toBeUndefined();
      expect(stdout).toContain("Blocked tasks in proj_abc");
      expect(stdout).toContain("Q-1");
      expect(stdout).toContain("What color palette?");
    });

    it("prints a friendly message when the blocked list is empty", async () => {
      nock(API)
        .get("/api/builder/projects/proj_abc/blocked")
        .reply(200, { items: [] });
      const { stdout, error } = await runCommand([
        "tasks",
        "proj_abc",
        "--blocked",
      ]);
      expect(error).toBeUndefined();
      expect(stdout).toContain("No blocked tasks");
    });

    it("hints at the default view on 403 (non-owner agent)", async () => {
      nock(API)
        .get("/api/builder/projects/proj_abc/blocked")
        .reply(403, { error: "forbidden: not the project owner" });
      const { error } = await runCommand([
        "tasks",
        "proj_abc",
        "--blocked",
      ]);
      expect(error?.oclif?.exit).toBe(1);
      expect(error?.message).toContain("owner-only");
      expect(error?.message).toContain("agnt tasks proj_abc");
    });
  });
});
