import { Args, Command } from "@oclif/core";
import chalk from "chalk";

import { outputFlags } from "../../lib/flags.js";
import { outputJSONAuto } from "../../lib/output.js";
import { client, unwrapProject } from "../../lib/client.js";

// v0.18.0: whole_bot is the ONLY build pipeline (agnt-api #240). The
// `task_manager` + `phase` SQL discriminators remain in the model for
// legacy rows; `resolveBuildPipeline` always stamps `whole_bot` on
// new projects. This command surfaces build_mode so the agent
// knows which driver is in play.
//
//   - build_mode=local_agent — YOU build the whole bot per
//     docs/blueprint.md, open a PR; platform gates/reviews/publishes
//     (agnt-api #208). The "what to do" is: clone → read blueprint →
//     build → ensure specs PASS → push PR.
//   - build_mode=platform_agent — the platform cloud agent (docker
//     harness + whole_bot_prompt.txt) drives the build. Nothing for
//     the CLI agent to do; watch via `agnt project show <id>`
//     (build_progress.{stage_label, percent, passes[]}, added in
//     agnt-api #209).
type ProjectResponse = {
  id?: string;
  slug?: string;
  name?: string;
  status?: string;
  build_mode?: "platform_agent" | "local_agent";
  build_pipeline?: string;
  [k: string]: unknown;
};

const BUILD_MODES = {
  platform_agent:
    "platform_agent (the platform's cloud agent drives the build — nothing for an agent to do here)",
  local_agent:
    "local_agent (YOUR agent builds the whole bot per docs/blueprint.md; platform gates/reviews/publishes)",
} as const;

export default class ProjectShow extends Command {
  static description =
    "Show project details (whole_bot build + build_mode). Pipeline is whole_bot-only as of v0.18.0.";

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
    // build_mode predates v0.14.0; older servers may not return it.
    // Default to platform_agent for backward compat.
    const buildMode = project.build_mode ?? "platform_agent";
    // v0.18.0: build_pipeline is now whole_bot-only on new projects
    // (agnt-api #240). Legacy rows may still carry `phase` or
    // `task_manager`; the CLI treats anything not equal to
    // `whole_bot` as the platform-agent default (the canonical
    // driver for legacy projects).
    const buildPipeline = project.build_pipeline ?? "whole_bot";

    if (flags.json) {
      // JSON path: pass through, but normalise the two flags so
      // downstream scripts can rely on them being present.
      outputJSONAuto(
        { ...project, build_mode: buildMode, build_pipeline: buildPipeline },
        true,
        flags.quiet,
      );
      return;
    }

    if (flags.quiet) {
      outputJSONAuto(
        {
          id: project.id ?? args.id,
          build_mode: buildMode,
          build_pipeline: buildPipeline,
        },
        false,
        true,
      );
      return;
    }

    // Human output. We deliberately keep it short — agents cut
    // long outputs. The build_mode line is the headline new bit.
    const slug = project.slug ?? args.id;
    const name = (project.name as string | undefined) ?? slug;
    const status = project.status ?? "—";
    const modeDesc = BUILD_MODES[buildMode] ?? buildMode;
    const pipelineDesc =
      buildPipeline === "whole_bot"
        ? "whole_bot (N-pass build against docs/blueprint.md; check build_mode above for who builds)"
        : `${buildPipeline} (legacy — server still carries this from a pre-v0.18.0 row; expected whole_bot)`;
    const modeHint =
      buildMode === "local_agent"
        ? "In local_agent mode, YOU build the whole bot per docs/blueprint.md and open a PR; platform gates/reviews/publishes."
        : "In platform_agent mode, the cloud agent drives the build; watch via build_progress.stage_label + passes[].";

    const lines: string[] = [];
    lines.push(`Project: ${chalk.bold(name)} ${chalk.dim(`(${slug})`)}`);
    lines.push(`Status:  ${status}`);
    lines.push(`Build mode: ${modeDesc}`);
    lines.push(chalk.dim(`            ${modeHint}`));
    lines.push(`Build pipeline: ${pipelineDesc}`);
    process.stdout.write(lines.join("\n") + "\n");
  }
}