import { Args, Command } from "@oclif/core";
import chalk from "chalk";

import { outputFlags } from "../../lib/flags.js";
import { outputJSONAuto } from "../../lib/output.js";
import { client, unwrapProject } from "../../lib/client.js";

// v0.19.0: whole_bot is the ONLY build pipeline (agnt-api #240).
// The `task_manager` + `phase` SQL discriminators remain in the model
// for legacy rows; `resolveBuildPipeline` always stamps `whole_bot`
// on new projects. This command surfaces project status + repo URL
// + build_progress. `build_mode` (local_agent / platform_agent)
// was dropped from the human output in v0.19.0 — the agent just
// builds the bot, no STOP gate, no mode branch.
type ProjectResponse = {
  id?: string;
  slug?: string;
  name?: string;
  status?: string;
  build_pipeline?: string;
  [k: string]: unknown;
};

export default class ProjectShow extends Command {
  static description =
    "Show project details (whole_bot pipeline).";

  static examples = [
    "<%= config.bin %> project show proj_abc123",
    "<%= config.bin %> project show my-project-slug",
    "<%= config.bin %> project show proj_abc123 --json",
  ];

  static args = {
    id: Args.string({ description: "Project ID or slug", required: true }),
  };

  static flags = {
    ...outputFlags,
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ProjectShow);

    const { data, error } = await client.GET("/builder/projects/{id}", {
      params: { path: { id: args.id } },
    });

    if (error) {
      if (error.error === "not_found") {
        this.error(`Project not found: ${args.id}`, { exit: 4 });
      }
      this.error(`API error: ${error.error ?? "Unknown"}`, { exit: 1 });
    }

    const project = unwrapProject<ProjectResponse>(data);
    // v0.19.0: build_mode is no longer surfaced in the human output.
    // It's still in the JSON response for backward compat with
    // any existing scripts, but the agent doesn't branch on it.
    const buildPipeline = project.build_pipeline ?? "whole_bot";

    if (flags.json) {
      // JSON path: pass through (build_mode stays in the response
      // for compatibility, just not surfaced in human output).
      outputJSONAuto(
        { ...project, build_pipeline: buildPipeline },
        true,
        flags.quiet,
      );
      return;
    }

    if (flags.quiet) {
      outputJSONAuto(
        {
          id: project.id ?? args.id,
          status: project.status ?? null,
          build_pipeline: buildPipeline,
        },
        false,
        true,
      );
      return;
    }

    // Human output — short, no mode branch.
    const slug = project.slug ?? args.id;
    const name = (project.name as string | undefined) ?? slug;
    const status = project.status ?? "—";
    const pipelineDesc =
      buildPipeline === "whole_bot"
        ? "whole_bot (N-pass build against docs/blueprint.md; you build the bot and ship a PR, platform gates/reviews/publishes)"
        : `${buildPipeline} (legacy — server still carries this from a pre-v0.18.0 row; expected whole_bot)`;

    const lines: string[] = [];
    lines.push(`Project: ${chalk.bold(name)} ${chalk.dim(`(${slug})`)}`);
    lines.push(`Status:  ${status}`);
    lines.push(`Pipeline: ${pipelineDesc}`);
    process.stdout.write(lines.join("\n") + "\n");
  }
}