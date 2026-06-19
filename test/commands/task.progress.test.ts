import { runCommand } from "@oclif/test";
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import nock from "nock";
import { saveCredentials, clearCredentials } from "../../src/lib/auth.js";

const API = "https://api.agnt-gm.ai";

describe("task progress (v0.16.0: ephemeral chat progress message)", () => {
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

  it("posts a progress note and prints the green check", async () => {
    mockProject("proj_abc", "task_manager");
    nock(API)
      .post("/api/builder/projects/proj_abc/tasks/T01/progress", {
        note: "50% done, switching to test phase",
      })
      .matchHeader("authorization", /^Bearer amk_/)
      .reply(200, { ok: true });

    const { stdout, error } = await runCommand([
      "task",
      "progress",
      "proj_abc",
      "T01",
      '"50% done, switching to test phase"',
    ]);
    expect(error).toBeUndefined();
    expect(stdout).toContain("Progress note posted to T01");
  });

  it("rejects an empty progress message", async () => {
    mockProject("proj_abc", "task_manager");
    // No POST mock — should never reach the API.

    // oclif rejects empty/whitespace positional args before run().
    const { error } = await runCommand([
      "task",
      "progress",
      "proj_abc",
      "T01",
      "  ",
    ]);
    expect(error?.oclif?.exit).toBe(2);
  });

  it("refuses to run on a phase-pipeline project", async () => {
    mockProject("proj_legacy", "phase");
    const { error } = await runCommand([
      "task",
      "progress",
      "proj_legacy",
      "T01",
      "hi",
    ]);
    expect(error?.oclif?.exit).toBe(1);
  });

  it("exits 4 on not found", async () => {
    mockProject("proj_abc", "task_manager");
    nock(API)
      .post("/api/builder/projects/proj_abc/tasks/T99/progress")
      .reply(404, { error: "task not found" });
    const { error } = await runCommand([
      "task",
      "progress",
      "proj_abc",
      "T99",
      "hi",
    ]);
    expect(error?.oclif?.exit).toBe(4);
  });

  it("exits 1 on generic API error", async () => {
    mockProject("proj_abc", "task_manager");
    nock(API)
      .post("/api/builder/projects/proj_abc/tasks/T01/progress")
      .reply(500, { error: "down" });
    const { error } = await runCommand([
      "task",
      "progress",
      "proj_abc",
      "T01",
      "hi",
    ]);
    expect(error?.oclif?.exit).toBe(1);
  });

  it("exits 3 when not authenticated", async () => {
    clearCredentials();
    const { error } = await runCommand([
      "task",
      "progress",
      "proj_abc",
      "T01",
      "hi",
    ]);
    expect(error?.oclif?.exit).toBe(3);
  });
});
