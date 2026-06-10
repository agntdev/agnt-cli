import { Command, Flags } from "@oclif/core";
import chalk from "chalk";

import { isLoggedIn } from "../lib/auth.js";
import { client, authHeaders } from "../lib/client.js";
import { logAuthError, outputJSON } from "../lib/output.js";
import { outputFlags } from "../lib/flags.js";

export default class Ready extends Command {
  static description =
    "Top claimable tasks across live agntdev projects — 'where do I start?'";

  static examples = [
    "<%= config.bin %> ready",
    "<%= config.bin %> ready --limit 10",
    "<%= config.bin %> ready --sort difficulty",
    "<%= config.bin %> ready --include-zero-reward",
    "<%= config.bin %> ready --json",
  ];

  static flags = {
    ...outputFlags,
    limit: Flags.integer({
      char: "l",
      default: 5,
      description: "Max tasks to show (default 5, max 100)",
    }),
    sort: Flags.string({
      char: "s",
      default: "ton_reward",
      description:
        "Sort key: ton_reward (default), reward, weight, created, difficulty, title, project, claimed",
    }),
    difficulty: Flags.string({
      char: "d",
      description: "Filter by difficulty: easy, medium, hard (comma-separated)",
    }),
    "include-zero-reward": Flags.boolean({
      description:
        "Surface 0-TON stepping-stone tasks (they unlock bigger paid tasks downstream). Overrides default sort to +reward so 0-TON tasks come first.",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Ready);

    if (!isLoggedIn()) {
      logAuthError(this);
      return;
    }

    if (flags.limit < 1) {
      this.error("limit must be at least 1", { exit: 2 });
    }

    // When --include-zero-reward is set, override the sort to +reward
    // (lowest first) so 0-TON stepping-stone tasks bubble to the top.
    // The user can still see paid tasks by raising --limit.
    const effectiveSort = flags["include-zero-reward"]
      ? "+reward"
      : flags.sort;

    const { data, error } = await client.GET("/builder/tasks", {
      headers: authHeaders(),
      params: {
        query: {
          sort: effectiveSort,
          limit: flags.limit,
          difficulty: flags.difficulty,
        },
      },
    });

    if (error) {
      this.error(
        `API error: ${(error as { error?: string }).error ?? "Unknown"}`,
        { exit: 1 },
      );
    }

    const tasks = (data?.tasks as Array<Record<string, unknown>>) ?? [];

    if (flags.json || flags.quiet) {
      outputJSON(
        { tasks, total: data?.total, available_sorts: data?.available_sorts },
        flags.json,
        flags.quiet,
      );
      return;
    }

    if (tasks.length === 0) {
      process.stdout.write(
        chalk.dim(
          "No claimable tasks right now. Check back after a foundation task merges.\n",
        ),
      );
      return;
    }

    process.stdout.write(
      chalk.bold(
        `Top ${tasks.length} claimable task${tasks.length === 1 ? "" : "s"} ` +
          `across live agntdev projects:\n\n`,
      ),
    );

    for (const t of tasks) {
      const slug = String(t.slug ?? "?");
      const title = String(t.title ?? "(untitled)");
      const project = String(t.project_name ?? t.project_slug ?? "?");
      const projectSlug = String(t.project_slug ?? "");
      const reward = String(t.ton_reward_human ?? "?");
      const difficulty = t.difficulty ? String(t.difficulty) : "—";
      const claimersCount = Number(t.claimers_count ?? 0);
      const isClaimed = Boolean(t.is_claimed);

      const claimBadge = isClaimed
        ? chalk.yellow(` [${claimersCount} claiming]`)
        : chalk.green(" [open]");

      // 0-TON tasks are stepping stones — they unlock downstream paid
      // tasks. Surface that so a builder doesn't skip them.
      const isSteppingStone =
        reward === "0" || reward === "0.0" || reward === "0.00";
      const steppingStoneBadge = isSteppingStone
        ? chalk.dim(" 🪨 stepping stone")
        : "";

      process.stdout.write(
        chalk.cyan(`  ${slug}`) +
          chalk.bold(` ${title}`) +
          chalk.dim(` · ${difficulty} · ${reward} TON`) +
          steppingStoneBadge +
          claimBadge +
          "\n",
      );
      process.stdout.write(
        chalk.dim(
          `    project: ${project} (${projectSlug})  ·  claim: agnt task claim ${projectSlug} ${slug}\n`,
        ),
      );
    }

    process.stdout.write(
      chalk.dim(
        `\nTip: \`agnt dag show <project>\` to see the full dependency graph; \`agnt task show <project> <slug>\` for the spec.\n`,
      ),
    );
  }
}
