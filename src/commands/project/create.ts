import { Args, Command, Flags } from "@oclif/core";

import { client, authHeaders } from "../../lib/client.js";
import { logError, outputJSON } from "../../lib/output.js";
import { outputFlags } from "../../lib/flags.js";
import { getTonWalletAddress } from "../../lib/ton-auth.js";

export default class ProjectCreate extends Command {
  static description = "Create a new bounty project";

  static examples = [
    '<%= config.bin %> project create "Build a DeFi aggregator with cross-chain swaps"',
    '<%= config.bin %> project create "Build a CLI tool" --token-symbol MYTOK --deadline 2026-06-01',
    '<%= config.bin %> project create "API for X" --task-notes "Focus on REST endpoints"',
  ];

  static args = {
    raw_idea: Args.string({
      description: "Project idea description",
      required: true,
    }),
  };

  static flags = {
    ...outputFlags,
    name: Flags.string({
      char: "n",
      description: "Project name (derived from idea if not provided)",
    }),
    token_symbol: Flags.string({
      char: "t",
      description: "Token symbol (e.g. MYTOK)",
    }),
    total_supply: Flags.integer({
      description: "Total token supply (default 1000000000)",
    }),
    deadline: Flags.string({
      char: "d",
      description: "Deadline in RFC3339 format (e.g. 2026-06-01)",
    }),
    task_notes: Flags.string({
      description: "Optional task guidance for LLM plan generator",
    }),
    ton_reward_pool: Flags.integer({
      char: "p",
      description: "TON reward pool (in nanoTON, e.g. 500000000 for 0.5 TON)",
    }),
    owner_wallet_address: Flags.string({
      char: "w",
      description:
        "TON wallet address (raw 0:hex format). Auto-detected from connected wallet if omitted.",
      required: false,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ProjectCreate);

    const ownerWallet = await this.resolveWallet(flags.owner_wallet_address);

    const { data, error } = await client.POST("/builder/projects", {
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: {
        raw_idea: args.raw_idea,
        name: flags.name,
        token_symbol: flags.token_symbol,
        total_supply: flags.total_supply,
        deadline: flags.deadline,
        task_notes: flags.task_notes,
        ton_reward_pool_nano: flags.ton_reward_pool,
        owner_wallet_address: ownerWallet,
      },
    });

    if (error) {
      logError(
        this,
        `Failed to create project: ${error.error ?? error.details ?? "Unknown"}`,
      );
      return;
    }

    outputJSON(
      {
        project: data?.project,
        task_count: data?.task_count,
        next_step: data?.next_step,
      },
      flags.json,
      flags.quiet,
    );
  }

  private async resolveWallet(explicit: string | undefined): Promise<string> {
    if (explicit) return explicit;

    // 1. Try whoami API (server-side truth, requires auth)
    const { data, error } = await client.GET("/builder/agents/me", {
      headers: authHeaders(),
    });
    if (!error && data?.agent?.ton_wallet_address) {
      return data.agent.ton_wallet_address;
    }

    // 2. Fall back to tonconnect local storage
    const local = getTonWalletAddress();
    if (local) return local;

    // 3. Nothing found
    this.error(
      "No TON wallet address found. Either:\n" +
        "  1. Connect a wallet:  agnt auth ton\n" +
        "  2. Pass it explicitly: --owner-wallet-address 0:...",
      { exit: 2 },
    );
  }
}
