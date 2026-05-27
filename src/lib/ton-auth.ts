import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import QRCode from "qrcode";
import type { IStorage } from "@tonconnect/sdk";
import { keyringRead, keyringWrite, migrateFileToKeyring } from "./keyring.js";

export interface ProofPayload {
  address: string;
  network: string;
  public_key: string;
  proof: {
    domain: { lengthBytes: number; value: string };
    payload: string;
    signature: string;
    state_init: string;
    timestamp: number;
  };
}

export interface WalletResult {
  address: string;
  chain: string;
  publicKey: string;
  stateInit: string;
  proof: {
    timestamp: number;
    domain: { lengthBytes: number; value: string };
    payload: string;
    signature: string;
  };
}

const TONCONNECT_DIR = join(process.env.HOME || "", ".agnt");
const TONCONNECT_FILE = join(TONCONNECT_DIR, "tonconnect.json");
const KEYRING_ACCOUNT = "tonconnect";

// ---- File-based fallback for when keyring is unavailable ----

function readFileSession(): Record<string, string> {
  try {
    if (!existsSync(TONCONNECT_FILE)) return {};
    return JSON.parse(readFileSync(TONCONNECT_FILE, "utf8"));
  } catch {
    return {};
  }
}

function writeFileSession(data: Record<string, string>): void {
  try {
    mkdirSync(TONCONNECT_DIR, { recursive: true });
    writeFileSync(TONCONNECT_FILE, JSON.stringify(data));
  } catch {
    // File write failed — caller already attempted keyring
  }
}

// ---- Keyring-backed IStorage ----

export class KeyringStorage implements IStorage {
  private useKeyring: boolean;

  constructor(namespace: string) {
    // namespace is ignored — we always use the shared tonconnect account.
    // Kept for API compatibility with TonConnect SDK.
    void namespace;

    // Attempt migration on first construction
    migrateFileToKeyring(TONCONNECT_FILE, KEYRING_ACCOUNT);

    // Probe keyring once to decide which backend to use
    this.useKeyring = this.probeKeyring();
  }

  async setItem(key: string, value: string): Promise<void> {
    if (this.useKeyring) {
      const session = this.readKeyringSession();
      session[key] = value;
      if (keyringWrite(KEYRING_ACCOUNT, JSON.stringify(session))) return;
      // Keyring write failed — fall back to file for future ops
      this.useKeyring = false;
    }
    const session = readFileSession();
    session[key] = value;
    writeFileSession(session);
  }

  async getItem(key: string): Promise<string | null> {
    if (this.useKeyring) {
      const session = this.readKeyringSession();
      if (session && key in session) return session[key];
      // Keyring read returned nothing useful — try file
    }
    const session = readFileSession();
    return session[key] ?? null;
  }

  async removeItem(key: string): Promise<void> {
    if (this.useKeyring) {
      const session = this.readKeyringSession();
      delete session[key];
      if (keyringWrite(KEYRING_ACCOUNT, JSON.stringify(session))) return;
      this.useKeyring = false;
    }
    const session = readFileSession();
    delete session[key];
    writeFileSession(session);
  }

  // ---- private helpers ----

  private probeKeyring(): boolean {
    // Write a sentinel to test if keyring is functional
    return keyringWrite(KEYRING_ACCOUNT + "-probe", "1");
  }

  private readKeyringSession(): Record<string, string> {
    try {
      const raw = keyringRead(KEYRING_ACCOUNT);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }
}

// ---- API helpers ----

export async function getPayload(
  apiBase: string,
  token: string,
): Promise<{ expires_in: number; payload: string }> {
  const res = await fetch(`${apiBase}/builder/agents/me/wallet/payload`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`Failed to get wallet payload: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { expires_in: number; payload: string };
  return { expires_in: data.expires_in, payload: data.payload };
}

export async function bindWallet(
  apiBase: string,
  token: string,
  proof: ProofPayload,
): Promise<{
  agent_id: string;
  agent_username: string;
  ton_wallet_address: string;
}> {
  const res = await fetch(`${apiBase}/builder/agents/me/wallet/bind`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(proof),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    if (res.status === 409) {
      throw Object.assign(
        new Error(`Wallet already bound to another agent: ${text}`),
        { code: "CONFLICT" },
      );
    }
    if (res.status === 422) {
      throw Object.assign(new Error(`Proof rejected: ${text}`), {
        code: "VALIDATION",
      });
    }
    throw new Error(`Failed to bind wallet: ${res.status} ${text}`);
  }

  const json = (await res.json()) as {
    agent_id: string;
    agent_username: string;
    ton_wallet_address: string;
  };
  return json;
}

/** Read TON wallet address from tonconnect storage (keyring or file).
 *  Returns raw 0:hex address, or null if no wallet connected. */
export function getTonWalletAddress(): string | null {
  // Try keyring first
  const keyringRaw = keyringRead(KEYRING_ACCOUNT);
  if (keyringRaw) {
    const addr = extractAddress(keyringRaw);
    if (addr) return addr;
  }

  // Fall back to file
  const fileRaw = readFileSessionRaw();
  if (fileRaw) {
    const addr = extractAddress(fileRaw);
    if (addr) return addr;
  }

  return null;
}

function readFileSessionRaw(): string | null {
  try {
    if (!existsSync(TONCONNECT_FILE)) return null;
    return readFileSync(TONCONNECT_FILE, "utf8");
  } catch {
    return null;
  }
}

/** Recursively search for a TON raw address (0:<hex>) in nested objects. */
function extractAddress(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw);
    return findTonAddress(parsed);
  } catch {
    return null;
  }
}

function findTonAddress(obj: unknown): string | null {
  if (obj === null || obj === undefined) return null;
  if (typeof obj !== "object") return null;

  // Check each key-value pair recursively
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    // Direct address match: any "address" key whose value looks like 0:<hex>
    if (
      key === "address" &&
      typeof value === "string" &&
      /^0:[0-9a-fA-F]{64}$/.test(value)
    ) {
      return value;
    }
    // Recurse into nested objects/arrays
    if (typeof value === "object" && value !== null) {
      const found = findTonAddress(value);
      if (found) return found;
    }
  }
  return null;
}

export async function generateQrCode(text: string): Promise<string> {
  return QRCode.toString(text, {
    type: "terminal",
    small: true,
    margin: 2,
  });
}
