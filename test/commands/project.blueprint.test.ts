import { runCommand } from "@oclif/test";
import { describe, it, expect, beforeEach } from "vitest";
import nock from "nock";
import { clearCredentials, saveCredentials } from "../../src/lib/auth.js";

const API = "https://api.agnt-gm.ai";

describe("project blueprint (v0.18.0: whole_bot spec surface)", () => {
  beforeEach(() => {
    nock.cleanAll();
    clearCredentials();
    // Tests need an amk_ token so authHeaders() attaches the Bearer header.
    saveCredentials({ token: "amk_test", agent_id: "agent-1" });
  });

  it("renders the blueprint in human output", async () => {
    nock(API)
      .get("/api/builder/projects/proj_wb/quality/blueprint")
      .reply(200, {
        blueprint: "## Overview\nA bot that does X.\n\n## Flows\n1. /start\n2. /pay",
        updated_at: "2026-06-25T12:00:00Z",
      });

    const { stdout, error } = await runCommand(["project", "blueprint", "proj_wb"]);
    expect(error).toBeUndefined();
    expect(stdout).toContain("Blueprint for proj_wb");
    expect(stdout).toContain("## Overview");
    expect(stdout).toContain("/start");
  });

  it("exposes the blueprint in JSON output", async () => {
    nock(API)
      .get("/api/builder/projects/proj_wb/quality/blueprint")
      .reply(200, {
        blueprint: "spec text",
        updated_at: "2026-06-25T12:00:00Z",
      });

    const { stdout, error } = await runCommand([
      "project",
      "blueprint",
      "proj_wb",
      "--json",
    ]);
    expect(error).toBeUndefined();
    const out = JSON.parse(stdout);
    expect(out.blueprint).toBe("spec text");
  });

  it("exits 4 when project not found", async () => {
    nock(API)
      .get("/api/builder/projects/proj_nope/quality/blueprint")
      .reply(404, { error: "not_found" });

    const { error } = await runCommand(["project", "blueprint", "proj_nope"]);
    expect(error?.message).toContain("Project not found");
  });

  it("prints a dim hint when blueprint is missing (project not finalized)", async () => {
    nock(API)
      .get("/api/builder/projects/proj_draft/quality/blueprint")
      .reply(200, { blueprint: null });

    const { stdout, error } = await runCommand(["project", "blueprint", "proj_draft"]);
    expect(error).toBeUndefined();
    expect(stdout).toContain("no blueprint on file");
  });
});