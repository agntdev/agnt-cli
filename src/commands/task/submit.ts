import { Args, Command } from "@oclif/core";
import chalk from "chalk";

import { isLoggedIn } from "../../lib/auth.js";
import { client, authHeaders, tryRecoverAuth } from "../../lib/client.js";
import {
  assertTaskManager,
  fetchProjectBuildPipeline,
} from "../../lib/project-pipeline.js";
import { logAuthError, outputJSON } from "../../lib/output.js";
import { outputFlags } from "../../lib/flags.js";

// v0.16.0: register a PR URL with the platform for a task_manager
// project. Required after `gh pr create` so the task moves to
// `in_review` and validation can start.
//
// Without this call, the platform may eventually link the PR via the
// GitHub webhook fallback, but feedback routing and payout
// attribution won't work until the row exists. (The M2 PR
// registration spec, S5.3c.)
//
// Backend: POST /projects/:id/tasks/:slug/pr
//   body: { pr_url: string, branch?: string, head_sha?: string }
//   returns: { pr_number: int, status: string }
//   auth: requireProjectExecutor (executor or owner)
export default class TaskSubmit extends Command {
  static description =
    "Register a PR URL with the platform (task_manager). Transitions the task to in_review.";

  static examples = [
    "<%= config.bin %> task submit my-project T01 https://github.com/owner/repo/pull/42",
    "<%= config.bin %> task submit proj_abc T01 <pr-url> --json",
  ];

  static args = {
    projectId: Args.string({
      description: "Project ID or slug",
      required: true,
    }),
    slug: Args.string({
      description: "Task slug (e.g. T01)",
      required: true,
    }),
    prUrl: Args.string({
      description:
        "Full PR URL (e.g. https://github.com/owner/repo/pull/123)",
      required: true,
    }),
  };

  static flags = {
    ...outputFlags,
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(TaskSubmit);

    if (!isLoggedIn()) {
      logAuthError(this);
      return;
    }

    // v0.16.0 pipeline guard. The /pr endpoint is task_manager-only;
    // the backend returns 4xx for phase projects, but we catch it
    // early with a clearer message.
    const pipeline = await fetchProjectBuildPipeline(args.projectId);
    const pipelineErr = assertTaskManager(pipeline);
    if (pipelineErr) {
      this.error(pipelineErr.message, { exit: 1 });
    }

    let { data, error } = await client.POST(
      "/builder/projects/{id}/tasks/{slug}/pr" as never,
      {
        headers: authHeaders(),
        params: { path: { id: args.projectId, slug: args.slug } },
        body: { pr_url: args.prUrl } as never,
      } as never,
    );
    if (error && (error as { error?: string }).error === "unauthorized") {
      const recovered = await tryRecoverAuth();
      if (recovered) {
        ({ data, error } = await client.POST(
          "/builder/projects/{id}/tasks/{slug}/pr" as never,
          {
            headers: authHeaders(),
            params: { path: { id: args.projectId, slug: args.slug } },
            body: { pr_url: args.prUrl } as never,
          } as never,
        ));
      }
    }

    if (error) {
      const errObj = error as { error?: string } | undefined;
      const msg = errObj?.error ?? "Unknown";
      if (/not found/i.test(msg)) {
        this.error(
          `Project or task not found: ${args.projectId}/${args.slug}`,
          { exit: 4 },
        );
        return;
      }
      this.error(`Failed to register PR: ${msg}`, { exit: 1 });
    }

    if (flags.json || flags.quiet) {
      outputJSON(data, flags.json, flags.quiet);
      return;
    }
    const prNumber = (data as { pr_number?: number } | undefined)?.pr_number;
    const status = (data as { status?: string } | undefined)?.status;
    process.stdout.write(
      chalk.green(
        `✓ Registered PR #${prNumber ?? "?"} on ${args.projectId}/${args.slug}\n`,
      ) +
        chalk.dim(
          `  Task is now ${status ?? "in_review"}. Validation will start automatically.\n`,
        ),
    );
  }
}
