import { describe, it, expect, beforeEach, vi } from "vitest";
import * as fs from "node:fs";

// Mock the shared keyring module
const mockKeyringRead = vi.fn();
const mockKeyringWrite = vi.fn();
const mockMigrateFileToKeyring = vi.fn();

vi.mock("../../src/lib/keyring.js", () => ({
  keyringRead: (account: string) => mockKeyringRead(account),
  keyringWrite: (account: string, val: string) => mockKeyringWrite(account, val),
  keyringDelete: vi.fn(),
  migrateFileToKeyring: (filePath: string, account: string) =>
    mockMigrateFileToKeyring(filePath, account),
}));

// Mock node:fs
vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof fs>("node:fs");
  return { ...actual };
});

import { KeyringStorage } from "../../src/lib/ton-auth.js";

describe("KeyringStorage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: keyring is available
    mockKeyringWrite.mockReturnValue(true);
    mockMigrateFileToKeyring.mockReturnValue(false);
  });

  describe("when keyring is available", () => {
    it("stores and retrieves items from keyring", async () => {
      // Probe succeeds
      mockKeyringWrite.mockReturnValueOnce(true);
      // Existing session is empty
      mockKeyringRead.mockReturnValueOnce(null);
      // Write succeeds
      mockKeyringWrite.mockReturnValueOnce(true);

      const storage = new KeyringStorage("tonconnect");

      await storage.setItem("wallet-1", JSON.stringify({ address: "EQ..." }));

      // Now read back
      mockKeyringRead.mockReturnValueOnce(
        JSON.stringify({ "wallet-1": JSON.stringify({ address: "EQ..." }) }),
      );

      const result = await storage.getItem("wallet-1");
      expect(result).toBe(JSON.stringify({ address: "EQ..." }));
    });

    it("removes items from keyring", async () => {
      // Probe
      mockKeyringWrite.mockReturnValueOnce(true);
      // Read existing session with one key
      mockKeyringRead.mockReturnValueOnce(
        JSON.stringify({ "wallet-1": "data", "wallet-2": "other" }),
      );
      // Write after removal
      mockKeyringWrite.mockReturnValueOnce(true);

      const storage = new KeyringStorage("tonconnect");
      await storage.removeItem("wallet-1");

      // Verify the write call contained only wallet-2
      const writeCall = mockKeyringWrite.mock.calls.find(
        (c) => c[0] === "tonconnect" && c[1] !== "1",
      );
      expect(writeCall).toBeDefined();
      const written = JSON.parse(writeCall![1]);
      expect(written).toEqual({ "wallet-2": "other" });
    });

    it("returns null for missing key", async () => {
      mockKeyringWrite.mockReturnValueOnce(true); // probe
      mockKeyringRead.mockReturnValueOnce(null); // empty session
      vi.spyOn(fs, "existsSync").mockReturnValue(false); // no file either

      const storage = new KeyringStorage("tonconnect");
      const result = await storage.getItem("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("when keyring is unavailable", () => {
    it("falls back to file on write", async () => {
      // Probe fails
      mockKeyringWrite.mockReturnValueOnce(false);
      const writeSpy = vi
        .spyOn(fs, "writeFileSync")
        .mockReturnValue(undefined);
      vi.spyOn(fs, "mkdirSync").mockReturnValue(undefined);
      vi.spyOn(fs, "existsSync").mockReturnValue(false);

      const storage = new KeyringStorage("tonconnect");

      await storage.setItem("key1", "value1");

      expect(writeSpy).toHaveBeenCalled();
      const written = JSON.parse(writeSpy.mock.calls[0][1]);
      expect(written).toEqual({ key1: "value1" });
    });

    it("falls back to file on read", async () => {
      mockKeyringWrite.mockReturnValueOnce(false); // probe fails
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue(
        JSON.stringify({ key1: "file-value" }),
      );

      const storage = new KeyringStorage("tonconnect");
      const result = await storage.getItem("key1");
      expect(result).toBe("file-value");
    });

    it("falls back to file on remove", async () => {
      mockKeyringWrite.mockReturnValueOnce(false); // probe fails
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue(
        JSON.stringify({ key1: "x", key2: "y" }),
      );
      const writeSpy = vi
        .spyOn(fs, "writeFileSync")
        .mockReturnValue(undefined);
      vi.spyOn(fs, "mkdirSync").mockReturnValue(undefined);

      const storage = new KeyringStorage("tonconnect");

      await storage.removeItem("key1");

      const written = JSON.parse(writeSpy.mock.calls[0][1]);
      expect(written).toEqual({ key2: "y" });
    });

    it("handles mid-life keyring failure gracefully", async () => {
      // Probe succeeds
      mockKeyringWrite.mockReturnValueOnce(true);
      // But first write fails → should switch to file
      mockKeyringRead.mockReturnValueOnce(null); // empty session
      mockKeyringWrite.mockReturnValueOnce(false); // write fails!

      vi.spyOn(fs, "mkdirSync").mockReturnValue(undefined);
      vi.spyOn(fs, "existsSync").mockReturnValue(false);
      const writeSpy = vi
        .spyOn(fs, "writeFileSync")
        .mockReturnValue(undefined);

      const storage = new KeyringStorage("tonconnect");
      await storage.setItem("k", "v");

      // Should have fallen back to file
      expect(writeSpy).toHaveBeenCalled();
    });
  });

  describe("migration", () => {
    it("calls migrateFileToKeyring on construction", () => {
      mockKeyringWrite.mockReturnValueOnce(true); // probe

      new KeyringStorage("tonconnect");

      expect(mockMigrateFileToKeyring).toHaveBeenCalledWith(
        expect.stringContaining("tonconnect.json"),
        "tonconnect",
      );
    });
  });
});
