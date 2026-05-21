import { Command, Flags } from "@oclif/core";
import chalk from "chalk";
import terminalLink from "terminal-link";
import {
  TonConnect,
  UserRejectsError,
  toUserFriendlyAddress,
} from "@tonconnect/sdk";

import { isLoggedIn, getToken, saveCredentials } from "../lib/auth.js";
import {
  getPayload,
  bindWallet,
  generateQrCode,
  FileStorage,
  type WalletResult,
} from "../lib/ton-auth.js";

const API_BASE = (
  process.env.AGNT_API_BASE || "https://api.agnt-gm.ai/api"
).replace(/\/$/, "");
const tonconnectManifestUrl = "https://api.agnt-gm.ai/tonconnect-manifest.json";

const openBrowser = async (url: string) => {
  const open = (await import("open")).default;
  await open(url);
};

interface CreateSessionResponse {
  session_id: string;
  login_url: string;
  expires_at: string;
  expires_in: number;
}

interface PollReadyResponse {
  status: "ready";
  token: string;
  jwt?: string;
  agent?: {
    github_username?: string;
    id: string;
  };
}

export default class Init extends Command {
  static description = "Initialize and authenticate with agnt via browser";

  static examples = [
    "<%= config.bin %> init",
    "<%= config.bin %> init --skip-wallet",
  ];

