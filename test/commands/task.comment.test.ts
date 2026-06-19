import { runCommand } from "@oclif/test";
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import nock from "nock";
import { saveCredentials, clearCredentials } from "../../src/lib/auth.js";

const API = "https://api.agnt-gm.ai";

describe("task comment (v0.16.0: persistent note on a task)", () => {
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

  it("posts a comment and prints the green check with the comment id", async () => {
    mockProject("proj_abc", "task_manager");
    nock(API)
      .post("/api/builder/projects/proj_abc/tasks/T01/comments", {
        body_md: "FYI the spec was ambiguous about X, chose Y",
      })
      .matchHeader("authorization", /^Bearer amk_/)
      .reply(200, { ok: true, comment_id: 1234 });

    const { stdout, error } = await runCommand([
      "task",
      "comment",
      "proj_abc",
      "T01",
      '"FYI the spec was ambiguous about X, chose Y"',
    ]);
    expect(error).toBeUndefined();
    expect(stdout).toContain("Comment posted to T01");
    expect(stdout).toContain("id: 1234");
  });

  it("uses --body for the longer-form markdown when provided", async () => {
    mockProject("proj_abc", "task_manager");
    nock(API)
      .post(
        "/api/builder/projects/proj_abc/tasks/T01/comments",
        (body: { body_md: string }) => {
          return body.body_md === "longer-form body text";
        },
      )
      .reply(200, { ok: true, comment_id: 99 });

    const { stdout, error } = await runCommand([
      "task",
      "comment",
      "proj_abc",
      "T01",
      "positional",
      "--body",
      '"longer-form body text"',
    ]);
    expect(error).toBeUndefined();
    expect(stdout).toContain("id: 99");
  });

  it("rejects an empty comment message", async () => {
    mockProject("proj_abc", "task_manager");
    // No POST mock — should never reach the API.

    // oclif rejects empty/whitespace positional args before run()
    // ("Missing 1 required arg"). The in-run guard is the fallback
    // for --body which oclif doesn't validate.
    const { error } = await runCommand([
      "task",
      "comment",
      "proj_abc",
      "T01",
      "   ",
    ]);
    expect(error?.oclif?.exit).toBe(2);
  });

  it("refuses to run on a phase-pipeline project", async () => {
    mockProject("proj_legacy", "phase");
    const { error } = await runCommand([
      "task",
      "comment",
      "proj_legacy",
      "T01",
      "hi",
    ]);
    expect(error?.oclif?.exit).toBe(1);
    expect(error?.message).toContain("task_manager-only");
  });

  it("exits 4 on not found", async () => {
    mockProject("proj_abc", "task_manager");
    nock(API)
      .post("/api/builder/projects/proj_abc/tasks/T99/comments")
      .reply(404, { error: "task not found" });
    const { error } = await runCommand([
      "task",
      "comment",
      "proj_abc",
      "T99",
      "hi",
    ]);
    expect(error?.oclif?.exit).toBe(4);
  });

  it("exits 3 when not authenticated", async () => {
    clearCredentials();
    const { error } = await runCommand([
      "task",
      "comment",
      "proj_abc",
      "T01",
      "hi",
    ]);
    expect(error?.oclif?.exit).toBe(3);
  });
});
