import {
  existsSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  mkdirSync,
} from "node:fs";
import { join } from "node:path";
import {
  keyringRead,
  keyringWrite,
  keyringDelete,
  migrateFileToKeyring,
} from "./keyring.js";

const CREDENTIALS_DIR =
  process.env.AGNT_CREDENTIALS_DIR || join(process.env.HOME || "", ".agnt");
const CREDENTIALS_FILE = join(CREDENTIALS_DIR, "credentials.json");
const KEYRING_ACCOUNT = "credentials";

export interface Credentials {
  token: string;
  agent_id?: string;
  jwt?: string;
  wallet_session?: string;
}

function readFileCredentials(): Credentials | null {
  try {
    if (!existsSync(CREDENTIALS_FILE)) return null;
    const raw = readFileSync(CREDENTIALS_FILE, "utf8");
    const parsed = JSON.parse(raw) as Credentials;
    return parsed.token ? parsed : null;
  } catch {
    return null;
  }
}

function writeFileCredentials(creds: Credentials): void {
  try {
    mkdirSync(CREDENTIALS_DIR, { recursive: true });
    writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2));
  } catch {
    // File write failed — caller already attempted keyring, nothing more to do
  }
}

export function loadCredentials(): Credentials | null {
  // 1. Try keyring
  const keyringRaw = keyringRead(KEYRING_ACCOUNT);
  if (keyringRaw) {
    try {
      return JSON.parse(keyringRaw) as Credentials;
    } catch {
      // Corrupt keyring entry — fall through
    }
  }

  // 2. Try migration (file → keyring) then keyring again
  if (migrateFileToKeyring(CREDENTIALS_FILE, KEYRING_ACCOUNT)) {
    const migrated = keyringRead(KEYRING_ACCOUNT);
    if (migrated) {
      try {
        return JSON.parse(migrated) as Credentials;
      } catch {
        // fall through
      }
    }
  }

  // 3. Fallback: read file directly (keyring unavailable, e.g. no libsecret)
  return readFileCredentials();
}

export function saveCredentials(creds: Credentials): void {
  // Prefer keyring, fall back to file
  if (!keyringWrite(KEYRING_ACCOUNT, JSON.stringify(creds))) {
    writeFileCredentials(creds);
  }
}

export function clearCredentials(): void {
  const keyringOk = keyringDelete(KEYRING_ACCOUNT);

  // Clean up any leftover file too
  try {
    if (existsSync(CREDENTIALS_FILE)) {
      unlinkSync(CREDENTIALS_FILE);
    }
  } catch {
    // ignore
  }

  if (!keyringOk) {
    console.error(
      "Warning: Failed to delete credentials from system keychain. You may need to remove them manually.",
    );
  }
}

export function getToken(): null | string {
  return loadCredentials()?.token ?? null;
}

export function getJwt(): string | null {
  return loadCredentials()?.jwt ?? null;
}

export function isLoggedIn(): boolean {
  return getToken() !== null;
}
