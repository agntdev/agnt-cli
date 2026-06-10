import { runCommand } from "@oclif/test";
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import nock from "nock";
import { saveCredentials, clearCredentials } from "../../src/lib/auth.js";

const API = "https://api.agnt-gm.ai";

describe("balance", () => {
  beforeEach(() => {
    nock.cleanAll();
    saveCredentials({ token: "amk_test", agent_id: "agent-abc" });
  });

  afterAll(() => {
    clearCredentials();
  });

  it("returns holdings with totals when non-zero", async () => {
    nock(API)
      .get("/api/builder/agents/me")
      .matchHeader("authorization", /^Bearer amk_/)
      .reply(200, { agent: { id: "agent-abc" } });

    nock(API)
      .get("/api/builder/agents/agent-abc/balance")
      .reply(200, {
        holdings: [
          {
            project_id: "proj_1",
            project_name: "DeFi",
            token_symbol: "DEFI",
            balance: 10000,
            last_grant_at: "2026-06-01T00:00:00Z",
          },
        ],
      });

    const { stdout, error } = await runCommand(["balance", "--json"]);
    expect(error).toBeUndefined();

    const out = JSON.parse(stdout);
    expect(out.holdings).toHaveLength(1);
    expect(out.holdings[0].project_name).toBe("DeFi");
    expect(out.holdings[0].last_grant_at).toBe("2026-06-01T00:00:00Z");
    expect(out.holdings_count).toBe(1);
    expect(out.totals.tokens).toBe(10000);
  });

  it("omits totals.tokens when there are no holdings (avoids misleading 0)", async () => {
    // This is the F1/n1 fix: `totals.tokens: 0` next to a `holdings[]`
    // list with `last_grant_at` is confusing. When there are no holdings,
    // the field is gone — only the summary message remains.
    nock(API)
      .get("/api/builder/agents/me")
      .matchHeader("authorization", /^Bearer amk_/)
      .reply(200, { agent: { id: "agent-abc" } });

    nock(API)
      .get("/api/builder/agents/agent-abc/balance")
      .reply(200, { holdings: [] });

    const { stdout, error } = await runCommand(["balance", "--json"]);
    expect(error).toBeUndefined();

    const out = JSON.parse(stdout);
    expect(out.summary).toContain("No holdings yet");
    expect(out.totals).toBeUndefined();
  });

  it("shows empty message when no holdings", async () => {
    nock(API)
      .get("/api/builder/agents/me")
      .matchHeader("authorization", /^Bearer amk_/)
      .reply(200, { agent: { id: "agent-abc" } });

    nock(API)
      .get("/api/builder/agents/agent-abc/balance")
      .reply(200, { holdings: [] });

    const { stdout, error } = await runCommand(["balance", "--json"]);
    expect(error).toBeUndefined();

    const out = JSON.parse(stdout);
    expect(out.summary).toContain("No holdings yet");
  });
});
