import { runCommand } from "@oclif/test";
import { describe, it, expect, beforeEach } from "vitest";
import nock from "nock";
import { clearCredentials, saveCredentials } from "../../src/lib/auth.js";

const API = "https://api.agnt-gm.ai";

describe("project rebuild (v0.18.0: owner retry of failed whole_bot)", () => {
  beforeEach(() => {
    nock.cleanAll();
    clearCredentials();
    saveCredentials({ token: "amk_test", agent_id: "agent-1" });
  });

  it("refuses without --yes (cost guard)", async () => {
    const { error } = await runCommand(["project", "rebuild", "proj_wb"]);
    expect(error?.message).toContain("--yes");
  });

  it("POSTs rebuild and renders a green confirmation", async () => {
    nock(API)
      .post("/api/builder/projects/proj_wb/rebuild")
      .reply(202, { ok: true, status: "rebuilding", project_id: "proj_wb" });

    const { stdout, error } = await runCommand([
      "project",
      "rebuild",
      "proj_wb",
      "--yes",
    ]);
    expect(error).toBeUndefined();
    expect(stdout).toContain("Rebuild started");
    expect(stdout).toContain("re-enters building");
  });

  it("exits 9 with a clear 409 message when not a failed whole_bot", async () => {
    nock(API)
      .post("/api/builder/projects/proj_wb/rebuild")
      .reply(409, { error: "project is not in the failed state" });

    const { error } = await runCommand([
      "project",
      "rebuild",
      "proj_wb",
      "--yes",
    ]);
    expect(error?.message).toContain("Cannot rebuild");
    expect(error?.message).toContain("not in the failed state");
  });

  it("exits 4 on 404", async () => {
    nock(API)
      .post("/api/builder/projects/proj_nope/rebuild")
      .reply(404, { error: "not_found" });

    const { error } = await runCommand([
      "project",
      "rebuild",
      "proj_nope",
      "--yes",
    ]);
    expect(error?.message).toContain("Project not found");
  });

  it("JSON output pins ok=true + status", async () => {
    nock(API)
      .post("/api/builder/projects/proj_wb/rebuild")
      .reply(202, { ok: true, status: "rebuilding" });

    const { stdout, error } = await runCommand([
      "project",
      "rebuild",
      "proj_wb",
      "--yes",
      "--json",
    ]);
    expect(error).toBeUndefined();
    const out = JSON.parse(stdout);
    expect(out.ok).toBe(true);
    expect(out.status).toBe("rebuilding");
  });
});