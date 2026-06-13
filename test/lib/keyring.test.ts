import { describe, it, expect, beforeEach, vi } from "vitest";
import * as fs from "node:fs";

// Mock @napi-rs/keyring
const mockGetPassword = vi.fn();
const mockSetPassword = vi.fn();
const mockDeleteCredential = vi.fn();

vi.mock("@napi-rs/keyring", () => ({
  Entry: vi.fn().mockImplementation((_service: string, account: string) => ({
    getPassword: () => mockGetPassword(account),
    setPassword: (val: string) => mockSetPassword(account, val),
    deleteCredential: () => mockDeleteCredential(account),
  })),
}));

// Mock node:fs
vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof fs>("node:fs");
  return { ...actual };
});

import {
  keyringRead,
  keyringWrite,
  keyringDelete,
  migrateFileToKeyring,
} from "../../src/lib/keyring.js";

describe("keyring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The vitest config sets AGNT_CREDENTIALS_DIR to sandbox tests
    // away from the developer's real keychain. This file mocks
    // @napi-rs/keyring and wants to assert the mock is called, so
    // we must turn the bypass off for these tests.
    delete process.env.AGNT_CREDENTIALS_DIR;
  });

  describe("keyringRead", () => {
    it("returns password when keyring has data", () => {
      mockGetPassword.mockReturnValue("my-secret");
      expect(keyringRead("test-account")).toBe("my-secret");
    });

    it("returns null when keyring throws", () => {
      mockGetPassword.mockImplementation(() => {
        throw new Error("keychain unavailable");
      });
      expect(keyringRead("test-account")).toBeNull();
    });
  });

  describe("keyringWrite", () => {
    it("returns true on success", () => {
      mockSetPassword.mockReturnValue(undefined);
      expect(keyringWrite("test-account", "data")).toBe(true);
    });

    it("returns false on error", () => {
      mockSetPassword.mockImplementation(() => {
        throw new Error("keychain unavailable");
      });
      expect(keyringWrite("test-account", "data")).toBe(false);
    });
  });

  describe("keyringDelete", () => {
    it("returns true on success", () => {
      mockDeleteCredential.mockReturnValue(undefined);
      expect(keyringDelete("test-account")).toBe(true);
    });

    it("returns false on error", () => {
      mockDeleteCredential.mockImplementation(() => {
        throw new Error("keychain unavailable");
      });
      expect(keyringDelete("test-account")).toBe(false);
    });
  });

  describe("migrateFileToKeyring", () => {
    it("returns false when file does not exist", () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(false);
      expect(migrateFileToKeyring("/fake/path.json", "acct")).toBe(false);
    });

    it("returns false when keyring already has data", () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      mockGetPassword.mockReturnValue("existing-data");
      expect(migrateFileToKeyring("/fake/path.json", "acct")).toBe(false);
    });

    it("migrates file to keyring and deletes file", () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      mockGetPassword.mockReturnValue(null); // keyring empty
      mockSetPassword.mockReturnValue(undefined); // write succeeds
      vi.spyOn(fs, "readFileSync").mockReturnValue(
        JSON.stringify({ token: "abc" }),
      );
      const unlinkSpy = vi
        .spyOn(fs, "unlinkSync")
        .mockReturnValue(undefined);

      const result = migrateFileToKeyring("/fake/path.json", "acct");

      expect(result).toBe(true);
      expect(mockSetPassword).toHaveBeenCalledWith(
        "acct",
        JSON.stringify({ token: "abc" }),
      );
      expect(unlinkSpy).toHaveBeenCalledWith("/fake/path.json");
    });

    it("returns false when keyring write fails during migration", () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      mockGetPassword.mockReturnValue(null);
      mockSetPassword.mockImplementation(() => {
        throw new Error("keychain unavailable");
      });
      vi.spyOn(fs, "readFileSync").mockReturnValue(
        JSON.stringify({ token: "abc" }),
      );

      expect(migrateFileToKeyring("/fake/path.json", "acct")).toBe(false);
    });

    it("returns false on file read error", () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      mockGetPassword.mockReturnValue(null);
      vi.spyOn(fs, "readFileSync").mockImplementation(() => {
        throw new Error("EACCES");
      });

      expect(migrateFileToKeyring("/fake/path.json", "acct")).toBe(false);
    });
  });
});
