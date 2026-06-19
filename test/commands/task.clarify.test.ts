import { runCommand } from "@oclif/test";
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import nock from "nock";
import { saveCredentials, clearCredentials } from "../../src/lib/auth.js";

const API = "https://api.agnt-gm.ai";

describe("task clarify (v0.16.0: blocking Q-task)", () => {
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

  it("creates a Q-task and prints the green check with the question slug", async () => {
    mockProject("proj_abc", "task_manager");
    nock(API)
      .post(
        "/api/builder/projects/proj_abc/tasks/T01/clarify",
        (body: Record<string, unknown>) => {
          // v0.16.0: an idempotency_key derived from sha256(project:slug:question)
          // is always sent.
          return (
            body.question_title ===
              "Should the booking persist for 30 days or forever?" &&
            typeof body.idempotency_key === "string" &&
            (body.idempotency_key as string).length === 16
          );
        },
      )
      .matchHeader("authorization", /^Bearer amk_/)
      .reply(201, {
        question_task: { slug: "Q-abc-1", title: "Should the booking..." },
        blocked_task: { slug: "T01", status: "blocked" },
      });

    const { stdout, error } = await runCommand([
      "task",
      "clarify",
      "proj_abc",
      "T01",
      '"Should the booking persist for 30 days or forever?"',
    ]);
    expect(error).toBeUndefined();
    expect(stdout).toContain("Question task created");
    expect(stdout).toContain("Q-abc-1");
    expect(stdout).toContain("T01");
  });

  it("uses --body for the longer-form markdown when provided", async () => {
    mockProject("proj_abc", "task_manager");
    nock(API)
      .post(
        "/api/builder/projects/proj_abc/tasks/T01/clarify",
        (body: Record<string, unknown>) => {
          return body.question_body_md === "longer-form body";
        },
      )
      .reply(201, {
        question_task: { slug: "Q-x", title: "x" },
        blocked_task: { slug: "T01", status: "blocked" },
      });

    const { stdout, error } = await runCommand([
      "task",
      "clarify",
      "proj_abc",
      "T01",
      '"short title"',
      "--body",
      '"longer-form body"',
    ]);
    expect(error).toBeUndefined();
    expect(stdout).toContain("Q-x");
  });

  it("rejects an empty question", async () => {
    mockProject("proj_abc", "task_manager");
    // oclif rejects empty/whitespace positional args before run().
    const { error } = await runCommand([
      "task",
      "clarify",
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
      "clarify",
      "proj_legacy",
      "T01",
      "hi",
    ]);
    expect(error?.oclif?.exit).toBe(1);
  });

  it("handles 409 (idempotent retry returns the same Q-task)", async () => {
    mockProject("proj_abc", "task_manager");
    nock(API)
      .post("/api/builder/projects/proj_abc/tasks/T01/clarify")
      .reply(409, { error: "Q-task Q-abc-1 already exists for this question" });

    const { error } = await runCommand([
      "task",
      "clarify",
      "proj_abc",
      "T01",
      '"Should the booking persist for 30 days or forever?"',
    ]);
    expect(error?.oclif?.exit).toBe(1);
    expect(error?.message).toContain("already exists");
  });

  it("exits 4 on not found", async () => {
    mockProject("proj_abc", "task_manager");
    nock(API)
      .post("/api/builder/projects/proj_abc/tasks/T99/clarify")
      .reply(404, { error: "task not found" });
    const { error } = await runCommand([
      "task",
      "clarify",
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
      "clarify",
      "proj_abc",
      "T01",
      "hi",
    ]);
    expect(error?.oclif?.exit).toBe(3);
  });
});
