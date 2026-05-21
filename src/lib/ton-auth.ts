import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import QRCode from "qrcode";
import type { IStorage } from "@tonconnect/sdk";

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

const TONCONNECT_FILE = join(
  process.env.HOME || "",
  ".agnt",
  "tonconnect.json",
);

function readTonConnectStorage(): Record<string, string> {
  try {
    return JSON.parse(readFileSync(TONCONNECT_FILE, "utf8"));
  } catch {
    return {};
  }
}

function writeTonConnectStorage(data: Record<string, string>): void {
  mkdirSync(join(process.env.HOME || "", ".agnt"), { recursive: true });
  writeFileSync(TONCONNECT_FILE, JSON.stringify(data));
}

export class FileStorage implements IStorage {
  constructor(private key: string) {}

  async setItem(key: string, value: string): Promise<void> {
    const session = readTonConnectStorage();
    session[key] = value;
    writeTonConnectStorage(session);
  }

  async getItem(key: string): Promise<string | null> {
    const session = readTonConnectStorage();
    return session[key] ?? null;
  }

  async removeItem(key: string): Promise<void> {
    const session = readTonConnectStorage();
    delete session[key];
    writeTonConnectStorage(session);
  }
}

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

export async function generateQrCode(text: string): Promise<string> {
  return QRCode.toString(text, {
    type: "terminal",
    small: true,
    margin: 2,
  });
}
