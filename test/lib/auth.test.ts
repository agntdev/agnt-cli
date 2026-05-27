import { describe, it, expect, beforeEach, vi } from "vitest";
import * as fs from "node:fs";

// Mock the shared keyring module
const mockKeyringRead = vi.fn();
const mockKeyringWrite = vi.fn();
const mockKeyringDelete = vi.fn();
const mockMigrateFileToKeyring = vi.fn();

vi.mock("../../src/lib/keyring.js", () => ({
  keyringRead: (account: string) => mockKeyringRead(account),
  keyringWrite: (account: string, val: string) =>
    mockKeyringWrite(account, val),
  keyringDelete: (account: string) => mockKeyringDelete(account),
  migrateFileToKeyring: (filePath: string, account: string) =>
    mockMigrateFileToKeyring(filePath, account),
}));

// Mock node:fs
vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof fs>("node:fs");
  return { ...actual };
});

import {
  loadCredentials,
  saveCredentials,
  clearCredentials,
  getToken,
  isLoggedIn,
  type Credentials,
} from "../../src/lib/auth.js";

describe("auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: keyring is available and empty
    mockKeyringRead.mockReturnValue(null);
    mockKeyringWrite.mockReturnValue(true);
    mockKeyringDelete.mockReturnValue(true);
    mockMigrateFileToKeyring.mockReturnValue(false);
  });

  describe("loadCredentials", () => {
    it("returns credentials from keyring when available", () => {
      mockKeyringRead.mockReturnValue(
        JSON.stringify({ token: "amk_123", agent_id: "agent-1" }),
      );

      const creds = loadCredentials();
      expect(creds).toEqual({ token: "amk_123", agent_id: "agent-1" });
    });

    it("migrates file to keyring and returns result", () => {
      // First keyringRead returns null (empty)
      mockKeyringRead.mockReturnValueOnce(null);
      // Migration succeeds
      mockMigrateFileToKeyring.mockReturnValueOnce(true);
      // Second keyringRead returns migrated data
      mockKeyringRead.mockReturnValueOnce(
        JSON.stringify({ token: "amk_migrated" }),
      );

      const creds = loadCredentials();
      expect(creds).toEqual({ token: "amk_migrated" });
      expect(mockMigrateFileToKeyring).toHaveBeenCalled();
    });

    it("falls back to file when keyring is unavailable", () => {
      // Keyring unavailable
      mockKeyringRead.mockReturnValue(null);
      mockMigrateFileToKeyring.mockReturnValue(false);

      // File fallback has data
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue(
        JSON.stringify({ token: "amk_file" }),
      );

      const creds = loadCredentials();
      expect(creds).toEqual({ token: "amk_file" });
    });

    it("returns null when file has no token", () => {
      mockKeyringRead.mockReturnValue(null);
      mockMigrateFileToKeyring.mockReturnValue(false);

      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify({}));

      expect(loadCredentials()).toBeNull();
    });

    it("returns null when file does not exist and keyring empty", () => {
      mockKeyringRead.mockReturnValue(null);
      mockMigrateFileToKeyring.mockReturnValue(false);
      vi.spyOn(fs, "existsSync").mockReturnValue(false);

      expect(loadCredentials()).toBeNull();
    });

    it("returns null when keyring data is corrupt JSON", () => {
      mockKeyringRead.mockReturnValue("not-json{{{{");
      mockMigrateFileToKeyring.mockReturnValue(false);
      vi.spyOn(fs, "existsSync").mockReturnValue(false);

      expect(loadCredentials()).toBeNull();
    });
  });

  describe("saveCredentials", () => {
    it("saves to keyring when available", () => {
      mockKeyringWrite.mockReturnValue(true);

      const creds: Credentials = { token: "amk_new" };
      saveCredentials(creds);

      expect(mockKeyringWrite).toHaveBeenCalledWith(
        "credentials",
        JSON.stringify(creds),
      );
    });

    it("falls back to file when keyring write fails", () => {
      mockKeyringWrite.mockReturnValue(false);
      const writeSpy = vi.spyOn(fs, "writeFileSync").mockReturnValue(undefined);
      vi.spyOn(fs, "mkdirSync").mockReturnValue(undefined);

      const creds: Credentials = { token: "amk_fallback" };
      saveCredentials(creds);

      expect(mockKeyringWrite).toHaveBeenCalled();
      expect(writeSpy).toHaveBeenCalled();
    });
  });

  describe("clearCredentials", () => {
    it("deletes from keyring and removes file", () => {
      mockKeyringDelete.mockReturnValue(true);
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      const unlinkSpy = vi.spyOn(fs, "unlinkSync").mockReturnValue(undefined);
      const consoleSpy = vi.spyOn(console, "error").mockReturnValue();

      clearCredentials();

      expect(mockKeyringDelete).toHaveBeenCalledWith("credentials");
      expect(unlinkSpy).toHaveBeenCalled();
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it("warns when keyring delete fails", () => {
      mockKeyringDelete.mockReturnValue(false);
      vi.spyOn(fs, "existsSync").mockReturnValue(false);
      const consoleSpy = vi.spyOn(console, "error").mockReturnValue();

      clearCredentials();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Warning"),
      );
    });

    it("does not warn when keyring delete succeeds", () => {
      mockKeyringDelete.mockReturnValue(true);
      vi.spyOn(fs, "existsSync").mockReturnValue(false);
      const consoleSpy = vi.spyOn(console, "error").mockReturnValue();

      clearCredentials();

      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });

  describe("getToken", () => {
    it("returns token from keyring", () => {
      mockKeyringRead.mockReturnValue(JSON.stringify({ token: "amk_test" }));
      expect(getToken()).toBe("amk_test");
    });

    it("returns null when not logged in", () => {
      mockKeyringRead.mockReturnValue(null);
      mockMigrateFileToKeyring.mockReturnValue(false);
      vi.spyOn(fs, "existsSync").mockReturnValue(false);
      expect(getToken()).toBeNull();
    });
  });

  describe("isLoggedIn", () => {
    it("returns true when token exists", () => {
      mockKeyringRead.mockReturnValue(JSON.stringify({ token: "amk_test" }));
      expect(isLoggedIn()).toBe(true);
    });

    it("returns false when no token", () => {
      mockKeyringRead.mockReturnValue(null);
      mockMigrateFileToKeyring.mockReturnValue(false);
      vi.spyOn(fs, "existsSync").mockReturnValue(false);
      expect(isLoggedIn()).toBe(false);
    });
  });
});
