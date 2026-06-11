import { Args, Command } from "@oclif/core";
import chalk from "chalk";

import { isLoggedIn } from "../../lib/auth.js";
import { client, authHeaders, tryRecoverAuth } from "../../lib/client.js";
import { formatTimerWithAbsolute } from "../../lib/format.js";
import { logAuthError, outputJSON } from "../../lib/output.js";
import { outputFlags } from "../../lib/flags.js";

export default class TaskClaim extends Command {
  static description =
    "Claim a task (advisory, 2h, non-locking). First valid PR wins.";

  static examples = [
    "<%= config.bin %> task claim proj_abc123 T01",
    "<%= config.bin %> task claim my-project T01 --json",
  ];

  static flags = {
    ...outputFlags,
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
    // Head ref format: `OWNER:BRANCH` (e.g. `laontme:agent/laontme/T901`).
    // `gh pr create --head <branch>` against a forked repo errors with
    // "Head sha can't be blank" because gh needs to know which fork owns
    // the head. The `OWNER:BRANCH` form works for both forks and direct
    // repos. (For direct repos the OWNER must be the repo owner.)
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
    const username = await fetchGitHubUsername();
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
    const branch = `agent/${username}/${args.slug}`;
    const headRef = username === "<you>" ? branch : `${username}:${branch}`;
    const title = `[${args.slug}] ${taskTitle}`;
    const prBody = `Claimed via: agnt task claim ${projectSlug} ${args.slug}`;

    process.stdout.write(
      chalk.cyan("\nOpen the PR with:\n") +
        chalk.dim(`  Branch: ${branch}\n`) +
        chalk.dim(`  Head:   ${headRef}  (use OWNER:BRANCH for fork+upstream)\n`) +
        chalk.dim(`  Title:  ${title}`) +
        chalk.dim(`   (project: ${projectSlug})\n`) +
        chalk.bold(
          `\n  gh pr create --base main --head ${headRef} \\\n` +
            `    --title "${title}" \\\n` +
            `    --body "${prBody}"\n`,
        ),
    );

    if (username === "<you>") {
      process.stdout.write(
        chalk.yellow(
          "\nNote: couldn't read your GitHub username from /builder/agents/me; " +
            "replaced with <you>. The recipe will fail until you `gh auth login`.\n",
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

// Fetch the current agent's GitHub username from the /builder/agents/me
// endpoint. Returns "<you>" as a placeholder on any failure so the recipe
// still prints and the user can fill in the gap manually. Cached per-call.
async function fetchGitHubUsername(): Promise<string> {
  try {
    const { data } = await client.GET("/builder/agents/me", {
      headers: authHeaders(),
    });
    const u = (data as { agent?: { github_username?: string } } | undefined)
      ?.agent?.github_username;
    if (u && typeof u === "string") return u;
  } catch {
    // fall through to placeholder
  }
  return "<you>";
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
