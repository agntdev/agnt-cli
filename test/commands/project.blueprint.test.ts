import { runCommand } from "@oclif/test";
import { describe, it, expect, beforeEach } from "vitest";
import nock from "nock";
import { clearCredentials, saveCredentials } from "../../src/lib/auth.js";

const API = "https://api.agnt-gm.ai";

describe("project blueprint (v0.18.0: structured blueprint surface)", () => {
  beforeEach(() => {
    nock.cleanAll();
    clearCredentials();
    // Tests need an amk_ token so authHeaders() attaches the Bearer header.
    saveCredentials({ token: "amk_test", agent_id: "agent-1" });
  });

  it("renders the structured blueprint in human output", async () => {
    nock(API)
      .get("/api/builder/projects/proj_wb/quality/blueprint")
      .reply(200, {
        project_id: "proj_wb",
        version: 1,
        status: "generated",
        archetype: "utility",
        title: "Crypto Price Bot",
        summary: "A bot that watches crypto prices.",
        completeness_score: 0.85,
        missing_fields: [],
        assumptions: ["User has a CoinGecko API key"],
        content: {
          entry_points: [
            { type: "command", label: "Price check", command: "/price", actor: "user", description: "Check a coin price" },
          ],
          flows: [
            { name: "Price alert", trigger: "/start", steps: ["User adds coin", "Bot watches", "Alert fires"] },
          ],
          data_entities: [
            { name: "Watchlist", description: "Per-user coin list", retention: "persistent" },
          ],
          integrations: [
            { name: "CoinGecko", purpose: "Price data", required: true },
          ],
          edge_cases: ["API rate limit", "Unknown ticker"],
        },
        updated_at: "2026-06-25T12:00:00Z",
      });

    const { stdout, error } = await runCommand(["project", "blueprint", "proj_wb"]);
    expect(error).toBeUndefined();
    expect(stdout).toContain("Crypto Price Bot");
    expect(stdout).toContain("utility");
    expect(stdout).toContain("85%");
    expect(stdout).toContain("Price check");
    expect(stdout).toContain("/price");
    expect(stdout).toContain("Price alert");
    expect(stdout).toContain("Watchlist");
    expect(stdout).toContain("CoinGecko");
    expect(stdout).toContain("API rate limit");
    expect(stdout).toContain("CoinGecko API key");
  });

  it("exposes the full structured response in JSON output", async () => {
    nock(API)
      .get("/api/builder/projects/proj_wb/quality/blueprint")
      .reply(200, {
        project_id: "proj_wb",
        version: 1,
        status: "generated",
        archetype: "utility",
        title: "Test Bot",
        summary: "A test bot.",
        completeness_score: 1.0,
        missing_fields: [],
        assumptions: [],
        content: { entry_points: [], flows: [] },
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
    expect(out.title).toBe("Test Bot");
    expect(out.completeness_score).toBe(1.0);
    expect(out.archetype).toBe("utility");
    expect(out.content).toBeDefined();
  });

  it("exits 4 when project not found", async () => {
    nock(API)
      .get("/api/builder/projects/proj_nope/quality/blueprint")
      .reply(404, { error: "not_found" });

    const { error } = await runCommand(["project", "blueprint", "proj_nope"]);
    expect(error?.message).toContain("Project not found");
  });

  it("exits 4 when no blueprint generated yet", async () => {
    nock(API)
      .get("/api/builder/projects/proj_draft/quality/blueprint")
      .reply(404, { error: "no blueprint" });

    const { error } = await runCommand(["project", "blueprint", "proj_draft"]);
    expect(error?.message).toContain("Project not found");
  });
});
