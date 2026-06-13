import { runCommand } from "@oclif/test";
import { describe, it, expect, beforeEach } from "vitest";
import { clearCredentials, loadCredentials } from "../../src/lib/auth.js";

describe("login", () => {
  beforeEach(() => {
    clearCredentials();
  });

  it("exits 2 without --token (required flag)", async () => {
    const { error } = await runCommand(["login"]);
    expect(error?.oclif?.exit).toBe(2);
  });

  it("exits 2 with a non-amk_ token", async () => {
    const { error } = await runCommand(["login", "--token", "not-a-real-key"]);
    expect(error?.oclif?.exit).toBe(2);
  });

  it("saves credentials on a valid amk_ token", async () => {
    const { error } = await runCommand([
      "login",
      "--token",
      "amk_test_token_abc",
    ]);
    expect(error).toBeUndefined();
    const creds = loadCredentials();
    expect(creds?.token).toBe("amk_test_token_abc");
  });
});
