import { runCommand } from "@oclif/test";
import { describe, it, expect, beforeEach } from "vitest";
import nock from "nock";
import { loadCredentials, clearCredentials } from "../../src/lib/auth.js";

const API = "https://api.agnt-gm.ai";

describe("connect", () => {
  beforeEach(() => {
    nock.cleanAll();
    clearCredentials();
  });

  it("claims a code, stores the delegate key, suggests next step", async () => {
    nock(API)
      .post(
        "/api/auth/agent-link/claim",
        (body: Record<string, unknown>) =>
          body.code === "AGNT-7K2MW-QX4RT" &&
          typeof body.client === "string" &&
          body.client.startsWith("agnt-cli/"),
      )
      .reply(200, {
        token: "amk_delegate123",
        agent: { id: "agent-1", display_name: "Volodya P" },
        project: {
          id: "p-1",
          slug: "barberbook",
          github_repo_url: "https://github.com/agntdev/barberbook",
        },
      });

    // Lower-case input must be normalized before the claim.
    const { stdout, error } = await runCommand(["connect", "agnt-7k2mw-qx4rt"]);
    expect(error).toBeUndefined();
    expect(stdout).toContain("Connected");
    expect(stdout).toContain("barberbook");
    expect(stdout).toContain("agnt task list barberbook");

    const creds = loadCredentials();
    expect(creds?.token).toBe("amk_delegate123");
    expect(creds?.agent_id).toBe("agent-1");
  });

  it("explains expired/used codes (410)", async () => {
    nock(API)
      .post("/api/auth/agent-link/claim")
      .reply(410, { error: "code expired or already used" });

    const { error } = await runCommand(["connect", "AGNT-AAAAA-AAAAA"]);
    expect(error?.message).toMatch(/expired|already used/i);
  });

  it("explains unknown codes (404)", async () => {
    nock(API)
      .post("/api/auth/agent-link/claim")
      .reply(404, { error: "unknown code" });

    const { error } = await runCommand(["connect", "AGNT-BBBBB-BBBBB"]);
    expect(error?.message).toMatch(/unknown|check/i);
  });
});
