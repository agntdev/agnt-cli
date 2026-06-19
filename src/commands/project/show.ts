import { Args, Command } from "@oclif/core";
import chalk from "chalk";

import { outputFlags } from "../../lib/flags.js";
import { outputJSONAuto } from "../../lib/output.js";
import { client, unwrapProject } from "../../lib/client.js";

// Surfaces build_mode (C12) so the agent knows which workflow it's
// in. Two modes:
//   - platform_agent (default, legacy) — full pipeline with LLM
//     coverage reviews, tests gate, fix_bugs loops. The "phase
//     failed" escape hatch is relevant here.
//   - local_agent — owner's own agent writes the code; project
//     auto-advances. No coverage reviews, no fix_bugs loop possible.
//     `agnt phase show` always says "no reviews (local_agent mode)".
//
// Also surfaces build_pipeline (v0.14.0, M1) — orthogonal to build_mode:
//   - phase (legacy) — the 6-phase flow, `agnt phase show` works
//   - task_manager (new) — living-DAG flow, `agnt phase show` renders
//     a different view, claim==start, requires /tasks/:slug/pr step
// Always check build_pipeline first; it determines which commands to use.
type ProjectResponse = {
  id?: string;
  slug?: string;
  name?: string;
  status?: string;
  build_mode?: "platform_agent" | "local_agent";
  build_pipeline?: "phase" | "task_manager";
  [k: string]: unknown;
};

const BUILD_MODES = {
  platform_agent:
    "platform_agent (legacy, full pipeline: LLM coverage reviews, tests gate, fix_bugs loops)",
  local_agent:
    "local_agent (your agent writes the code; the platform just hosts it and auto-advances)",
} as const;

const BUILD_PIPELINES = {
  phase:
    "phase (legacy 6-phase flow: general → design → details → dev → tests → published)",
  task_manager:
    "task_manager (new living-DAG flow: claim==start, /tasks/:slug/pr registration, no phases)",
} as const;

export default class ProjectShow extends Command {
  static description =
    "Show project details (incl. build_mode + build_pipeline)";

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
    const buildMode = project.build_mode ?? "platform_agent";
    // M1: build_pipeline was added in v0.14.0. Older servers don't
    // return it; default to "phase" (the legacy flow) so the output
    // stays meaningful for pre-v0.14.0 projects.
    const buildPipeline = project.build_pipeline ?? "phase";

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
    const pipelineDesc = BUILD_PIPELINES[buildPipeline] ?? buildPipeline;
    const modeHint =
      buildMode === "local_agent"
        ? "In local_agent mode, you write the code; the platform just hosts it."
        : "In platform_agent mode, the LLM reviewer validates your PR; you may need to fix and re-push.";
    const pipelineHint =
      buildPipeline === "task_manager"
        ? "In task_manager, claim==start; after `gh pr create`, POST /tasks/:slug/pr with the PR URL."
        : "In phase flow, the LLM reviewer runs after `gh pr create`; wait for the verdict.";

    const lines: string[] = [];
    lines.push(`Project: ${chalk.bold(name)} ${chalk.dim(`(${slug})`)}`);
    lines.push(`Status:  ${status}`);
    lines.push(`Build mode: ${modeDesc}`);
    lines.push(chalk.dim(`            ${modeHint}`));
    lines.push(`Build pipeline: ${pipelineDesc}`);
    lines.push(chalk.dim(`                ${pipelineHint}`));
    process.stdout.write(lines.join("\n") + "\n");
  }
}
