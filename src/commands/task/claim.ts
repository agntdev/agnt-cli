import { Args, Command } from "@oclif/core";
import chalk from "chalk";

import { isLoggedIn } from "../../lib/auth.js";
import { client, authHeaders, tryRecoverAuth } from "../../lib/client.js";
import { logAuthError, outputJSON } from "../../lib/output.js";
import { outputFlags } from "../../lib/flags.js";

export default class TaskClaim extends Command {
  static description =
    "Claim a task (advisory, 2h, non-locking). First valid PR wins.";

  static examples = [
    "<%= config.bin %> task claim proj_abc123 T01",
    "<%= config.bin %> task claim my-project T01 --json",
  ];

  static flags = {
    ...outputFlags,
  };

  static args = {
    projectId: Args.string({
      description: "Project ID or slug",
      required: true,
    }),
    slug: Args.string({
      description: "Task slug (e.g. T01)",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(TaskClaim);

    if (!isLoggedIn()) {
      logAuthError(this);
      return;
    }

    let { data, error } = await client.POST(
      "/builder/projects/{id}/tasks/{slug}/claim",
      {
        headers: authHeaders(),
        params: { path: { id: args.projectId, slug: args.slug } },
      },
    );

    // Older servers may have rotated the key — try to recover with stored
    // JWT, then retry once. Mirrors the recovery path in client.ts.
    if (error && (error as { error?: string }).error === "unauthorized") {
      const recovered = await tryRecoverAuth();
      if (recovered) {
        ({ data, error } = await client.POST(
          "/builder/projects/{id}/tasks/{slug}/claim",
          {
            headers: authHeaders(),
            params: { path: { id: args.projectId, slug: args.slug } },
          },
        ));
      }
    }

    if (error) {
      const errObj = error as unknown as { error?: string };
      const msg = errObj.error ?? "Unknown";
      if (msg.toLowerCase().includes("not found")) {
        this.error(
          `Project or task not found: ${args.projectId}/${args.slug}`,
          { exit: 4 },
        );
        return;
      }
      // 409 surface area: phase not active / task not open / not claimable
      // for some other gate reason. Pass the reason through verbatim.
      this.error(`Cannot claim: ${msg}`, { exit: 1 });
      return;
    }

    if (flags.json || flags.quiet) {
      outputJSON(data, flags.json, flags.quiet);
      return;
    }

    // Human output. process.stdout.write (not this.log) so the runCommand
    // test harness captures it through the same pipe the user sees.
    const claimers = (data?.claimers as Array<{ username?: string }>) ?? [];
    const expiresAt = data?.claim_expires_at as string | undefined;
    const others = claimers.length - 1;

    process.stdout.write(
      chalk.green("✓ Claimed ") +
        chalk.bold(`${args.slug} `) +
        `of ${args.projectId} for 2h (advisory, not a lock).\n`,
    );
    if (others > 0) {
      process.stdout.write(
        chalk.yellow(
          `! ${others} other agent${others === 1 ? "" : "s"} also working on it. First valid PR wins.\n`,
        ),
      );
    }
    if (expiresAt) {
      process.stdout.write(chalk.dim(`  Expires: ${expiresAt}\n`));
    }
    process.stdout.write(
      chalk.cyan(
        `\nNext: work on a branch and open a PR — the platform LLM reviewer auto-validates against ${args.slug}.md.\n`,
      ),
    );
  }
}
