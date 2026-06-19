import { Args, Command, Flags } from "@oclif/core";
import { createHash } from "node:crypto";
import chalk from "chalk";

import { isLoggedIn } from "../../lib/auth.js";
import { client, authHeaders, tryRecoverAuth } from "../../lib/client.js";
import {
  assertTaskManager,
  fetchProjectBuildPipeline,
} from "../../lib/project-pipeline.js";
import { logAuthError, outputJSON } from "../../lib/output.js";
import { outputFlags } from "../../lib/flags.js";

// v0.16.0: ask the project owner a blocking question. The platform
// spawns a new question task (node_kind='question') that BLOCKS the
// parent until the owner answers. Use this sparingly — see the
// "Messaging etiquette" section of the agnt-cli-builder skill.
//
// For non-blocking notes use `agnt task comment`.
// For ephemeral updates use `agnt task progress`.
//
// Backend: POST /projects/:id/tasks/:slug/clarify
//   body: { question_title, question_body_md?, idempotency_key? }
//   returns 201: { question_task: {slug,title}, blocked_task: {slug,status} }
//   auth: requireProjectExecutor
//
// Idempotency: we generate a stable key from
// `sha256(projectId:slug:question).slice(0,16)` so retries from the
// same intent don't spawn duplicate Q-tasks. Two builders asking
// the "same" question textually (different idempotency keys) will
// still get duplicates — that's by design, they're different agents.
export default class TaskClarify extends Command {
  static description =
    "Ask the owner a blocking question (task_manager). Spawns a Q-task; the parent blocks until the owner answers. Use sparingly.";

  static examples = [
    '<%= config.bin %> task clarify my-project T01 "Should the booking persist for 30 days or forever?"',
    '<%= config.bin %> task clarify my-project T01 "Color palette?" --body "The spec mentions \u201cwarm tones\u201d \u2014 should I match the Telegram theme or use a fixed palette?"',
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
    question: Args.string({
      description:
        "Blocking question (becomes the question task's title). One per ambiguity — do not bundle.",
      required: true,
    }),
  };

  static flags = {
    ...outputFlags,
    body: Flags.string({
      description:
        "Optional longer-form markdown body (rendered as the question task's spec). Defaults to the positional `question`.",
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(TaskClarify);

    if (!isLoggedIn()) {
      logAuthError(this);
      return;
    }

    const pipeline = await fetchProjectBuildPipeline(args.projectId);
    const pipelineErr = assertTaskManager(pipeline);
    if (pipelineErr) {
      this.error(pipelineErr.message, { exit: 1 });
    }

    const questionTitle = args.question.trim();
    if (!questionTitle) {
      this.error("question is required (and cannot be empty)", {
        exit: 2,
      });
    }
    const questionBody = (flags.body ?? questionTitle).trim();

    // Stable idempotency key per (project, task, question). Same
    // intent, retried → same Q-task. Different question text → new
    // Q-task (which is what the user wants).
    const idempotencyKey = createHash("sha256")
      .update(`${args.projectId}:${args.slug}:${questionTitle}`)
      .digest("hex")
      .slice(0, 16);

    let { data, error } = await client.POST(
      "/builder/projects/{id}/tasks/{slug}/clarify" as never,
      {
        headers: authHeaders(),
        params: { path: { id: args.projectId, slug: args.slug } },
        body: {
          question_title: questionTitle,
          question_body_md: questionBody,
          idempotency_key: idempotencyKey,
        } as never,
      } as never,
    );
    if (error && (error as { error?: string }).error === "unauthorized") {
      const recovered = await tryRecoverAuth();
      if (recovered) {
        ({ data, error } = await client.POST(
          "/builder/projects/{id}/tasks/{slug}/clarify" as never,
          {
            headers: authHeaders(),
            params: { path: { id: args.projectId, slug: args.slug } },
            body: {
              question_title: questionTitle,
              question_body_md: questionBody,
              idempotency_key: idempotencyKey,
            } as never,
          } as never,
        ));
      }
    }

    if (error) {
      const errObj = error as { error?: string; status?: number } | undefined;
      const msg = errObj?.error ?? "Unknown";
      if (/not found/i.test(msg)) {
        this.error(
          `Project or task not found: ${args.projectId}/${args.slug}`,
          { exit: 4 },
        );
        return;
      }
      // 409 on the backend means an existing Q-task with the same
      // idempotency key already exists. Surface the original
      // question slug so the agent can read it via `agnt task thread`.
      if (errObj?.status === 409) {
        this.error(
          `A Q-task for this question already exists: ${msg}\n` +
            `Read it with: agnt task thread ${args.projectId} ${args.slug}`,
          { exit: 1 },
        );
        return;
      }
      this.error(`Failed to create question task: ${msg}`, { exit: 1 });
    }

    if (flags.json || flags.quiet) {
      outputJSON(data, flags.json, flags.quiet);
      return;
    }
    const qSlug = (
      data as { question_task?: { slug?: string } } | undefined
    )?.question_task?.slug;
    const blockedSlug = (
      data as { blocked_task?: { slug?: string } } | undefined
    )?.blocked_task?.slug;
    process.stdout.write(
      chalk.green(
        `✓ Question task created${qSlug ? `: ${qSlug}` : ""}.\n`,
      ) +
        chalk.dim(
          `  The owner must answer before you can proceed on ${
            blockedSlug ?? args.slug
          }.\n` +
            `  Continue working on unblocked parts in the meantime; ` +
            `check \`agnt task thread ${args.projectId} ${args.slug}\` before each push.\n`,
        ),
    );
  }
}
