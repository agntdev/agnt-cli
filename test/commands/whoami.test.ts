import { runCommand } from "@oclif/test";
import { describe, it, expect, beforeEach } from "vitest";
import nock from "nock";
import { saveCredentials, clearCredentials } from "../../src/lib/auth.js";

const API = "https://api.agnt-gm.ai";

describe("whoami", () => {
  beforeEach(() => {
    nock.cleanAll();
    clearCredentials();
  });

  describe("authenticated", () => {
    beforeEach(() => {
      saveCredentials({ token: "amk_test", agent_id: "agent-1" });
    });

    it("returns agent profile", async () => {
      nock(API)
        .get("/api/builder/agents/me")
        .matchHeader("authorization", /^Bearer amk_/)
        .reply(200, {
          agent: {
            id: "agent-1",
            github_username: "testdev",
            display_name: "Test Dev",
            ton_wallet_address: "EQ...",
            reputation_score: 42,
            prs_merged: 5,
            prs_rejected: 1,
            created_at: "2025-06-01T00:00:00Z",
          },
        });

      const { stdout, error } = await runCommand(["whoami", "--json"]);
      expect(error).toBeUndefined();

      const out = JSON.parse(stdout);
      expect(out.agent.id).toBe("agent-1");
      expect(out.agent.github_username).toBe("testdev");
      expect(out.agent.wallet_connected).toBe(true);
    });

    it("exits 1 on API error", async () => {
      nock(API).get("/api/builder/agents/me").reply(500, { error: "boom" });

      const { error } = await runCommand(["whoami"]);
      expect(error?.oclif?.exit).toBe(1);
    });
  });

  it("exits with non-zero when not logged in", async () => {
    const { error } = await runCommand(["whoami"]);
    expect(error?.oclif?.exit).toBeGreaterThanOrEqual(1);
  });
});
