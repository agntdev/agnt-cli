import { Args, Command, Flags } from "@oclif/core";
import chalk from "chalk";

import { outputFlags } from "../../lib/flags.js";
import { outputJSON } from "../../lib/output.js";
import { client, authHeaders } from "../../lib/client.js";

// v0.18.0: PUT /projects/:id/build-mode — switch the build driver
// of a whole_bot project between local_agent (your agent opens
// the PRs; platform gates/reviews/publishes) and platform_agent
// (the platform's cloud agent does the whole build — a paid
// assignment, owner pays 10★ in the mini-app to deploy it).
//
// Use cases:
//   - Started local_agent, want the cloud to take over → switch to
//     platform_agent and tell the owner to assign the cloud agent
//     from the mini-app.
//   - Started platform_agent, want to take over the next pass
//     yourself → switch to local_agent and open a PR.
//
// Note: changing to platform_agent does NOT auto-deploy the
// cloud agent — it just makes the project eligible for one.
// The owner assigns + pays for the cloud agent from the mini-app
// (Telegram Stars, 10★); this CLI command does NOT touch payment.

type BuildModeBody = {
  build_mode: "local_agent" | "platform_agent";
};

export default class ProjectBuildMode extends Command {
  static description =
    "Switch the build driver of a whole_bot project (local_agent ↔ platform_agent)";

  static examples = [
    "<%= config.bin %> project build-mode proj_abc --mode platform_agent",
    "<%= config.bin %> project build-mode my-bot --mode local_agent",
    "<%= config.bin %> project build-mode proj_abc --mode platform_agent --json",
  ];

  static args = {
    projectId: Args.string({
      description: "Project ID or slug",
      required: true,
    }),
  };

  static flags = {
    ...outputFlags,
    mode: Flags.string({
      char: "m",
      description: "New build mode: local_agent (you build) or platform_agent (cloud agent)",
      options: ["local_agent", "platform_agent"],
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ProjectBuildMode);

    const res = await client.PUT(
      "/builder/projects/{id}/build-mode" as never,
      {
        params: { path: { id: args.projectId } },
        headers: authHeaders(),
        body: { build_mode: flags.mode } as BuildModeBody,
      } as never,
    );
    const status = res.response?.status;
    const errBody = res.error as { error?: string } | undefined;

    if (status === 404) {
      this.error(`Project not found: ${args.projectId}`, { exit: 4 });
    }
    if (status === 409) {
      this.error(
        `Mode switch refused: ${errBody?.error ?? "conflict"} — usually because a cloud agent is deployed (detach it first) or the project is mid-pass.`,
        { exit: 9 },
      );
    }
    if (res.error) {
      this.error(`API error: ${errBody?.error ?? "Unknown"}`, { exit: 1 });
    }

    if (flags.json) {
      outputJSON(
        { ok: true, build_mode: flags.mode, project: (res.data ?? {}) as object },
        true,
        Boolean(flags.quiet),
      );
      return;
    }
    if (flags.quiet) {
      process.stdout.write(`${flags.mode}\n`);
      return;
    }
    process.stdout.write(
      chalk.green(`✓ Build mode set to ${flags.mode}`) +
        (flags.mode === "platform_agent"
          ? chalk.dim(
              ` — the project is now eligible for a cloud agent; the owner assigns + pays 10★ from the mini-app.`,
            )
          : chalk.dim(` — your agent is the driver; open PRs against the repo.`)) +
        "\n",
    );
  }
}