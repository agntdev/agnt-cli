import { Args, Command, Flags } from "@oclif/core";
import chalk from "chalk";

import { isLoggedIn } from "../../lib/auth.js";
import { client, authHeaders } from "../../lib/client.js";
import { outputJSONAuto } from "../../lib/output.js";
import { outputFlags } from "../../lib/flags.js";

export default class ProjectConfirmFund extends Command {
  static description = "Confirm a manual TON deposit to a project reward pool";

  static examples = [
    "<%= config.bin %> project confirm-fund my-slug --tx-hash abc123...",
    "<%= config.bin %> project confirm-fund 73d7ba91 --tx-hash abc123... --json",
  ];

  static args = {
    id: Args.string({
      description: "Project ID or slug",
      required: true,
    }),
  };

  static flags = {
    ...outputFlags,
    "tx-hash": Flags.string({
      description: "On-chain transaction hash of the deposit",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ProjectConfirmFund);

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

    const project = data?.project;
    if (!project) {
      this.error(`Project not found: ${args.id}`, { exit: 4 });
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

    this.log(chalk.dim("Confirming deposit..."));

    const { error: confirmError } = await client.POST(
      "/builder/admin/projects/{id}/confirm-ton-deposit",
      {
        params: { path: { id: project.id! } },
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: { tx_hash: flags["tx-hash"] },
      },
    );

    if (confirmError) {
      const errMsg =
        typeof confirmError === "object" &&
        confirmError !== null &&
        "error" in confirmError
          ? (confirmError as Record<string, unknown>).error
          : "Unknown";
      if (errMsg === "not_found") {
        this.error(
          "Deposit not found. Verify the tx-hash is correct and the transaction is on-chain.",
          { exit: 4 },
        );
      }
      this.error(`Confirmation failed: ${String(errMsg)}`, { exit: 1 });
    }

    this.log(chalk.green("✓ Deposit confirmed — TON pool funded"));

    const result = {
      project_id: project.id,
      status: "funded",
      tx_hash: flags["tx-hash"],
    };

    outputJSONAuto(result, flags.json, flags.quiet);
  }
}
