import { Args, Command, Flags } from "@oclif/core";
import chalk from "chalk";

import { isLoggedIn } from "../../lib/auth.js";
import { client, authHeaders, tryRecoverAuth } from "../../lib/client.js";
import { fetchProjectBuildPipeline } from "../../lib/project-pipeline.js";
import { formatTimerWithAbsolute } from "../../lib/format.js";
import { logAuthError, outputJSON } from "../../lib/output.js";
import { outputFlags } from "../../lib/flags.js";

export default class TaskClaim extends Command {
  static description =
    "Claim a task (advisory, 2h, non-locking). First valid PR wins. Pass --cancel to release.";

  static examples = [
    "<%= config.bin %> task claim proj_abc123 T01",
    "<%= config.bin %> task claim my-project T01 --json",
    "<%= config.bin %> task claim my-project T01 --cancel",
  ];

  static flags = {
    ...outputFlags,
    cancel: Flags.boolean({
      description:
        "Release the claim instead of claiming (the slug becomes claimable again).",
      default: false,
    }),
  };

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

  async run(): Promise<void> {
    const { args, flags } = await this.parse(TaskClaim);

    if (!isLoggedIn()) {
      logAuthError(this);
      return;
    }

    // v0.16.0: --cancel releases the claim via POST .../cancel.
    // Distinct from `agnt task show` (read) and from the
    // POST /claim flow below. Runs before we touch /claim.
    if (flags.cancel) {
      let { data, error } = await client.POST(
        "/builder/projects/{id}/tasks/{slug}/cancel" as never,
        {
          headers: authHeaders(),
          params: { path: { id: args.projectId, slug: args.slug } },
        } as never,
      );
      if (
        error &&
        (error as { error?: string }).error === "unauthorized"
      ) {
        const recovered = await tryRecoverAuth();
        if (recovered) {
          ({ data, error } = await client.POST(
            "/builder/projects/{id}/tasks/{slug}/cancel" as never,
            {
              headers: authHeaders(),
              params: { path: { id: args.projectId, slug: args.slug } },
            } as never,
          ));
        }
      }
      if (error) {
        const msg =
          (error as { error?: string }).error ?? "Unknown";
        if (/not found/i.test(msg)) {
          this.error(
            `Project or task not found: ${args.projectId}/${args.slug}`,
            { exit: 4 },
          );
          return;
        }
        this.error(`Failed to release claim: ${msg}`, { exit: 1 });
        return;
      }
      if (flags.json || flags.quiet) {
        outputJSON(data, flags.json, flags.quiet);
        return;
      }
      process.stdout.write(
        chalk.green(
          `✓ Released claim on ${args.projectId}/${args.slug}\n`,
        ),
      );
      return;
    }

    let { data, error } = await client.POST(
      "/builder/projects/{id}/tasks/{slug}/claim",
      {
        headers: authHeaders(),
        params: { path: { id: args.projectId, slug: args.slug } },
      },
    );

    // Older servers may have rotated the key — try to recover with stored
    // JWT, then retry once. Mirrors the recovery path in client.ts.
    if (error && (error as { error?: string }).error === "unauthorized") {
      const recovered = await tryRecoverAuth();
      if (recovered) {
        ({ data, error } = await client.POST(
          "/builder/projects/{id}/tasks/{slug}/claim",
          {
            headers: authHeaders(),
            params: { path: { id: args.projectId, slug: args.slug } },
          },
        ));
      }
    }

    if (error) {
      const errObj = error as unknown as { error?: string };
      const msg = errObj.error ?? "Unknown";
      if (msg.toLowerCase().includes("not found")) {
        this.error(
          `Project or task not found: ${args.projectId}/${args.slug}`,
          { exit: 4 },
        );
        return;
      }
      // 409 surface area: phase not active / task not open / not claimable
      // for some other gate reason. Pass the reason through verbatim.
      // Special case: the chicken-and-egg "phase is failed" message — when
      // a phase review failed, the platform materializes fix tasks but blocks
      // claiming them. The escape hatch is to skip the claim entirely and
      // push a PR whose branch+title match the fix task slug — the platform
      // matches those automatically. (See agnt-cli-builder SKILL.md,
      // "When phase is failed and you can't claim anything".)
      if (/phase (is|has) failed|while the phase is active/i.test(msg)) {
        const hint =
          `Build flow is blocked — fix tasks are unclaimable by design. ` +
          `Skip the claim and push a PR whose branch = agent/<your-github-handle>/<fix-slug> ` +
          `and title = "[<fix-slug>] <title>" — the platform matches ` +
          `branch+title to the fix task automatically.`;
        this.error(`Cannot claim: ${msg}\nHint: ${hint}`, { exit: 1 });
        return;
      }
      this.error(`Cannot claim: ${msg}`, { exit: 1 });
      return;
    }

    if (flags.json || flags.quiet) {
      outputJSON(data, flags.json, flags.quiet);
      return;
    }

    // Human output. process.stdout.write (not this.log) so the runCommand
    // test harness captures it through the same pipe the user sees.
    const claimers = (data?.claimers as Array<{ username?: string }>) ?? [];
    const expiresAt = data?.claim_expires_at as string | undefined;
    const others = claimers.length - 1;

    process.stdout.write(
      chalk.green("✓ Claimed ") +
        chalk.bold(`${args.slug} `) +
        `of ${args.projectId} for 2h (advisory, not a lock).\n`,
    );
    if (others > 0) {
      process.stdout.write(
        chalk.yellow(
          `! ${others} other agent${others === 1 ? "" : "s"} also working on it. First valid PR wins.\n`,
        ),
      );
    }
    if (expiresAt) {
      // Human-friendly timer: "in 1h 47m (2026-06-10 16:11 UTC)".
      // The relative form is what the builder needs at a glance; the
      // absolute UTC is for the log. Same data as before, just easier
      // to read in the moment.
      const expiresMs = Date.parse(expiresAt);
      process.stdout.write(
        chalk.dim(`  Expires: ${formatTimerWithAbsolute(expiresMs)}\n`),
      );
    }

    // Print the canonical branch + PR recipe so the agent doesn't have to
    // guess the format. F1 of post-launch feedback: branch+title trap cost
    // a real builder a redo. The skill and the CLI MUST agree.
    //
    // M7 (v0.14.0): we no longer emit OWNER:BRANCH or query /builder/agents/me.
    // We don't fork on the platform, so plain `--head <branch>` works.
    // The branch name is `agent/<task-slug>` (the work branch); the agent's
    // GitHub identity is what `gh auth login` recorded. If a future contributor
    // forks, they can add `--head <user>:<branch>` themselves.
    //
    // M2 (v0.14.0): for `task_manager` projects, the agent must also call
    // `POST /tasks/:slug/pr` with the PR URL after `gh pr create`, or the
    // platform doesn't link the PR to the task. We fetch the project once
    // to learn the build_pipeline, then print the right recipe.
    //
    // Title format: `[<task-slug>] <task title>`. The platform's PR→task
    // matcher (agnt-api commit 568c0d4) now matches the leading
    // `[<slug>]` against project task slugs directly. Putting the task
    // slug in brackets means the matcher takes the bracket path and we
    // don't have to rely on the T-number regex fallback.
    //
    // Task title: fetched via GET /builder/projects/:id/tasks/:slug because
    // the claim response doesn't carry it. Fallback to the slug only if
    // the fetch fails (so the recipe always prints).
    const projectSlug = String(
      (data as Record<string, unknown> | undefined)?.project_slug ?? args.projectId,
    );
    // Three-layer fallback for the title so the recipe always prints a
    // meaningful PR title: (1) follow-up GET /tasks/:slug returns the
    // canonical title; (2) the claim response may carry `task_title`
    // directly (older servers); (3) fall back to the slug so the
    // command line stays valid even on a fully broken API.
    const embeddedTitle = String(
      (data as Record<string, unknown> | undefined)?.task_title ?? "",
    );
    const taskTitle =
      (await fetchTaskTitle(args.projectId, args.slug)) ||
      embeddedTitle ||
      args.slug;
    const buildPipeline = await fetchProjectBuildPipeline(args.projectId);
    const branch = `agent/${args.slug}`;
    const title = `[${args.slug}] ${taskTitle}`;
    const prBody = `Claimed via: agnt task claim ${projectSlug} ${args.slug}`;

    process.stdout.write(
      chalk.cyan("\nOpen the PR with:\n") +
        chalk.dim(`  Branch: ${branch}\n`) +
        chalk.dim(`  Title:  ${title}`) +
        chalk.dim(`   (project: ${projectSlug})\n`) +
        chalk.bold(
          `\n  gh pr create --base main --head ${branch} \\\n` +
            `    --title "${title}" \\\n` +
            `    --body "${prBody}"\n`,
        ),
    );

    // v0.16.0: replaced the curl with a first-class CLI command.
    // The agent no longer needs the API key in scope — `agnt task
    // submit` uses the same auth context as `agnt task claim`.
    if (buildPipeline === "task_manager") {
      process.stdout.write(
        chalk.yellow(
          "\nThis is a task_manager project. After `gh pr create` succeeds, " +
            "register the PR with the platform:\n",
        ) +
          chalk.bold(
            `  agnt task submit ${projectSlug} ${args.slug} <pr-url>\n`,
          ) +
          chalk.dim(
            `  (extract the URL from \`gh pr view --json url -q .url\` or paste it manually)\n`,
          ),
      );
    }

    process.stdout.write(
      chalk.dim(
        `\nNext: work on a branch and open a PR — the platform LLM reviewer auto-validates against ${args.slug}.md.\n`,
      ),
    );
  }
}

// Fetch the real task title via GET /builder/projects/:id/tasks/:slug.
// The /claim response doesn't carry the title, so a follow-up is
// required to print a meaningful PR title. Returns an empty string on
// any failure so the caller can layer its own fallback (embedded
// `task_title` from the claim response, then the slug).
async function fetchTaskTitle(
  projectId: string,
  slug: string,
): Promise<string> {
  try {
    const { data } = await client.GET(
      "/builder/projects/{id}/tasks/{slug}",
      {
        params: { path: { id: projectId, slug } },
      },
    );
    const title = (data as { task?: { title?: string } } | undefined)?.task
      ?.title;
    if (title && typeof title === "string") return title;
  } catch {
    // fall through
  }
  return "";
}

// v0.16.0: `fetchProjectBuildPipeline` is now in
// `src/lib/project-pipeline.ts` (shared with the new task_manager
// write commands). It throws on missing/unknown values instead of
// silently defaulting to "phase" — the agent sees a real error if
// the server is misconfigured.
