import { describe, it, expect, beforeEach, afterAll } from "vitest";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";

import {
  keyringRead,
  keyringWrite,
  keyringDelete,
} from "../../src/lib/keyring.js";
import {
  loadCredentials,
  saveCredentials,
  clearCredentials,
  isLoggedIn,
} from "../../src/lib/auth.js";

// vitest.config.ts already sets AGNT_CREDENTIALS_DIR to a sandbox
// path before this file loads. We use that sandbox for these tests
// so they don't touch the developer's real OS keychain entry.
//
// This file verifies the keyring isolation behavior: when
// AGNT_CREDENTIALS_DIR is set, the keyring functions are no-ops
// and credentials go to the namespaced file only.

const SANDBOX = process.env.AGNT_CREDENTIALS_DIR;
if (!SANDBOX) {
  throw new Error(
    "Test setup error: AGNT_CREDENTIALS_DIR is not set. " +
      "vitest.config.ts should set it before tests load.",
  );
}

describe("keyring isolation (AGNT_CREDENTIALS_DIR is set by vitest config)", () => {
  // Clean the sandbox before each test so state doesn't leak.
  beforeEach(() => {
    mkdirSync(SANDBOX, { recursive: true });
    for (const f of readdirSync(SANDBOX)) {
      try {
        unlinkSync(join(SANDBOX, f));
      } catch {
        // ignore
      }
    }
  });

  afterAll(() => {
    // Wipe the sandbox at the end so it doesn't accumulate.
    try {
      rmSync(SANDBOX, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("bypasses the keyring when AGNT_CREDENTIALS_DIR is set", () => {
    // The real keyring functions are no-ops under isolation.
    expect(keyringWrite("any", "value")).toBe(false);
    expect(keyringRead("any")).toBe(null);
    expect(keyringDelete("any")).toBe(true); // no-op success
  });

  it("saveCredentials writes to the namespaced file, not the keyring", () => {
    const creds = {
      token: "amk_test_iso",
      agent_id: "agent-iso",
      jwt: "jwt-iso",
    };
    saveCredentials(creds);

    const credsFile = join(SANDBOX, "credentials.json");
    expect(existsSync(credsFile)).toBe(true);

    const written = JSON.parse(readFileSync(credsFile, "utf8"));
    expect(written.token).toBe("amk_test_iso");
    expect(written.agent_id).toBe("agent-iso");
    expect(written.jwt).toBe("jwt-iso");
  });

  it("clearCredentials deletes the namespaced file only, not the keyring", () => {
    saveCredentials({ token: "amk_to_be_cleared", agent_id: "agent-x" });
    const credsFile = join(SANDBOX, "credentials.json");
    expect(existsSync(credsFile)).toBe(true);

    clearCredentials();
    expect(existsSync(credsFile)).toBe(false);
  });

  it("round-trip: save → load returns the same credentials", () => {
    saveCredentials({ token: "amk_roundtrip", agent_id: "agent-rt" });
    const loaded = loadCredentials();
    expect(loaded?.token).toBe("amk_roundtrip");
    expect(loaded?.agent_id).toBe("agent-rt");
  });

  it("isLoggedIn reflects the file state", () => {
    expect(isLoggedIn()).toBe(false);
    saveCredentials({ token: "amk_loggedin", agent_id: "agent-li" });
    expect(isLoggedIn()).toBe(true);
    clearCredentials();
    expect(isLoggedIn()).toBe(false);
  });
});
