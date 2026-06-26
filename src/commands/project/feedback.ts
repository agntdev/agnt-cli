import { Args, Command } from "@oclif/core";
import chalk from "chalk";

import { outputFlags } from "../../lib/flags.js";
import { outputJSON } from "../../lib/output.js";
import { client, authHeaders } from "../../lib/client.js";

// v0.18.0: POST /projects/:id/feedback — the owner "Ship an update"
// / "Request a change" entry (agnt-api #239 + agnt-gm.ai #76/#78).
//
// For a whole_bot: enqueues an update round — the bot re-enters
// the building phase carrying the owner's ask as the next pass's
// feedback; the N-pass loop applies it and redeploys. Only a
// finished bot (published/failed) is eligible — a still-building
// bot keeps the request log-only and tells the owner to wait
// (HTTP 409, surfaced here).
//
// For non-whole-bot (legacy rows still on task_manager / phase):
// 404 — the upstream handler rejects non-whole-bot updates.
//
// The feedback text is the natural-language change request
// ("add a /refund command", "rename the start button to Menu",
// "fix the timezone bug"). The next pass's prompt carries it
// forward to the agent-runner / next local-agent PR.
//
// The feedback arg is positional (so oclif requires it), and
// accepts ONE argv token. In the shell, wrap multi-word change
// requests in quotes.

type FeedbackBody = { text: string };

export default class ProjectFeedback extends Command {
  static description =
    'Ship an update — request a change to a built whole_bot ("Ship an update" composer)';

  static examples = [
    '<%= config.bin %> project feedback proj_abc "Add a /refund command"',
    "<%= config.bin %> project feedback my-bot \"Rename the start button to 'Menu'\"",
    '<%= config.bin %> project feedback proj_abc "Fix the timezone bug" --json',
  ];

  static args = {
    projectId: Args.string({
      description: "Project ID or slug (must be a finished whole_bot)",
      required: true,
    }),
    text: Args.string({
      description: "What to change — the next pass's prompt carries this forward.",
      required: true,
    }),
  };

  static flags = {
    ...outputFlags,
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ProjectFeedback);

    const text = (args.text ?? "").trim();
    if (text.length === 0) {
      this.error("text is required (and must be non-empty)", { exit: 2 });
    }

    const res = await client.POST(
      "/builder/projects/{id}/feedback" as never,
      {
        params: { path: { id: args.projectId } },
        headers: authHeaders(),
        body: { text } as FeedbackBody,
      } as never,
    );
    const status = res.response?.status;
    const errBody = res.error as { error?: string } | undefined;

    if (status === 404) {
      this.error(
        `Project not found, or not a whole_bot (only whole_bot supports updates): ${args.projectId}`,
        { exit: 4 },
      );
    }
    if (status === 409) {
      this.error(
        `A build is already in progress for ${args.projectId} — try again once the bot is live.`,
        { exit: 9 },
      );
    }
    if (status === 400) {
      this.error(`Bad request: ${errBody?.error ?? "text invalid"}`, { exit: 2 });
    }
    if (res.error) {
      this.error(`API error: ${errBody?.error ?? "Unknown"}`, { exit: 1 });
    }

    if (flags.json) {
      outputJSON(
        { ok: true, enqueued: true, project: args.projectId, ...((res.data ?? {}) as object) },
        true,
        Boolean(flags.quiet),
      );
      return;
    }
    if (flags.quiet) {
      process.stdout.write("enqueued\n");
      return;
    }
    process.stdout.write(
      chalk.green("✓ Update enqueued") +
        chalk.dim(
          ` — ${args.projectId} re-enters building; the next pass carries your ask forward.`,
        ) +
        "\n",
    );
  }
}