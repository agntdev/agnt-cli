import { Args, Command, Flags } from "@oclif/core";
import chalk from "chalk";

import { outputFlags } from "../../lib/flags.js";
import { outputJSON } from "../../lib/output.js";
import { client } from "../../lib/client.js";

export default class TaskShow extends Command {
  static description =
    "Show task details — spec_body (the real contract) by default, body_md on --body";

  static examples = [
    "<%= config.bin %> task show proj_abc123 T01",
    "<%= config.bin %> task show proj_abc123 T01 --spec",
    "<%= config.bin %> task show proj_abc123 T01 --body",
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
    // --spec outputs the resolved spec_body (the actual contract text
    // extracted server-side from details.md §-pointers, issue #119).
    // This is what the LLM reviewer will validate the PR against —
    // read it carefully.
    spec: Flags.boolean({
      char: "s",
      default: false,
      description:
        "Output only the spec_body field (the actual contract, not the §-pointer summary).",
    }),
    // --body outputs the short body_md field (the §-pointer summary).
    // Kept for backward compat — most older servers don't have spec_body.
    body: Flags.boolean({
      char: "b",
      default: false,
      description:
        "Output only the body_md field (the §-pointer summary, may be a one-liner).",
    }),
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
      | { title?: string; body_md?: string; spec_body?: string }
      | undefined;
    const specBody = task?.spec_body ?? "";
    const bodyMd = task?.body_md ?? "";

    // Single-field outputs go to stdout raw (for piping into other
    // tools — `agnt task show p T --spec > spec.md`).
    if (flags.spec) {
      if (specBody) {
        process.stdout.write(specBody);
      } else if (bodyMd) {
        // Older server: spec_body wasn't set. Fall back to body_md so
        // the flag still produces something useful.
        process.stdout.write(bodyMd);
        if (!flags.json) {
          this.warn(
            "spec_body not present on this server; fell back to body_md. " +
              "(Server predates issue #119.)",
          );
        }
      } else {
        process.stdout.write("");
      }
      return;
    }

    if (flags.body) {
      process.stdout.write(bodyMd);
      return;
    }

    // Default human output: show spec_body (the real contract) as the
    // headline, then a small body_md stub if present, then the rest of
    // the task as a JSON tail. The intent is: the agent reads the
    // spec, the body_md is for context.
    if (!flags.json && !flags.quiet) {
      process.stdout.write(
        chalk.bold(`# ${task?.title ?? args.slug}\n\n`),
      );

      if (specBody) {
        process.stdout.write(
          chalk.cyan("## spec (the actual contract — read this)\n\n"),
        );
        process.stdout.write(specBody);
        process.stdout.write("\n\n");
      }

      if (bodyMd && bodyMd !== specBody) {
        process.stdout.write(
          chalk.dim("## body_md (short summary / §-pointers)\n\n"),
        );
        process.stdout.write(chalk.dim(bodyMd));
        process.stdout.write("\n\n");
      }

      if (!specBody && !bodyMd) {
        process.stdout.write(
          chalk.dim("(no spec or body content from the server)\n\n"),
        );
      }
    }

    // Always include the full JSON tail so scripts / agents can read
    // the structured response (claimers, is_claimed, status, etc.).
    outputJSON(data, flags.json, flags.quiet);
  }
}
