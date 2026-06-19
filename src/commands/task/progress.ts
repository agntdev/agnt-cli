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

// v0.16.0: post a chat-channel progress message. Ephemeral —
// the platform writes a `task_progress` system message into the
// project chat (prefixed "🔧" in the UI). It does NOT appear in
// the task's `thread` (use `agnt task comment` for that).
//
// Use for: "50% done", "switching to test phase", "deploying".
// Do NOT use for: decisions, references, anything the owner
// might want to read later (use `comment` for those).
//
// Backend: POST /projects/:id/tasks/:slug/progress
//   body: { note: string }
//   returns: { ok: true }
//   auth: requireProjectExecutor
export default class TaskProgress extends Command {
  static description =
    "Post an ephemeral progress message to the project chat (task_manager). Prefixed '🔧' in the UI.";

  static examples = [
    '<%= config.bin %> task progress my-project T01 "50% done, switching to test phase"',
    '<%= config.bin %> task progress my-project T01 "deploying" --json',
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
      description:
        "Short progress note (will be prefixed '🔧' in the chat UI).",
      required: true,
    }),
  };

  static flags = {
    ...outputFlags,
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(TaskProgress);

    if (!isLoggedIn()) {
      logAuthError(this);
      return;
    }

    const pipeline = await fetchProjectBuildPipeline(args.projectId);
    const pipelineErr = assertTaskManager(pipeline);
    if (pipelineErr) {
      this.error(pipelineErr.message, { exit: 1 });
    }

    const note = args.message.trim();
    if (!note) {
      this.error("progress message is required (and cannot be empty)", {
        exit: 2,
      });
    }

    let { data, error } = await client.POST(
      "/builder/projects/{id}/tasks/{slug}/progress" as never,
      {
        headers: authHeaders(),
        params: { path: { id: args.projectId, slug: args.slug } },
        body: { note } as never,
      } as never,
    );
    if (error && (error as { error?: string }).error === "unauthorized") {
      const recovered = await tryRecoverAuth();
      if (recovered) {
        ({ data, error } = await client.POST(
          "/builder/projects/{id}/tasks/{slug}/progress" as never,
          {
            headers: authHeaders(),
            params: { path: { id: args.projectId, slug: args.slug } },
            body: { note } as never,
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
      this.error(`Failed to post progress note: ${msg}`, { exit: 1 });
    }

    if (flags.json || flags.quiet) {
      outputJSON(data, flags.json, flags.quiet);
      return;
    }
    process.stdout.write(
      chalk.green(`✓ Progress note posted to ${args.slug}\n`),
    );
  }
}
