import { Args, Command, Flags } from "@oclif/core";
import chalk from "chalk";
import { Cell } from "@ton/core";
import {
  TonConnect,
  UserRejectsError,
  toUserFriendlyAddress,
} from "@tonconnect/sdk";

import { isLoggedIn } from "../../lib/auth.js";
import { client, authHeaders } from "../../lib/client.js";
import { outputJSONAuto } from "../../lib/output.js";
import { outputFlags } from "../../lib/flags.js";
import { KeyringStorage, generateQrCode } from "../../lib/ton-auth.js";

const tonconnectManifestUrl = "https://api.agnt-gm.ai/tonconnect-manifest.json";

// API returns funding_address / funding_amount_nano at runtime
// but they live on StageDTO, not ProjectOAS in the generated types.
interface FundableProject {
  id?: string;
  ton_reward_pool_nano?: number;
  ton_pool_funded_at?: string;
  funding_address?: string;
  funding_amount_nano?: number;
}

export default class ProjectFund extends Command {
  static description =
    "Fund a project TON reward pool via TonConnect (or show manual deposit info)";

  static examples = [
    "<%= config.bin %> project fund my-project-slug",
    "<%= config.bin %> project fund 73d7ba91 --json",
  ];

  static args = {
    id: Args.string({
      description: "Project ID or slug",
      required: true,
    }),
  };

  static flags = {
    ...outputFlags,
    manual: Flags.boolean({
      char: "m",
      description: "Skip TonConnect and show manual deposit instructions",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ProjectFund);

    if (!isLoggedIn()) {
      this.error('Not authenticated. Run "agnt auth login" first.', {
        exit: 3,
      });
    }

    const { data, error } = await client.GET("/builder/projects/{id}", {
      params: { path: { id: args.id } },
      headers: authHeaders(),
    });

    if (error) {
      const errMsg =
        typeof error === "object" && error !== null && "error" in error
          ? (error as Record<string, unknown>).error
          : "Unknown";
      if (errMsg === "not_found") {
        this.error(`Project not found: ${args.id}`, { exit: 4 });
      }
      this.error(`API error: ${String(errMsg)}`, { exit: 1 });
    }

    const project = data?.project as FundableProject | undefined;
    if (!project) {
      this.error(`Project not found: ${args.id}`, { exit: 4 });
    }

    if (!project.ton_reward_pool_nano || project.ton_reward_pool_nano <= 0) {
      this.error("This project has no TON reward pool to fund.", { exit: 2 });
    }

    const fundingAddress = project.funding_address;
    const fundingAmount = project.funding_amount_nano;

    if (!fundingAddress) {
      this.error("No funding address found for this project.", { exit: 1 });
    }

    if (project.ton_pool_funded_at) {
      const result = {
        project_id: project.id,
        status: "already_funded",
        funded_at: project.ton_pool_funded_at,
        message: "TON pool already funded.",
      };
      outputJSONAuto(result, flags.json, flags.quiet);
      return;
    }

    if (flags.manual) {
      await this.showManualInstructions(
        project.id!,
        fundingAddress,
        fundingAmount ?? project.ton_reward_pool_nano,
        flags,
      );
      return;
    }

    // ── TonConnect flow ──
    const tonconnect = new TonConnect({
      manifestUrl: tonconnectManifestUrl,
      storage: new KeyringStorage("tonconnect"),
      analytics: { mode: "off" },
    });

    try {
      await tonconnect.restoreConnection();
    } catch {
      // Restore failed — fall through to manual
    }

    if (!tonconnect.connected || !tonconnect.account) {
      this.log("");
      this.log(
        chalk.yellow(
          "⚠ No TON wallet connected. Connect one for one-click funding:",
        ),
      );
      this.log(chalk.bold("  agnt auth ton"));
      this.log("");
      this.log(
        chalk.dim(
          "Or use --manual to see deposit instructions for manual transfer.",
        ),
      );
      await this.showManualInstructions(
        project.id!,
        fundingAddress,
        fundingAmount ?? project.ton_reward_pool_nano,
        flags,
      );
      return;
    }

    const walletAddr = tonconnect.account.address;
    const friendlyWallet = toUserFriendlyAddress(walletAddr, false);
    const shortWallet =
      friendlyWallet.slice(0, 4) + "..." + friendlyWallet.slice(-4);

    this.log("");
    this.log(chalk.bold.white("Funding Project via TonConnect"));
    this.log(chalk.dim(`  Wallet:  ${shortWallet}`));
    this.log(
      chalk.dim(
        `  Amount:  ${((fundingAmount ?? project.ton_reward_pool_nano) / 1e9).toFixed(9)} TON`,
      ),
    );
    this.log(chalk.dim(`  To:      ${fundingAddress}`));
    this.log("");

    const amountNano = (
      fundingAmount ?? project.ton_reward_pool_nano
    ).toString();

    this.log(chalk.dim("Sending transaction..."));
    this.log(chalk.bold.yellow("Approve the transaction on your phone."));
    this.log("");

    let boc: string;
    try {
      const result = await tonconnect.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 3600,
        network: "-239",
        messages: [
          {
            address: fundingAddress,
            amount: amountNano,
          },
        ],
      });
      boc = result.boc;
    } catch (err) {
      if (err instanceof UserRejectsError) {
        this.log("");
        this.log(chalk.yellow("Transaction rejected on wallet."));
        this.log(chalk.dim("Use manual deposit instead:"));
        await this.showManualInstructions(
          project.id!,
          fundingAddress,
          fundingAmount ?? project.ton_reward_pool_nano,
          flags,
        );
        return;
      }
      this.error(`Transaction failed: ${err}`, { exit: 1 });
    }

