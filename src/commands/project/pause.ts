import { Args, Command, Flags } from "@oclif/core";
import chalk from "chalk";

import { outputFlags } from "../../lib/flags.js";
import { outputJSON } from "../../lib/output.js";
import { client, authHeaders } from "../../lib/client.js";

// v0.18.0: PUT /projects/:id/bot/pause — owner pause/resume toggle.
// Pause tears the running container down (async) and the deploy
// worker sweep skips paused bots (no auto-redeploy). Resume clears
// the flag and triggers a redeploy through the same worker path
// as the deploy button. Idempotent (same-state PUT is a 200 no-op).

type PauseBody = { paused: boolean };

type PauseResponse = {
  paused?: boolean;
  paused_at?: string | null;
  [k: string]: unknown;
};

export default class ProjectPause extends Command {
  static description =
    "Pause or resume the managed Telegram bot (owner only)";

  static examples = [
    "<%= config.bin %> project pause proj_abc --on",
    "<%= config.bin %> project pause my-bot --off",
    "<%= config.bin %> project pause proj_abc --on --json",
  ];

  static args = {
    projectId: Args.string({
      description: "Project ID or slug",
      required: true,
    }),
  };

  static flags = {
    ...outputFlags,
    on: Flags.boolean({
      description: "Pause the bot (no incoming messages handled).",
      exclusive: ["off"],
    }),
    off: Flags.boolean({
      description: "Resume the bot (redeploy through the worker).",
      exclusive: ["on"],
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ProjectPause);

    if (flags.on === flags.off) {
      this.error("pick one: --on to pause, --off to resume", { exit: 2 });
    }
    const paused = flags.on === true;

    const res = await client.PUT(
      "/builder/projects/{id}/bot/pause" as never,
      {
        params: { path: { id: args.projectId } },
        headers: authHeaders(),
        body: { paused } as PauseBody,
      } as never,
    );
    const status = res.response?.status;
    const errBody = res.error as { error?: string } | undefined;

    if (status === 404) {
      // 404 here can mean either "project not found" or "no bot
      // provisioned for this project" — surface the upstream text.
      this.error(`Not found: ${errBody?.error ?? args.projectId}`, { exit: 4 });
    }
    if (res.error) {
      this.error(`API error: ${errBody?.error ?? "Unknown"}`, { exit: 1 });
    }

    const r = (res.data ?? {}) as PauseResponse;
    if (flags.json) {
      outputJSON(r, true, Boolean(flags.quiet));
      return;
    }
    if (flags.quiet) {
      process.stdout.write(`${r.paused ? "paused" : "running"}\n`);
      return;
    }
    if (r.paused) {
      process.stdout.write(
        chalk.green("✓ Bot paused") +
          chalk.dim(" — incoming messages are dropped; auto-redeploy paused.") +
          "\n",
      );
    } else {
      process.stdout.write(
        chalk.green("✓ Bot resumed") +
          chalk.dim(" — redeploying now via the deploy worker.") +
          "\n",
      );
    }
  }
}