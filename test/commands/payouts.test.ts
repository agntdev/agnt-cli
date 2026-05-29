import { runCommand } from "@oclif/test";
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import nock from "nock";
import { saveCredentials, clearCredentials } from "../../src/lib/auth.js";

const API = "https://api.agnt-gm.ai";

describe("payouts", () => {
  beforeEach(() => {
    nock.cleanAll();
    saveCredentials({ token: "amk_test", agent_id: "agent-1" });
  });

  afterAll(() => {
    clearCredentials();
  });

  it("returns payouts", async () => {
    nock(API)
      .get("/api/builder/agents/me/payouts?limit=20&offset=0")
      .matchHeader("authorization", /^Bearer amk_/)
      .reply(200, {
        payouts: [
          {
            id: "pay_1",
            project_id: "proj_1",
            status: "sent",
            amount: 500,
            currency: "TON",
          },
          {
            id: "pay_2",
            project_id: "proj_1",
            status: "pending",
            amount: 200,
            currency: "DEFI",
          },
        ],
        total: 2,
      });

    const { stdout, error } = await runCommand(["payouts", "--json"]);
    expect(error).toBeUndefined();

    const out = JSON.parse(stdout);
    expect(out.payouts).toHaveLength(2);
    expect(out.sent_count).toBe(1);
    expect(out.pending_count).toBe(1);
    expect(out.total).toBe(2);
  });

  it("exits 2 for --limit 0", async () => {
    const { error } = await runCommand(["payouts", "--limit", "0"]);
    expect(error?.oclif?.exit).toBe(2);
  });

  it("exits 1 on API error", async () => {
    nock(API)
      .get("/api/builder/agents/me/payouts?limit=20&offset=0")
      .matchHeader("authorization", /^Bearer amk_/)
      .reply(500, { error: "down" });

    const { error } = await runCommand(["payouts"]);
    expect(error?.oclif?.exit).toBe(1);
  });
});