    // Parse BOC — cell hash acts as message identifier for confirmation
    let cellHash: string | undefined;
    try {
      const cell = Cell.fromBase64(boc);
      const hashBytes = cell.hash();
      cellHash = Buffer.from(hashBytes).toString("hex");
    } catch {
      // BOC parsing failed — hash won't be available
    }

    this.log(chalk.green("✓ Transaction broadcast to TON network"));
    if (cellHash) {
      this.log(chalk.dim(`  Message hash: ${cellHash}`));
    }

    // Auto-confirm deposit with API
    if (cellHash) {
      try {
        const { error: confirmError } = await client.POST(
          "/builder/admin/projects/{id}/confirm-ton-deposit",
          {
            params: { path: { id: project.id! } },
            headers: { ...authHeaders(), "Content-Type": "application/json" },
            body: { tx_hash: cellHash },
          },
        );

        if (confirmError) {
          const errMsg =
            typeof confirmError === "object" &&
            confirmError !== null &&
            "error" in confirmError
              ? (confirmError as Record<string, unknown>).error
              : "Unknown";
          this.log(
            chalk.yellow(
              `  ⚠ Auto-confirmation failed: ${String(errMsg)}. The deposit may still be processing.`,
            ),
          );
        } else {
          this.log(chalk.green("  ✓ Deposit confirmed"));
        }
      } catch {
        this.log(
          chalk.dim(
            "  Deposit confirmation pending — funds should appear shortly.",
          ),
        );
      }
    }

    const result = {
      project_id: project.id,
      status: "funded",
      funding_address: fundingAddress,
      amount_nano: Number.parseInt(amountNano, 10),
      message_hash: cellHash ?? null,
    };

    outputJSONAuto(result, flags.json, flags.quiet);
  }

  private async showManualInstructions(
    projectId: string,
    address: string,
    amountNano: number,
    flags: { json: boolean; quiet: boolean },
  ): Promise<void> {
    const amountTon = (amountNano / 1e9).toFixed(9);

    this.log("");
    this.log(chalk.bold.white("Manual Deposit Instructions"));
    this.log(chalk.dim("Use this only if TonConnect is unavailable."));
    this.log("");

    // Option 1: QR code for wallet scan
    const tonLink = `ton://transfer/${address}?amount=${amountNano}`;
    this.log(chalk.bold("  Option 1 — Scan QR code with your wallet:"));
    this.log("");
    try {
      const qr = await generateQrCode(tonLink);
      for (const line of qr.split("\n")) {
        this.log(chalk.white("  " + line));
      }
    } catch {
      this.log(chalk.dim(`  (QR unavailable — use link: ${tonLink})`));
    }
    this.log("");

    // Option 2: Copy-paste
    this.log(chalk.bold("  Option 2 — Copy into your wallet:"));
    this.log(`    ${chalk.bold("Address:")} ${address}`);
    this.log(`    ${chalk.bold("Amount:")}  ${amountTon} TON`);
    this.log("");

    this.log(chalk.dim("After sending, confirm the deposit:"));
    this.log(
      chalk.dim(`  agnt project confirm-fund ${projectId} --tx-hash <hash>`),
    );

    const result = {
      project_id: projectId,
      funding_address: address,
      amount_nano: amountNano,
      amount_ton: amountTon,
      ton_link: tonLink,
      next_step:
        'Send TON manually, then run "agnt project confirm-fund ' +
        projectId +
        ' --tx-hash <on-chain-tx-hash>"',
    };

    outputJSONAuto(result, flags.json, flags.quiet);
  }
}
