import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { Entry } from "@napi-rs/keyring";

const CREDENTIALS_DIR =
  process.env.AGNT_CREDENTIALS_DIR || join(process.env.HOME || "", ".agnt");
const CREDENTIALS_FILE = join(CREDENTIALS_DIR, "credentials.json");
const KEYRING_SERVICE = "agnt-cli";
const KEYRING_ACCOUNT = "credentials";

export interface Credentials {
  token: string;
  agent_id?: string;
  jwt?: string;
  wallet_session?: string;
}

function readKeyring(): Credentials | null {
  try {
    const entry = new Entry(KEYRING_SERVICE, KEYRING_ACCOUNT);
    const raw = entry.getPassword();
    return raw ? (JSON.parse(raw) as Credentials) : null;
  } catch {
    return null;
  }
}

function writeKeyring(creds: Credentials): void {
  const entry = new Entry(KEYRING_SERVICE, KEYRING_ACCOUNT);
  entry.setPassword(JSON.stringify(creds));
}

function deleteKeyring(): void {
  try {
    const entry = new Entry(KEYRING_SERVICE, KEYRING_ACCOUNT);
    entry.deleteCredential();
  } catch {
    // ignore
  }
}

function migrateFileToKeyring(): void {
  if (!existsSync(CREDENTIALS_FILE)) return;

  try {
    const raw = readFileSync(CREDENTIALS_FILE, "utf8");
    const parsed = JSON.parse(raw) as Credentials;
    if (!parsed.token) return;

    // Only migrate if keyring is empty
    const existing = readKeyring();
    if (!existing) {
      writeKeyring(parsed);
      unlinkSync(CREDENTIALS_FILE);
    }
  } catch {
    // Migration failed silently — file stays, keyring takes over going forward
  }
}

export function loadCredentials(): Credentials | null {
  const keyring = readKeyring();
  if (keyring) return keyring;

  // First run with old file: migrate then return
  migrateFileToKeyring();
  return readKeyring();
}

export function saveCredentials(creds: Credentials): void {
  writeKeyring(creds);
}

export function clearCredentials(): void {
  deleteKeyring();
}

export function getToken(): null | string {
  return loadCredentials()?.token ?? null;
}

export function isLoggedIn(): boolean {
  return getToken() !== null;
}
