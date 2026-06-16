import { Args, Command } from "@oclif/core";
import chalk from "chalk";

import { outputFlags } from "../../lib/flags.js";
import { outputJSONAuto } from "../../lib/output.js";
import { client } from "../../lib/client.js";

// Always show spec_body (the real contract). The --spec/--body
// flags were cut in v0.13.0 — spec_body is the contract, period.
// body_md is the §-pointer summary and only useful as context
// inside the default output (shown as a stub below the spec).
// Why drop the flags: agents cut long outputs. Having three
// commands worth of spec data in one place is the agent-friendly
// default. If a builder wants the full JSON, --json gives it.
export default class TaskShow extends Command {
  static description =
    "Show task details — spec_body (the actual contract) plus metadata";

  static examples = [
    "<%= config.bin %> task show proj_abc123 T01",
    "<%= config.bin %> task show proj_abc123 T01 --json",
  ];

  static args = {
    projectId: Args.string({
      description: "Project ID or slug",
      required: true,
    }),
    slug: Args.string({ description: "Task slug (e.g. T01)", required: true }),
  };

  static flags = {
    ...outputFlags,
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(TaskShow);

    const { data, error } = await client.GET(
      "/builder/projects/{id}/tasks/{slug}",
      { params: { path: { id: args.projectId, slug: args.slug } } },
    );

    if (error) {
      if (error.error === "not_found") {
        this.error(`Task not found: ${args.projectId}/${args.slug}`, {
          exit: 4,
        });
      }
      this.error(`API error: ${error.error ?? "Unknown"}`, { exit: 1 });
    }

    const task = data?.task as
      | {
          title?: string;
          body_md?: string;
          spec_body?: string;
          node_kind?: string;
        }
      | undefined;
    const specBody = task?.spec_body ?? "";
    const bodyMd = task?.body_md ?? "";
    // M4 (v0.14.0): render node_kind for task_manager projects so the
    // agent can see at a glance whether this is a scaffold/feature/
    // epic/question/review task before claiming. The skill teaches
    // which kinds are claimable; the CLI just surfaces the value.
    const nodeKind = task?.node_kind ?? "";

    if (!flags.json && !flags.quiet) {
      process.stdout.write(chalk.bold(`# ${task?.title ?? args.slug}\n\n`));

      if (nodeKind) {
        process.stdout.write(
          chalk.dim(`Node kind: ${nodeKind}\n`) +
            chalk.dim(
              "  (scaffold/feature are claimable; epic/question/review are not — see agnt-cli-builder)\n\n",
            ),
        );
      }

      if (specBody) {
        process.stdout.write(
          chalk.cyan("## spec (the actual contract — read this)\n\n"),
        );
        process.stdout.write(specBody);
        process.stdout.write("\n\n");
      } else if (bodyMd) {
        // Older server (pre-#119): no spec_body field. Fall back to
        // body_md so the agent still has something to read. Don't
        // warn here — the JSON tail (always emitted below) carries
        // the real shape; this is just the human-readable view.
        process.stdout.write(
          chalk.cyan("## spec (older server — body_md fallback)\n\n"),
        );
        process.stdout.write(bodyMd);
        process.stdout.write("\n\n");
      } else if (nodeKind) {
        // M4 (v0.14.0): task_manager projects legitimately have no
        // body_md — the per-feature spec is in tests/specs/<slug>.json
        // and the contract is the per-feature spec, not body_md. Don't
        // say "no spec"; say "task_manager: no body_md by design".
        process.stdout.write(
          chalk.dim(
            "(no body_md — task_manager projects store the per-feature spec in tests/specs/<slug>.json)\n\n",
          ),
        );
      } else {
        process.stdout.write(
          chalk.dim("(no spec or body content from the server)\n\n"),
        );
      }

      if (bodyMd && bodyMd !== specBody && specBody) {
        // body_md is the §-pointer summary. Show as a dim stub
        // below the spec for cross-reference; the spec is the
        // real contract.
        process.stdout.write(
          chalk.dim("## body_md (short summary / §-pointers)\n\n"),
        );
        process.stdout.write(chalk.dim(bodyMd));
        process.stdout.write("\n\n");
      }
    }

    // Always include the full JSON tail so scripts / agents can
    // parse structured fields (claimers, is_claimed, status, etc.).
    outputJSONAuto(data, flags.json, flags.quiet);
  }
}
