import { runCommand } from "@oclif/test";
import { describe, it, expect, beforeEach } from "vitest";
import nock from "nock";

const API = "https://api.agnt-gm.ai";

describe("balance", () => {
  beforeEach(() => {
    nock.cleanAll();
  });

  it("returns holdings", async () => {
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
          },
        ],
      });

    const { stdout, error } = await runCommand(["balance", "--json"]);
    expect(error).toBeUndefined();

    const out = JSON.parse(stdout);
    expect(out.holdings).toHaveLength(1);
    expect(out.holdings[0].project_name).toBe("DeFi");
    expect(out.totals.tokens).toBe(10000);
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
