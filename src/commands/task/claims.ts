import { Command } from "@oclif/core";
import chalk from "chalk";

import { isLoggedIn } from "../../lib/auth.js";
import { client, authHeaders } from "../../lib/client.js";
import { formatRelative, formatAbsolute } from "../../lib/format.js";
import { logAuthError, outputJSON } from "../../lib/output.js";
import { outputFlags } from "../../lib/flags.js";

// Cross-project claim listing. Shows every task the current agent has an
// active claim on, with a human-readable timer. Built without a dedicated
// backend endpoint — N+1 fan-out across live projects (same trade-off as
// `agnt task list --mine` until #122 lands on the backend).
//
// Why: builders running 2-3 projects in parallel lose track of which
// claim expires when. The skill tells them to refresh, but a real-time
// listing is what they actually want. Post-launch builder feedback 2026-06-10.
export default class TaskClaims extends Command {
  static description =
    "List all your active task claims across live projects, with expiry timers";

  static examples = [
    "<%= config.bin %> task claims",
    "<%= config.bin %> task claims --json",
  ];

  static flags = {
    ...outputFlags,
  };

  static aliases = ["claims"];

  async run(): Promise<void> {
    const { flags } = await this.parse(TaskClaims);

    if (!isLoggedIn()) {
      logAuthError(this);
      return;
    }

    // 1. Resolve who I am.
    const me = await fetchMyUsername();
    if (!me) {
      this.error(
        "Could not resolve your GitHub username via /builder/agents/me. Run `agnt auth login` first.",
        { exit: 3 },
      );
      return;
    }

    // 2. Pull all live projects.
    const projects = await fetchLiveProjects();
    if (projects.length === 0) {
      if (flags.json) {
        outputJSON({ claims: [], total: 0 }, true, false);
      } else {
        process.stdout.write(
          chalk.dim("No live projects. Nothing to claim from.\n"),
        );
      }
      return;
    }

    // 3. For each live project, fetch the DAG, then for each task check
    //    whether the agent is an active claimer. Fan-out is bounded by
    //    (live project count) × (tasks per project) and runs in parallel.
    //    The /builder/projects/:id/tasks/:slug endpoint is the only one
    //    that exposes the full claimers list (see #118 / F1 for the
    //    planned fix that moves this into /dag).
    const perProject = await Promise.all(
      projects.map((p) => collectClaimsForProject(p, me)),
    );
    const claims = perProject
      .flat()
      // Soonest-expiring first — what the builder is most likely to
      // need to act on.
      .sort((a, b) => a.expiresAtMs - b.expiresAtMs);

    if (flags.json || flags.quiet) {
      outputJSON(
        { claims, total: claims.length, as_of: new Date().toISOString() },
        flags.json,
        flags.quiet,
      );
      return;
    }

    if (claims.length === 0) {
      process.stdout.write(
        chalk.dim(
          "No active claims. Run `agnt ready` to find something to work on.\n",
        ),
      );
      return;
    }

    process.stdout.write(
      chalk.bold(
        `${claims.length} active claim${claims.length === 1 ? "" : "s"} ` +
          `(expires soonest first):\n\n`,
      ),
    );

    for (const c of claims) {
      const relative = formatRelative(c.expiresAtMs);
      const absolute = formatAbsolute(c.expiresAt);
      const timerColor =
        c.expiresAtMs < Date.now()
          ? chalk.red
          : c.expiresAtMs - Date.now() < 30 * 60 * 1000
            ? chalk.yellow
            : chalk.green;

      const otherNote = c.otherClaimers.length
        ? chalk.dim(` · ${c.otherClaimers.length} other working on it`)
        : "";

      process.stdout.write(
        chalk.cyan(`  ${c.taskSlug} `) +
          chalk.bold(c.taskTitle) +
          chalk.dim(` · ${c.projectName} (${c.projectSlug})\n`) +
          chalk.dim(`    claimed: ${c.claimedAt}  ·  expires: `) +
          timerColor(`${relative}`) +
          chalk.dim(` (${absolute})`) +
          otherNote +
          "\n",
      );
    }

    process.stdout.write(
      chalk.dim(
        "\nTip: claims expire in 2h. Refresh with `agnt task claim <project> <slug>` " +
          "or open a PR before expiry. Cross-project release is a backend gap (#122).\n",
      ),
    );
  }
}