  static flags = {
    skipWallet: Flags.boolean({
      char: "w",
      default: false,
      description: "Skip wallet connection (non-interactive)",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Init);

    // Step 1: Authenticate
    this.log("");
    this.log(chalk.bold.white("Step 1: Authentication"));
    this.log("─".repeat(40));
    this.log("");

    if (isLoggedIn()) {
      this.log(`  ${chalk.green("✓")} Already authenticated`);
      this.log("");
    } else {
      await this.authenticate();
    }

    // Step 2: Connect wallet (optional)
    this.log(chalk.bold.white("Step 2: TON Wallet"));
    this.log("─".repeat(40));
    this.log("");

    const token = getToken();
    if (!token) {
      this.error("No credentials found.", { exit: 1 });
    }

    const walletConnected = await this.checkWalletStatus(token);
    if (walletConnected) {
      this.exit(0);
    }

    this.log(`  ${chalk.yellow("✗")} No TON wallet connected`);
    this.log("");
    this.log("  TON wallet is required to receive token rewards.");
    this.log("");

    if (flags.skipWallet || !process.stdin.isTTY) {
      this.log('  Run "agnt auth ton" to connect your wallet later.');
      this.log("");
      this.exit(0);
    }

    const answer = await this.prompt("  Connect wallet now? (Y/n): ");
    if (answer.toLowerCase() !== "n" && answer.toLowerCase() !== "no") {
      await this.connectWallet(token);
    } else {
      this.log('  Skipping. Run "agnt auth ton" when ready.');
      this.log("");
    }
  }

  private async authenticate(): Promise<void> {
    this.log("  Opening browser for authentication...");

    let session: CreateSessionResponse;
    try {
      const res = await fetch(`${API_BASE}/auth/cli-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_name: "agnt-cli" }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "Unknown");
        this.error(`Failed to create auth session: ${res.status} ${text}`, {
          exit: 1,
        });
      }
      session = (await res.json()) as CreateSessionResponse;
    } catch (error) {
      this.error(`Failed to create auth session: ${error}`, { exit: 1 });
    }

    const authUrl = `${API_BASE}/auth/github?cli_session=${session.session_id}&redirect=1`;
    await openBrowser(authUrl);

    this.log(`  ${chalk.yellow("→")} Open browser to: ${authUrl}`);
    this.log("  Waiting for authentication...");
    this.log("");

    const timeoutMs = 300_000;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      await sleep(2000);

      try {
        const res = await fetch(
          `${API_BASE}/auth/cli-session/${session.session_id}`,
        );

        if (res.status === 200) {
          const data = (await res.json()) as PollReadyResponse;
          saveCredentials({
            token: data.token,
            jwt: data.jwt,
            agent_id: data.agent?.id,
          });
          this.log(
            `  ${chalk.green("✓")} Authenticated as ${data.agent?.github_username ?? "agent"}`,
          );
          this.log("");
          return;
        }

        if (res.status === 410) {
          this.error('Session expired. Run "agnt init" again.', { exit: 1 });
        }
      } catch {
        // Network blip — retry
      }
    }

    this.error("Authentication timed out after 5 minutes.", { exit: 1 });
  }

  private async checkWalletStatus(token: string): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/builder/agents/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = (await res.json()) as { ton_wallet_address?: string };
        if (data.ton_wallet_address) {
          const addr = data.ton_wallet_address;
          const friendly = toUserFriendlyAddress(addr, false);
          const short = friendly.slice(0, 6) + "..." + friendly.slice(-4);
          this.log(`  ${chalk.green("✓")} TON wallet connected: ${short}`);
          this.log("");
          return true;
        }
      }
    } catch {
      // Ignore
    }
    return false;
  }

  private async connectWallet(token: string): Promise<void> {
    this.log("  Connecting TON wallet...");
    this.log("");

    let payloadData: { expires_in: number; payload: string };
    try {
      payloadData = await getPayload(API_BASE, token);
    } catch (error) {
      this.error(`Failed to get wallet payload: ${error}`, { exit: 1 });
    }

    if (!payloadData.payload) {
      this.error("Empty payload from server. Cannot connect.", { exit: 1 });
    }

    const tonconnect = new TonConnect({
      manifestUrl: tonconnectManifestUrl,
      storage: new FileStorage("tonconnect"),
      analytics: { mode: "off" },
    });

    const origDebug = console.debug;
    console.debug = () => {};

    let allWallets: Awaited<ReturnType<typeof TonConnect.getWallets>>;
    try {
      allWallets = await TonConnect.getWallets();
    } catch (error) {
      this.error(`Failed to fetch wallets: ${error}`, { exit: 1 });
    }

    const wallets = allWallets.filter(
      (w) =>
        "bridgeUrl" in w &&
        w.bridgeUrl &&
        "universalLink" in w &&
        w.universalLink,
    ) as { bridgeUrl: string; universalLink: string }[];

    if (wallets.length === 0) {
      this.error("No compatible wallets found.", { exit: 1 });
    }

    let settled = false;
    const timeoutMs =
      payloadData.expires_in > 0 ? payloadData.expires_in * 1000 : 300_000;

    const connectPromise = new Promise<WalletResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error("Connection timeout"));
        }
      }, timeoutMs);

      tonconnect.onStatusChange(
        (wallet) => {
          if (!wallet?.account) return;

          const tonProof = wallet.connectItems?.tonProof;
          if (tonProof && "proof" in tonProof) {
            if (!settled) {
              settled = true;
              clearTimeout(timeout);
              resolve({
                address: wallet.account.address ?? "",
                chain: wallet.account.chain ?? "",
                publicKey: wallet.account.publicKey ?? "",
                stateInit: wallet.account.walletStateInit ?? "",
                proof: tonProof.proof as {
                  timestamp: number;
                  domain: { lengthBytes: number; value: string };
                  payload: string;
                  signature: string;
                },
              });
            }
          }
        },
        (error) => {
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            if (error instanceof UserRejectsError) {
              reject(error);
            } else {
              reject(new Error("Wallet connection failed"));
            }
          }
        },
      );
    });

    const connectUrl = tonconnect.connect(
      wallets.map((w) => ({
        bridgeUrl: w.bridgeUrl,
        universalLink: w.universalLink,
      })),
      { tonProof: payloadData.payload },
    );

    if (!connectUrl) {
      this.error("Failed to generate connection URL", { exit: 1 });
    }

    this.log(chalk.bold.white("  Scan with your TON wallet"));
    this.log("");

    let qr: string;
    try {
      qr = await generateQrCode(connectUrl);
    } catch (error) {
      this.error(`Failed to generate QR code: ${error}`, { exit: 1 });
    }

    for (const line of qr.split("\n")) {
      this.log(chalk.white(line));
    }

    const link = terminalLink(connectUrl, connectUrl);
    this.log(chalk.yellow("  Or open manually: ") + link);
    this.log("");
    this.log(chalk.dim("  Waiting for wallet..."));

    let result: WalletResult;
    try {
      result = await connectPromise;
    } finally {
      console.debug = origDebug;
    }

    this.log("");
    this.log("  Binding wallet...");

    try {
      const bindResult = await bindWallet(API_BASE, token, {
        address: result.address,
        network: result.chain,
        public_key: result.publicKey,
        proof: {
          timestamp: result.proof.timestamp,
          domain: result.proof.domain,
          payload: result.proof.payload,
          signature: result.proof.signature,
          state_init: result.stateInit,
        },
      });

      const addr = bindResult.ton_wallet_address;
      const friendly = toUserFriendlyAddress(addr, false);
      const short = friendly.slice(0, 6) + "..." + friendly.slice(-4);
      this.log("");
      this.log(chalk.green(`  ✓ TON Wallet ${short} Connected`));
      this.log("");
    } catch (error) {
      this.error(`Failed to bind wallet: ${error}`, { exit: 1 });
    }
  }

  private async prompt(message: string): Promise<string> {
    return new Promise((resolve) => {
      process.stdout.write(message);
      process.stdin.resume();
      process.stdin.once("data", (data) => {
        process.stdin.pause();
        resolve(data.toString().trim());
      });
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}
