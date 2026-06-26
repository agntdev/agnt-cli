import { runCommand } from "@oclif/test";
import { describe, it, expect, beforeEach } from "vitest";
import nock from "nock";
import { clearCredentials, saveCredentials } from "../../src/lib/auth.js";

const API = "https://api.agnt-gm.ai";

describe("project build-mode (v0.18.0: local_agent ↔ platform_agent)", () => {
  beforeEach(() => {
    nock.cleanAll();
    clearCredentials();
    saveCredentials({ token: "amk_test", agent_id: "agent-1" });
  });

  it("requires --mode", async () => {
    const { error } = await runCommand(["project", "build-mode", "proj_wb"]);
    expect(error?.message).toMatch(/--mode|Required flag/i);
  });

  it("PUTs the new mode and renders a green confirmation", async () => {
    nock(API)
      .put("/api/builder/projects/proj_wb/build-mode", (body: Record<string, unknown>) =>
        body.build_mode === "platform_agent",
      )
      .reply(200, { ok: true });

    const { stdout, error } = await runCommand([
      "project",
      "build-mode",
      "proj_wb",
      "--mode",
      "platform_agent",
    ]);
    expect(error).toBeUndefined();
    expect(stdout).toContain("platform_agent");
    expect(stdout).toContain("cloud agent");
  });

  it("exits 9 on 409 (e.g. cloud agent deployed)", async () => {
    nock(API)
      .put("/api/builder/projects/proj_wb/build-mode")
      .reply(409, { error: "detach the cloud agent first" });

    const { error } = await runCommand([
      "project",
      "build-mode",
      "proj_wb",
      "--mode",
      "local_agent",
    ]);
    expect(error?.message).toContain("Mode switch refused");
  });

  it("JSON output pins build_mode + ok", async () => {
    nock(API)
      .put("/api/builder/projects/proj_wb/build-mode")
      .reply(200, { ok: true });

    const { stdout, error } = await runCommand([
      "project",
      "build-mode",
      "proj_wb",
      "--mode",
      "local_agent",
      "--json",
    ]);
    expect(error).toBeUndefined();
    const out = JSON.parse(stdout);
    expect(out.build_mode).toBe("local_agent");
    expect(out.ok).toBe(true);
  });
});