// Single claim record after cross-project fan-out.
interface ClaimRecord {
  projectSlug: string;
  projectName: string;
  taskSlug: string;
  taskTitle: string;
  claimedAt: string;
  expiresAt: string;
  expiresAtMs: number;
  otherClaimers: string[];
}

// One project at a time. Returns the active claims for `username` in that
// project. Errors are swallowed (project may have just gone non-live, or
// the user lost auth on this call); we return [] for that project and let
// the rest of the loop succeed.
async function collectClaimsForProject(
  project: { slug: string; name: string },
  username: string,
): Promise<ClaimRecord[]> {
  try {
    const { data: dag, error } = await client.GET(
      "/builder/projects/{id}/dag",
      { params: { path: { id: project.slug } } },
    );
    if (error || !dag) return [];

    const tasks =
      (dag as { tasks?: Array<{ slug: string }> }).tasks ?? [];

    // Per-task fetch for the full claimers list. Parallel within the
    // project; bounded concurrency across projects via Promise.all on
    // the outer loop. Same shape as `task list --mine`.
    const checks = await Promise.all(
      tasks.map(async (t) => {
        const { data: taskData } = await client.GET(
          "/builder/projects/{id}/tasks/{slug}",
          { params: { path: { id: project.slug, slug: t.slug } } },
        );
        const task = (
          taskData as
            | {
                task?: {
                  title?: string;
                  claimers?: Array<{
                    username?: string;
                    claimed_at?: string;
                    expires_at?: string;
                  }>;
                };
              }
            | undefined
        )?.task;
        const claimers = task?.claimers ?? [];
        const mine = claimers.find(
          (c) => (c.username ?? "").toLowerCase() === username.toLowerCase(),
        );
        if (!mine) return null;
        const expiresAt = mine.expires_at ?? "";
        return {
          projectSlug: project.slug,
          projectName: project.name,
          taskSlug: t.slug,
          taskTitle: task?.title ?? t.slug,
          claimedAt: mine.claimed_at ?? "",
          expiresAt,
          expiresAtMs: expiresAt ? Date.parse(expiresAt) : 0,
          otherClaimers: claimers
            .filter((c) => (c.username ?? "").toLowerCase() !== username.toLowerCase())
            .map((c) => c.username ?? "")
            .filter(Boolean),
        } satisfies ClaimRecord;
      }),
    );

    return checks.filter((c): c is ClaimRecord => c !== null);
  } catch {
    return [];
  }
}

// Pull every live project. Single page, default limit 50. The agntdev
// platform rarely has more than 50 simultaneous live projects, so this
// is fine; if it ever becomes a problem, add a follow-up loop on offset.
async function fetchLiveProjects(): Promise<
  Array<{ slug: string; name: string }>
> {
  try {
    const { data, error } = await client.GET("/builder/projects", {
      params: { query: { status: "live", limit: 50 } },
    });
    if (error || !data) return [];
    const list =
      (data as { projects?: Array<{ slug: string; name?: string }> })
        .projects ?? [];
    return list.map((p) => ({ slug: p.slug, name: p.name ?? p.slug }));
  } catch {
    return [];
  }
}

async function fetchMyUsername(): Promise<string | null> {
  try {
    const { data } = await client.GET("/builder/agents/me", {
      headers: authHeaders(),
    });
    const u = (
      data as { agent?: { github_username?: string } } | undefined
    )?.agent?.github_username;
    if (u && typeof u === "string") return u;
  } catch {
    // fall through
  }
  return null;
}


