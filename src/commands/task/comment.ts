import { Args, Command, Flags } from "@oclif/core";
import chalk from "chalk";

import { isLoggedIn } from "../../lib/auth.js";
import { client, authHeaders, tryRecoverAuth } from "../../lib/client.js";
import {
  assertTaskManager,
  fetchProjectBuildPipeline,
} from "../../lib/project-pipeline.js";
import { logAuthError, outputJSON } from "../../lib/output.js";
import { outputFlags } from "../../lib/flags.js";

// v0.16.0: post a note on a task_manager task. Persistent
// (visible in the task thread after submit). Non-resolving — the
// task does NOT block. Use for: "here's what I did", "spec was
// ambiguous about X, chose Y", "FYI the test harness flagged
// something I think is a false positive".
//
// For blocking questions use `agnt task clarify` instead.
// For ephemeral live updates use `agnt task progress` instead.
//
// Backend: POST /projects/:id/tasks/:slug/comments
//   body: { body_md: string }
//   returns: { ok: true, comment_id: int }
//   auth: requireProjectExecutor
//   role inference: server sets author_role=agent|owner based on
//     whether the author is the project owner
export default class TaskComment extends Command {
  static description =
    "Post a note on a task (task_manager). Persistent, non-blocking. Use for FYIs, decisions, references.";

  static examples = [
    '<%= config.bin %> task comment my-project T01 "Spec said 30 days, I went with 30; flag if you wanted forever."',
    '<%= config.bin %> task comment my-project T01 "Done; ready for review." --json',
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
    message: Args.string({
      description: "Note text (markdown). Persistent — visible in the task thread.",
      required: true,
    }),
  };

  static flags = {
    ...outputFlags,
    body: Flags.string({
      description:
        "Optional longer-form markdown (rendered as the comment body). Defaults to the positional `message` argument.",
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(TaskComment);

    if (!isLoggedIn()) {
      logAuthError(this);
      return;
    }

    const pipeline = await fetchProjectBuildPipeline(args.projectId);
    const pipelineErr = assertTaskManager(pipeline);
    if (pipelineErr) {
      this.error(pipelineErr.message, { exit: 1 });
    }

    // The backend requires body_md. The positional `message` is the
    // common case; --body is for callers that want to pass longer
    // markdown without quoting hell.
    const bodyMd = (flags.body ?? args.message).trim();
    if (!bodyMd) {
      this.error("comment message is required (and cannot be empty)", {
        exit: 2,
      });
    }

    let { data, error } = await client.POST(
      "/builder/projects/{id}/tasks/{slug}/comments" as never,
      {
        headers: authHeaders(),
        params: { path: { id: args.projectId, slug: args.slug } },
        body: { body_md: bodyMd } as never,
      } as never,
    );
    if (error && (error as { error?: string }).error === "unauthorized") {
      const recovered = await tryRecoverAuth();
      if (recovered) {
        ({ data, error } = await client.POST(
          "/builder/projects/{id}/tasks/{slug}/comments" as never,
          {
            headers: authHeaders(),
            params: { path: { id: args.projectId, slug: args.slug } },
            body: { body_md: bodyMd } as never,
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
      this.error(`Failed to post comment: ${msg}`, { exit: 1 });
    }

    if (flags.json || flags.quiet) {
      outputJSON(data, flags.json, flags.quiet);
      return;
    }
    const commentId = (data as { comment_id?: number } | undefined)?.comment_id;
    process.stdout.write(
      chalk.green(
        `✓ Comment posted to ${args.slug} (id: ${commentId ?? "?"})\n`,
      ),
    );
  }
}
