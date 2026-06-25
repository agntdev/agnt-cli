import { runCommand } from "@oclif/test";
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import nock from "nock";
import { saveCredentials, clearCredentials } from "../../src/lib/auth.js";

const API = "https://api.agnt-gm.ai";

describe("task submit (v0.16.0: register PR URL with platform)", () => {
  beforeEach(() => {
    nock.cleanAll();
    saveCredentials({ token: "amk_test", agent_id: "agent-1" });
  });

  afterAll(() => {
    clearCredentials();
  });

  // Helper: the project fetch that fetchProjectBuildPipeline makes.
  // Every submit/cancel/comment/progress/clarify/thread call goes
  // through this. test_manager projects get the command run; phase
  // projects get the "task_manager-only" error.
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

  it("registers a PR URL and prints the green check", async () => {
    mockProject("proj_abc", "task_manager");
    nock(API)
      .post("/api/builder/projects/proj_abc/tasks/T01/pr", {
        pr_url: "https://github.com/owner/repo/pull/42",
      })
      .matchHeader("authorization", /^Bearer amk_/)
      .reply(200, { pr_number: 42, status: "in_review" });

    const { stdout, error } = await runCommand([
      "task",
      "submit",
      "proj_abc",
      "T01",
      "https://github.com/owner/repo/pull/42",
    ]);
    expect(error).toBeUndefined();
    expect(stdout).toContain("Registered PR #42");
    expect(stdout).toContain("proj_abc/T01");
    expect(stdout).toContain("in_review");
  });

  it("emits JSON when --json is passed", async () => {
    mockProject("proj_abc", "task_manager");
    nock(API)
      .post("/api/builder/projects/proj_abc/tasks/T01/pr")
      .reply(200, { pr_number: 7, status: "in_review" });

    const { stdout, error } = await runCommand([
      "task",
      "submit",
      "proj_abc",
      "T01",
      "https://github.com/owner/repo/pull/7",
      "--json",
    ]);
    expect(error).toBeUndefined();
    const out = JSON.parse(stdout);
    expect(out.pr_number).toBe(7);
    expect(out.status).toBe("in_review");
  });

  it("refuses to run on a phase-pipeline project", async () => {
    // /submit is task_manager-only; the backend would 4xx, but we
    // catch it client-side with assertTaskManager.
    mockProject("proj_legacy", "phase");

    const { error } = await runCommand([
      "task",
      "submit",
      "proj_legacy",
      "T01",
      "https://github.com/owner/repo/pull/1",
    ]);
    expect(error).toBeDefined();
    expect(error?.message).toContain("task_manager-only");
  });

  // v0.17.0: whole_bot is the third "this isn't task_manager" reason.
  // The error should point the agent at `agnt project show` (the platform
  // drives the loop; no individual tasks to claim).
  it("refuses to run on a whole_bot project (v0.17.0)", async () => {
    mockProject("proj_wb", "whole_bot");

    const { error } = await runCommand([
      "task",
      "submit",
      "proj_wb",
      "T01",
      "https://github.com/owner/repo/pull/1",
    ]);
    expect(error).toBeDefined();
    expect(error?.message).toContain("task_manager-only");
    expect(error?.message).toContain("whole_bot");
    expect(error?.message).toContain("agnt project show");
  });

  it("exits 4 when project or task not found", async () => {
    mockProject("proj_abc", "task_manager");
    nock(API)
      .post("/api/builder/projects/proj_abc/tasks/T99/pr")
      .reply(404, { error: "task not found" });

    const { error } = await runCommand([
      "task",
      "submit",
      "proj_abc",
      "T99",
      "https://github.com/owner/repo/pull/1",
    ]);
    expect(error?.oclif?.exit).toBe(4);
  });

  it("exits 1 on a generic API error", async () => {
    mockProject("proj_abc", "task_manager");
    nock(API)
      .post("/api/builder/projects/proj_abc/tasks/T01/pr")
      .reply(500, { error: "down" });

    const { error } = await runCommand([
      "task",
      "submit",
      "proj_abc",
      "T01",
      "https://github.com/owner/repo/pull/1",
    ]);
    expect(error?.oclif?.exit).toBe(1);
  });

  it("exits 3 when not authenticated", async () => {
    clearCredentials();
    const { error } = await runCommand([
      "task",
      "submit",
      "proj_abc",
      "T01",
      "https://github.com/owner/repo/pull/1",
    ]);
    expect(error?.oclif?.exit).toBe(3);
  });
});
