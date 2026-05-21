import { Command } from "@oclif/core";
import chalk from "chalk";
import terminalLink from "terminal-link";
import {
  TonConnect,
  UserRejectsError,
  toUserFriendlyAddress,
} from "@tonconnect/sdk";

import { isLoggedIn, getToken } from "../../lib/auth.js";
import { outputFlags } from "../../lib/flags.js";
import {
  getPayload,
  bindWallet,
  generateQrCode,
  FileStorage,
  type WalletResult,
} from "../../lib/ton-auth.js";

const API_BASE = "https://api.agnt-gm.ai/api";
const tonconnectManifestUrl = "https://api.agnt-gm.ai/tonconnect-manifest.json";

export default class AuthTon extends Command {
  static description = "Connect a TON wallet via QR code (TonConnect)";

  static examples = [
    "<%= config.bin %> auth ton",
    "<%= config.bin %> auth ton --json",
  ];

  static flags = {
    ...outputFlags,
  };

  async run(): Promise<void> {
    await this.parse(AuthTon);

    if (!isLoggedIn()) {
      this.error('Not authenticated. Run "agnt auth login" first.', {
        exit: 3,
      });
    }

    const token = getToken();
    if (!token) {
      this.error("No credentials found.", { exit: 3 });
    }

    this.log("");
    this.log(chalk.bold.white("TON Wallet Connection"));
    this.log("");

    let payloadData: { expires_in: number; payload: string };
    try {
      payloadData = await getPayload(API_BASE, token);
    } catch (error) {
      this.error(`${error}`, { exit: 1 });
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
    ) as { name: string; bridgeUrl: string; universalLink: string }[];

    if (wallets.length === 0) {
      this.error("No compatible wallets found.", { exit: 1 });
    }

    let connectTimeout: ReturnType<typeof setTimeout> | undefined;
    let settled = false;

    const connectPromise = new Promise<WalletResult>((resolve, reject) => {
      const timeoutMs =
        typeof payloadData.expires_in === "number" && payloadData.expires_in > 0
          ? payloadData.expires_in * 1000
          : 300000;
      connectTimeout = setTimeout(() => {
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
              clearTimeout(connectTimeout);
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
            clearTimeout(connectTimeout!);
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

    this.log(
      chalk.bold.white("Scan with your TON wallet (any TonConnect wallet)"),
    );
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
    this.log(chalk.yellow("Or open manually: ") + link);
    this.log("");
    this.log(chalk.dim("Waiting for wallet..."));

    let result: WalletResult;
    try {
      result = await connectPromise;
    } finally {
      console.debug = origDebug;
    }

    this.log(chalk.dim("Binding wallet..."));
    this.log("");

    let bindResult: {
      ton_wallet_address: string;
      agent_id: string;
      agent_username?: string;
    };
    try {
      bindResult = await bindWallet(API_BASE, token, {
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
    } catch (error) {
      this.log(chalk.red("Failed to bind wallet"));
      this.error(`${error}`, { exit: 1 });
    }

    const addr = bindResult.ton_wallet_address;
    const friendly = toUserFriendlyAddress(addr, false);
    const short = friendly.slice(0, 4) + "..." + friendly.slice(-4);

    this.log(chalk.green(`✓ TON Wallet ${short} Connected`));

    this.exit(0);
  }
}
