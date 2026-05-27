import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { Entry } from "@napi-rs/keyring";

const SERVICE = "agnt-cli";

/** Returns the stored password string, or null if keyring is unavailable/empty. */
export function keyringRead(account: string): string | null {
  try {
    const entry = new Entry(SERVICE, account);
    return entry.getPassword();
  } catch {
    return null;
  }
}

/** Returns true on success, false if keyring is unavailable. */
export function keyringWrite(account: string, value: string): boolean {
  try {
    const entry = new Entry(SERVICE, account);
    entry.setPassword(value);
    return true;
  } catch {
    return false;
  }
}

/** Returns true on success (or if entry doesn't exist), false on error. */
export function keyringDelete(account: string): boolean {
  try {
    const entry = new Entry(SERVICE, account);
    entry.deleteCredential();
    return true;
  } catch {
    return false;
  }
}

/**
 * If `filePath` exists and the keyring `account` is empty, copy file data
 * into the keyring then delete the file.  Does nothing if file doesn't exist
 * or keyring already has data.
 *
 * Returns true if migration happened, false otherwise.  Silently returns
 * false on any I/O error (caller should already have a fallback path).
 */
export function migrateFileToKeyring(
  filePath: string,
  account: string,
): boolean {
  if (!existsSync(filePath)) return false;

  try {
    // Only migrate if keyring is still empty
    if (keyringRead(account) !== null) return false;

    const raw = readFileSync(filePath, "utf8");
    if (!keyringWrite(account, raw)) return false;

    unlinkSync(filePath);
    return true;
  } catch {
    return false;
  }
}
