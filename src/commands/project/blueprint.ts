import { Args, Command } from "@oclif/core";
import chalk from "chalk";

import { outputFlags } from "../../lib/flags.js";
import { outputJSON } from "../../lib/output.js";
import { client, authHeaders } from "../../lib/client.js";

// v0.18.0: GET /builder/projects/{id}/quality/blueprint — the
// canonical spec for a whole_bot project (agnt-api #193, #203).
// The platform writes docs/blueprint.md to the project's repo
// during finalizeWholeBot, but it ALSO mirrors it here so the
// agent can read the spec without cloning the repo first.
//
// The blueprint IS your build spec. Read it before you touch any
// code; it enumerates every entry point, flow, data entity,
// integration, edge case, and required test the bot must cover.
// See the agnt-cli-builder skill for the full one-pass build flow.

type BlueprintResponse = {
  blueprint?: string;
  updated_at?: string;
  [k: string]: unknown;
};

export default class ProjectBlueprint extends Command {
  static description =
    "Show the whole_bot blueprint (the build spec the agent writes against)";

  static examples = [
    "<%= config.bin %> project blueprint proj_abc123",
    "<%= config.bin %> project blueprint my-project --json",
  ];

  static args = {
    projectId: Args.string({
      description: "Project ID or slug",
      required: true,
    }),
  };

  static flags = {
    ...outputFlags,
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ProjectBlueprint);

    const res = await client.GET(
      "/builder/projects/{id}/quality/blueprint" as never,
      {
        params: { path: { id: args.projectId } },
        headers: authHeaders(),
      } as never,
    );
    const status = res.response?.status;
    const data = res.data as BlueprintResponse | undefined;
    const errBody = res.error as { error?: string } | undefined;

    if (status === 404 || errBody?.error === "not_found") {
      this.error(`Project not found: ${args.projectId}`, { exit: 4 });
    }
    if (res.error) {
      this.error(`API error: ${errBody?.error ?? "Unknown"}`, { exit: 1 });
    }

    const bp = data ?? {};

    if (flags.json) {
      outputJSON(bp, true, Boolean(flags.quiet));
      return;
    }

    if (flags.quiet) {
      outputJSON({ blueprint: bp.blueprint ?? "" }, false, true);
      return;
    }

    if (!bp.blueprint) {
      process.stdout.write(
        chalk.dim(
          `(no blueprint on file for ${args.projectId} yet — project may not be finalized)\n`,
        ),
      );
      return;
    }

    process.stdout.write(
      chalk.bold(`Blueprint for ${args.projectId}\n`) +
        (bp.updated_at ? chalk.dim(`updated: ${bp.updated_at}\n\n`) : "\n") +
        bp.blueprint +
        "\n",
    );
  }
}