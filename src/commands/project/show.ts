import { Args, Command } from "@oclif/core";
import chalk from "chalk";

import { outputFlags } from "../../lib/flags.js";
import { outputJSONAuto } from "../../lib/output.js";
import { client } from "../../lib/client.js";

// Surfaces build_mode (C12) so the agent knows which workflow it's
// in. Two modes:
//   - platform_agent (default, legacy) — full pipeline with LLM
//     coverage reviews, tests gate, fix_bugs loops. The "phase
//     failed" escape hatch is relevant here.
//   - local_agent — owner's own agent writes the code; project
//     auto-advances. No coverage reviews, no fix_bugs loop possible.
//     `agnt phase show` always says "no reviews (local_agent mode)".
type ProjectResponse = {
  id?: string;
  slug?: string;
  name?: string;
  status?: string;
  build_mode?: "platform_agent" | "local_agent";
  [k: string]: unknown;
};

const BUILD_MODES = {
  platform_agent:
    "platform_agent (legacy, full pipeline: LLM coverage reviews, tests gate, fix_bugs loops)",
  local_agent:
    "local_agent (your agent writes the code; the platform just hosts it and auto-advances)",
} as const;

export default class ProjectShow extends Command {
  static description = "Show project details (incl. build_mode, C12)";

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

    const project = (data ?? {}) as ProjectResponse;
    const buildMode = project.build_mode ?? "platform_agent";

    if (flags.json) {
      // JSON path: pass through, but normalise build_mode field so
      // downstream scripts can rely on it being present.
      outputJSONAuto({ ...project, build_mode: buildMode }, true, flags.quiet);
      return;
    }

    if (flags.quiet) {
      outputJSONAuto({ id: project.id ?? args.id, build_mode: buildMode }, false, true);
      return;
    }

    // Human output. We deliberately keep it short — agents cut
    // long outputs. The build_mode line is the headline new bit.
    const slug = project.slug ?? args.id;
    const name = (project.name as string | undefined) ?? slug;
    const status = project.status ?? "—";
    const modeDesc = BUILD_MODES[buildMode] ?? buildMode;
    const hint =
      buildMode === "local_agent"
        ? "In local_agent mode, you write the code; the platform just hosts it."
        : "In platform_agent mode, the LLM reviewer validates your PR; you may need to fix and re-push.";

    const lines: string[] = [];
    lines.push(`Project: ${chalk.bold(name)} ${chalk.dim(`(${slug})`)}`);
    lines.push(`Status:  ${status}`);
    lines.push(`Build mode: ${modeDesc}`);
    lines.push(chalk.dim(`          ${hint}`));
    process.stdout.write(lines.join("\n") + "\n");
  }
}
