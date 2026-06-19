import { Args, Command } from "@oclif/core";
import chalk from "chalk";

import { isLoggedIn } from "../../lib/auth.js";
import { client, authHeaders, tryRecoverAuth } from "../../lib/client.js";
import {
  assertTaskManager,
  fetchProjectBuildPipeline,
} from "../../lib/project-pipeline.js";
import { logAuthError, outputJSONAuto } from "../../lib/output.js";
import { outputFlags } from "../../lib/flags.js";

// v0.16.0: read the comment thread for a task_manager task.
// Returns the chronological list of comments (agent / owner /
// system). ALWAYS call this before posting again — the owner
// may have replied silently to a previous question or feedback.
//
// Backend: GET /projects/:id/tasks/:slug/thread
//   returns: { comments: [BuilderTaskComment] }
//   auth: requireProjectExecutor
//   ordering: created_at ASC (oldest first)
//
// `progress` system messages are NOT in the thread (they go to
// chat, prefixed "🔧"). Use `agnt task progress` for those — or
// check the project chat via the TMA.
export default class TaskThread extends Command {
  static description =
    "Read all comments on a task (task_manager). Always check this before posting again — the owner may have replied.";

  static examples = [
    "<%= config.bin %> task thread my-project T01",
    "<%= config.bin %> task thread my-project T01 --json",
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
  };

  static flags = {
    ...outputFlags,
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(TaskThread);

    if (!isLoggedIn()) {
      logAuthError(this);
      return;
    }

    const pipeline = await fetchProjectBuildPipeline(args.projectId);
    const pipelineErr = assertTaskManager(pipeline);
    if (pipelineErr) {
      this.error(pipelineErr.message, { exit: 1 });
    }

    let { data, error } = await client.GET(
      "/builder/projects/{id}/tasks/{slug}/thread" as never,
      {
        headers: authHeaders(),
        params: { path: { id: args.projectId, slug: args.slug } },
      } as never,
    );
    if (error && (error as { error?: string }).error === "unauthorized") {
      const recovered = await tryRecoverAuth();
      if (recovered) {
        ({ data, error } = await client.GET(
          "/builder/projects/{id}/tasks/{slug}/thread" as never,
          {
            headers: authHeaders(),
            params: { path: { id: args.projectId, slug: args.slug } },
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
      this.error(`Failed to fetch thread: ${msg}`, { exit: 1 });
    }

    const comments =
      (data as { comments?: Array<Record<string, unknown>> } | undefined)
        ?.comments ?? [];

    if (flags.json || flags.quiet) {
      outputJSONAuto(
        { project: args.projectId, slug: args.slug, comments },
        flags.json,
        flags.quiet,
      );
      return;
    }

    if (comments.length === 0) {
      process.stdout.write(
        chalk.dim(
          `No comments yet on ${args.projectId}/${args.slug}.\n`,
        ),
      );
      return;
    }

    process.stdout.write(
      chalk.bold(`Thread: ${args.projectId}/${args.slug}\n`),
    );
    for (const c of comments) {
      const role = String(c.author_role ?? "system");
      const kind = String(c.kind ?? "note");
      const at = String(c.created_at ?? "");
      const who =
        c.author_agent_id != null
          ? `agent:${String(c.author_agent_id)}`
          : "system";
      const header =
        chalk.dim(`[${at}] `) +
        chalk.bold(`${role}`) +
        chalk.dim(` (${kind}, ${who})`);
      process.stdout.write(header + "\n");
      const body = String(c.body_md ?? "").trim();
      if (body) {
        for (const line of body.split(/\r?\n/)) {
          process.stdout.write("  " + line + "\n");
        }
      }
      process.stdout.write("\n");
    }
  }
}
