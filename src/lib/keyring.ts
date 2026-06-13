import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { Entry } from "@napi-rs/keyring";

const SERVICE = "agnt-cli";

// If AGNT_CREDENTIALS_DIR is set, the caller has explicitly chosen a
// non-default credentials path (typical: vitest config points it at a
// temp dir). In that case we bypass the OS keyring entirely so a test
// run can't overwrite the developer's real auth entry. The dev workflow
// never sets this env var, so it's a safe semantic coupling.
//
// Function-call check (not module-load) so tests can flip it on/off
// per test by setting/unsetting the env var in beforeEach.
function isKeyringDisabled(): boolean {
  return !!process.env.AGNT_CREDENTIALS_DIR;
}

/** Returns the stored password string, or null if keyring is unavailable/empty. */
export function keyringRead(account: string): string | null {
  if (isKeyringDisabled()) return null;
  try {
    const entry = new Entry(SERVICE, account);
    return entry.getPassword();
  } catch {
    return null;
  }
}

/** Returns true on success, false if keyring is unavailable. */
export function keyringWrite(account: string, value: string): boolean {
  if (isKeyringDisabled()) return false;
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
  if (isKeyringDisabled()) return true; // no-op success
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
