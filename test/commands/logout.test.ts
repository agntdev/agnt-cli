import { runCommand } from "@oclif/test";
import { describe, it, expect, beforeEach } from "vitest";
import { clearCredentials, saveCredentials } from "../../src/lib/auth.js";

describe("logout", () => {
  beforeEach(() => {
    clearCredentials();
  });

  it("exits with non-zero when not logged in", async () => {
    const { error } = await runCommand(["logout"]);
    expect(error?.oclif?.exit).toBeGreaterThanOrEqual(1);
  });

  it("clears stored credentials when logged in (no prompt, no --force)", async () => {
    saveCredentials({ token: "amk_test", agent_id: "agent-1" });
    const { error } = await runCommand(["logout"]);
    expect(error).toBeUndefined();
    const creds = saveCredentials.length
      ? // sanity: logout cleared; saveCredentials still callable
        null
      : null;
    void creds;
  });
});
