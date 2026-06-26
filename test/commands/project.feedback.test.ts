import { runCommand } from "@oclif/test";
import { describe, it, expect, beforeEach } from "vitest";
import nock from "nock";
import { clearCredentials, saveCredentials } from "../../src/lib/auth.js";

const API = "https://api.agnt-gm.ai";

describe("project feedback (v0.18.0: 'Ship an update' for whole_bot)", () => {
  beforeEach(() => {
    nock.cleanAll();
    clearCredentials();
    saveCredentials({ token: "amk_test", agent_id: "agent-1" });
  });

  it("POSTs the feedback text and renders a green confirmation", async () => {
    nock(API)
      .post(
        "/api/builder/projects/proj_wb/feedback",
        (body: Record<string, unknown>) => body.text === "add_refund",
      )
      .reply(202, { ok: true, enqueued: true });

    const { stdout, error } = await runCommand([
      "project",
      "feedback",
      "proj_wb",
      "add_refund",
    ]);
    expect(error).toBeUndefined();
    expect(stdout).toContain("Update enqueued");
    expect(stdout).toContain("re-enters building");
  });

  it("exits 9 when a build is already running (409)", async () => {
    nock(API)
      .post("/api/builder/projects/proj_wb/feedback")
      .reply(409, { error: "a build is already in progress" });

    const { error } = await runCommand([
      "project",
      "feedback",
      "proj_wb",
      "add_refund",
    ]);
    expect(error?.message).toContain("already in progress");
  });

  it("exits 4 when project not found or not a whole_bot (404)", async () => {
    nock(API)
      .post("/api/builder/projects/proj_legacy/feedback")
      .reply(404, { error: "this project type does not support updates" });

    const { error } = await runCommand([
      "project",
      "feedback",
      "proj_legacy",
      "add_refund",
    ]);
    expect(error?.message).toContain("not a whole_bot");
  });

  it("JSON output pins enqueued + project", async () => {
    nock(API)
      .post("/api/builder/projects/proj_wb/feedback")
      .reply(202, { ok: true });

    const { stdout, error } = await runCommand([
      "project",
      "feedback",
      "proj_wb",
      "add_refund",
      "--json",
    ]);
    expect(error).toBeUndefined();
    const out = JSON.parse(stdout);
    expect(out.enqueued).toBe(true);
    expect(out.project).toBe("proj_wb");
  });

  it("refuses when text arg is missing (exit 2)", async () => {
    const { error } = await runCommand([
      "project",
      "feedback",
      "proj_wb",
    ]);
    expect(error?.message).toMatch(/Missing.*arg|required/i);
  });
});