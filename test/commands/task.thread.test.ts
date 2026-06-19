import { runCommand } from "@oclif/test";
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import nock from "nock";
import { saveCredentials, clearCredentials } from "../../src/lib/auth.js";

const API = "https://api.agnt-gm.ai";

describe("task thread (v0.16.0: read comment thread for a task)", () => {
  beforeEach(() => {
    nock.cleanAll();
    saveCredentials({ token: "amk_test", agent_id: "agent-1" });
  });

  afterAll(() => {
    clearCredentials();
  });

  function mockProject(id: string, buildPipeline: "task_manager" | "phase") {
    return nock(API)
      .get(`/api/builder/projects/${id}`)
      .reply(200, {
        project: {
          id,
          slug: id,
          name: id,
          status: "live",
          build_mode: "local_agent",
          build_pipeline: buildPipeline,
        },
        task_count: 7,
      });
  }

  it("renders a chronological list of comments in human output", async () => {
    mockProject("proj_abc", "task_manager");
    nock(API)
      .get("/api/builder/projects/proj_abc/tasks/T01/thread")
      .matchHeader("authorization", /^Bearer amk_/)
      .reply(200, {
        comments: [
          {
            id: 1,
            author_role: "agent",
            author_agent_id: "agent-1",
            kind: "note",
            body_md: "Done; ready for review.",
            created_at: "2026-06-19T10:00:00Z",
          },
          {
            id: 2,
            author_role: "owner",
            author_agent_id: "agent-2",
            kind: "note",
            body_md: "Looks good.\nMerging.",
            created_at: "2026-06-19T11:00:00Z",
          },
        ],
      });

    const { stdout, error } = await runCommand([
      "task",
      "thread",
      "proj_abc",
      "T01",
    ]);
    expect(error).toBeUndefined();
    expect(stdout).toContain("Thread: proj_abc/T01");
    expect(stdout).toContain("agent");
    expect(stdout).toContain("owner");
    expect(stdout).toContain("Done; ready for review.");
    expect(stdout).toContain("Looks good.");
    expect(stdout).toContain("Merging.");
  });

  it("emits the raw comments array in JSON", async () => {
    mockProject("proj_abc", "task_manager");
    nock(API)
      .get("/api/builder/projects/proj_abc/tasks/T01/thread")
      .reply(200, {
        comments: [
          {
            id: 1,
            author_role: "agent",
            kind: "note",
            body_md: "x",
            created_at: "2026-06-19T10:00:00Z",
          },
        ],
      });

    const { stdout, error } = await runCommand([
      "task",
      "thread",
      "proj_abc",
      "T01",
      "--json",
    ]);
    expect(error).toBeUndefined();
    const out = JSON.parse(stdout);
    expect(out.comments).toHaveLength(1);
    expect(out.comments[0].body_md).toBe("x");
  });

  it("prints a friendly 'no comments' message when the thread is empty", async () => {
    mockProject("proj_abc", "task_manager");
    nock(API)
      .get("/api/builder/projects/proj_abc/tasks/T01/thread")
      .reply(200, { comments: [] });

    const { stdout, error } = await runCommand([
      "task",
      "thread",
      "proj_abc",
      "T01",
    ]);
    expect(error).toBeUndefined();
    expect(stdout).toContain("No comments yet");
  });

  it("refuses to run on a phase-pipeline project", async () => {
    mockProject("proj_legacy", "phase");
    const { error } = await runCommand([
      "task",
      "thread",
      "proj_legacy",
      "T01",
    ]);
    expect(error?.oclif?.exit).toBe(1);
  });

  it("exits 4 on not found", async () => {
    mockProject("proj_abc", "task_manager");
    nock(API)
      .get("/api/builder/projects/proj_abc/tasks/T99/thread")
      .reply(404, { error: "task not found" });
    const { error } = await runCommand([
      "task",
      "thread",
      "proj_abc",
      "T99",
    ]);
    expect(error?.oclif?.exit).toBe(4);
  });

  it("exits 3 when not authenticated", async () => {
    clearCredentials();
    const { error } = await runCommand([
      "task",
      "thread",
      "proj_abc",
      "T01",
    ]);
    expect(error?.oclif?.exit).toBe(3);
  });
});
