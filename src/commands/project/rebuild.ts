import { Args, Command, Flags } from "@oclif/core";
import chalk from "chalk";

import { outputFlags } from "../../lib/flags.js";
import { outputJSON } from "../../lib/output.js";
import { client, authHeaders } from "../../lib/client.js";

// v0.18.0: POST /builder/projects/{id}/rebuild — the owner "Try
// again" action for a whole_bot build that ended in the terminal
// `failed` phase (agnt-api #229). The reset is minimal: clears the
// project's build-attempt history (resets the pass cap) and re-enters
// the `building` phase. The bot's accumulated code lives in the
// GitHub repo; the fresh pass RE-VERIFIES the existing bot (the
// agent-runner injects the gate-mirror spec test, so it now catches
// handler-vs-spec drift the publish gate rejects) instead of
// rebuilding from the bare template.
//
// Owner-only. Eligible iff: whole_bot pipeline, current_phase=failed,
// and a provisioned repo. 409 otherwise.

export default class ProjectRebuild extends Command {
  static description =
    "Retry a failed whole_bot build (owner only; resets the pass cap and re-enters building)";

  static examples = [
    "<%= config.bin %> project rebuild proj_abc123",
    "<%= config.bin %> project rebuild my-failed-bot --yes",
    "<%= config.bin %> project rebuild my-failed-bot --json",
  ];

  static args = {
    projectId: Args.string({
      description: "Project ID or slug (must be a failed whole_bot)",
      required: true,
    }),
  };

  static flags = {
    ...outputFlags,
    yes: Flags.boolean({
      char: "y",
      default: false,
      description: "Skip the confirmation prompt (required to actually rebuild).",
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ProjectRebuild);

    if (!flags.yes) {
      this.error(
        "Re-running a build costs cloud-agent time; pass --yes to confirm.",
        { exit: 2 },
      );
    }

    const res = await client.POST(
      "/builder/projects/{id}/rebuild" as never,
      {
        params: { path: { id: args.projectId } },
        headers: authHeaders(),
      } as never,
    );
    const status = res.response?.status;
    const data = res.data as { ok?: boolean; status?: string } | undefined;
    const errBody = res.error as { error?: string } | undefined;

    if (status === 404) {
      this.error(`Project not found: ${args.projectId}`, { exit: 4 });
    }
    if (status === 409) {
      this.error(
        `Cannot rebuild: ${errBody?.error ?? "not a failed whole_bot (need current_phase=failed and a provisioned repo)"}`,
        { exit: 9 },
      );
    }
    if (res.error) {
      this.error(`API error: ${errBody?.error ?? "Unknown"}`, { exit: 1 });
    }

    const ok = data ?? {};
    if (flags.json) {
      outputJSON(
        { ok: ok.ok ?? true, status: ok.status ?? "rebuilding" },
        true,
        Boolean(flags.quiet),
      );
      return;
    }
    if (flags.quiet) {
      process.stdout.write("rebuilding\n");
      return;
    }
    process.stdout.write(
      chalk.green("✓ Rebuild started") +
        chalk.dim(
          ` — ${args.projectId} re-enters building; watch \`agnt project show ${args.projectId}\``,
        ) +
        "\n",
    );
  }
}