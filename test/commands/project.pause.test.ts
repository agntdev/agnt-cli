import { runCommand } from "@oclif/test";
import { describe, it, expect, beforeEach } from "vitest";
import nock from "nock";
import { clearCredentials, saveCredentials } from "../../src/lib/auth.js";

const API = "https://api.agnt-gm.ai";

describe("project pause (v0.18.0: pause/resume bot)", () => {
  beforeEach(() => {
    nock.cleanAll();
    clearCredentials();
    saveCredentials({ token: "amk_test", agent_id: "agent-1" });
  });

  it("refuses when neither --on nor --off is given", async () => {
    const { error } = await runCommand(["project", "pause", "proj_wb"]);
    expect(error?.message).toContain("--on");
  });

  it("refuses when both --on and --off are given", async () => {
    const { error } = await runCommand([
      "project",
      "pause",
      "proj_wb",
      "--on",
      "--off",
    ]);
    expect(error?.message).toContain("--on");
  });

  it("--on PUTs paused=true and renders a green confirmation", async () => {
    nock(API)
      .put(
        "/api/builder/projects/proj_wb/bot/pause",
        (body: Record<string, unknown>) => body.paused === true,
      )
      .reply(200, { paused: true, paused_at: "2026-06-25T16:00:00Z" });

    const { stdout, error } = await runCommand([
      "project",
      "pause",
      "proj_wb",
      "--on",
    ]);
    expect(error).toBeUndefined();
    expect(stdout).toContain("Bot paused");
  });

  it("--off PUTs paused=false and renders a green confirmation", async () => {
    nock(API)
      .put(
        "/api/builder/projects/proj_wb/bot/pause",
        (body: Record<string, unknown>) => body.paused === false,
      )
      .reply(200, { paused: false });

    const { stdout, error } = await runCommand([
      "project",
      "pause",
      "proj_wb",
      "--off",
    ]);
    expect(error).toBeUndefined();
    expect(stdout).toContain("Bot resumed");
    expect(stdout).toContain("redeploying");
  });

  it("exits 4 on 404 (no bot provisioned)", async () => {
    nock(API)
      .put("/api/builder/projects/proj_wb/bot/pause")
      .reply(404, { error: "no bot provisioned for this project" });

    const { error } = await runCommand([
      "project",
      "pause",
      "proj_wb",
      "--on",
    ]);
    expect(error?.message).toContain("Not found");
  });

  it("JSON output pins paused state", async () => {
    nock(API)
      .put("/api/builder/projects/proj_wb/bot/pause")
      .reply(200, { paused: true });

    const { stdout, error } = await runCommand([
      "project",
      "pause",
      "proj_wb",
      "--on",
      "--json",
    ]);
    expect(error).toBeUndefined();
    const out = JSON.parse(stdout);
    expect(out.paused).toBe(true);
  });
});