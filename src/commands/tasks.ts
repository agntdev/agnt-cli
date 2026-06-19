import { Args, Command, Flags } from "@oclif/core";
import chalk from "chalk";

import { outputFlags } from "../lib/flags.js";
import { outputJSONAuto } from "../lib/output.js";
import { client, authHeaders } from "../lib/client.js";

// The unified task command. Replaces `agnt dag show <p>` and
// `agnt task list <p>`. Backend endpoint stays /dag (the platform
// calls it the DAG; we call it `tasks` for the agent surface).
//
// All filters operate on the /dag response — one round-trip, then
// narrow in the CLI. --mine is the only one that needs N+1 (per-task
// /tasks/:slug to fetch full claimer list when /dag's claimer shape
// doesn't include the current agent's username).
//
// Default output: human-readable on TTY, JSON when piped. --json
// forces JSON. --summary is a TTY debug aid (compact table), not
// the default — agents cut long outputs and pipe through jq.
type DagTask = {
  slug: string;
  title?: string;
  task_kind?: string;
  status: string;
  claimable?: boolean;
  claim_reason?: string;
  claimers?: Array<{ username?: string; agent_id?: string; claimed_at?: string; expires_at?: string }>;
};

type DagResponse = {
  project_id?: string;
  project_slug?: string;
  current_phase?: string;
  phase_status?: string;
  tasks?: DagTask[];
};

export default class Tasks extends Command {
  static description =
    "Show the task graph for a project (replaces `dag show` + `task list`)";

  static examples = [
    "<%= config.bin %> tasks proj_abc123",
    "<%= config.bin %> tasks my-project --status open",
    "<%= config.bin %> tasks my-project --kind fix",
    "<%= config.bin %> tasks my-project --mine",
    "<%= config.bin %> tasks my-project --summary",
    "<%= config.bin %> tasks my-project --json",
  ];

  static args = {
    projectId: Args.string({
      description: "Project ID or slug",
      required: true,
    }),
  };

  static flags = {
    ...outputFlags,
    status: Flags.string({
      char: "s",
      description: "Filter by status (open, in_progress, in_review, done, cancelled)",
    }),
    kind: Flags.string({
      char: "k",
      description: "Filter by task_kind (doc, fix, foundation, feature, integration)",
    }),
    // --mine: filter the project's DAG to tasks where the current agent
    // is an active claimer. Per-task /tasks/:slug N+1 to fetch full
    // claimer list. Use `agnt task claims` for a cross-project listing.
    mine: Flags.boolean({
      default: false,
      description:
        "Show only tasks where the current agent is an active claimer. Per-project only.",
    }),
    // --summary: compact TTY table (slug, kind, status, claimable,
    // title). Kept as a debug aid; default output is JSON when piped,
    // gh-cli style when on TTY. Don't dump the full JSON to a TTY
    // without this — agents cut long outputs.
    summary: Flags.boolean({
      default: false,
      description:
        "Render a compact TTY table (slug, kind, status, claimable, title).",
    }),
    // v0.16.0: --blocked calls GET /projects/{id}/blocked. NOTE: that
    // endpoint is owner-only on the backend — non-owner agents will
    // get 403. For builder-side "what can I claim?" use the default
    // `agnt tasks` view (per-task claimable + claim_reason).
    blocked: Flags.boolean({
      default: false,
      description:
        "List only blocked tasks (open question tasks + blocked/failed builds). Owner-only on the backend — non-owners get 403.",
    }),
    // v0.16.0: --next calls GET /projects/:id/tasks/next (the
    // platform's recommendation for what to claim next, given
    // your agent's review capability and the current DAG state).
    next: Flags.boolean({
      default: false,
      description:
        "Show the platform-recommended next task to claim. Returns 204 if nothing is available.",
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Tasks);

    // v0.16.0: --next is mutually exclusive with the rest of the
    // surface (it hits a different endpoint and returns a single
    // task, not a DAG). Short-circuit before the /dag fetch.
    if (flags.next) {
      await this.runNext(args.projectId, flags);
      return;
    }

    // v0.16.0: --blocked hits GET /projects/{id}/blocked (owner-only
    // on the backend — non-owners get 403 and the error message
    // points them at the default view).
    if (flags.blocked) {
      await this.runBlocked(args.projectId, flags);
      return;
    }

    const { data, error } = await client.GET("/builder/projects/{id}/dag", {
      params: { path: { id: args.projectId } },
    });

    if (error) {
      const errObj = error as { error?: string } | undefined;
      if (errObj?.error === "not_found") {
        this.error(`Project not found: ${args.projectId}`, { exit: 4 });
      }
      this.error(`API error: ${errObj?.error ?? "Unknown"}`, { exit: 1 });
    }

    const dag = (data ?? {}) as DagResponse;
    let tasks = dag.tasks ?? [];

    // --mine: N+1 to fetch per-task claimer list, then filter.
    // The /dag response may not include the full claimer list on every
    // server, so we walk /tasks/:slug to be robust.
    if (flags.mine) {
      const me = await fetchMyUsername();
      if (!me) {
        this.error(
          "Cannot resolve your GitHub username. Run `agnt login --token <amk_xxx>` first.",
          { exit: 3 },
        );
      }
      const checks = await Promise.all(
        tasks.map(async (t) => {
          const { data: taskData } = await client.GET(
            "/builder/projects/{id}/tasks/{slug}",
            { params: { path: { id: args.projectId, slug: t.slug } } },
          );
          const claimers =
            (
              taskData as
                | { task?: { claimers?: Array<{ username?: string }> } }
                | undefined
            )?.task?.claimers ?? [];
          return { slug: t.slug, claimedByMe: claimers.some((c) => c.username === me) };
        }),
      );
      const mySlugs = new Set(
        checks.filter((c) => c.claimedByMe).map((c) => c.slug),
      );
      tasks = tasks.filter((t) => mySlugs.has(t.slug));
    }

    if (flags.status) {
      const want = flags.status;
      tasks = tasks.filter((t) => t.status === want);
    }
    if (flags.kind) {
      const want = flags.kind;
      tasks = tasks.filter((t) => t.task_kind === want);
    }

    const result: DagResponse = {
      ...dag,
      tasks,
    };

    if (flags.summary && !flags.json) {
      renderSummary(this, result);
      return;
    }

    outputJSONAuto(result, flags.json, flags.quiet);
  }

  // v0.16.0: --next handler. Calls GET /projects/:id/tasks/next.
  // Returns 204 (AbortWithStatus) when the platform has no
  // recommendation. We surface that as a clear "no work right now"
  // message in human output, and as an empty result in JSON.
  //
  // Owner-only? No — this endpoint uses requireProjectExecutor,
  // which resolves the agent. Builders get their own recommendation.
  private async runNext(
    projectId: string,
    flags: { json: boolean; quiet: boolean; summary: boolean },
  ): Promise<void> {
    const { data, error } = await client.GET(
      "/builder/projects/{id}/tasks/next" as never,
      { params: { path: { id: projectId } } } as never,
    );
    if (error) {
      const errObj = error as { error?: string } | undefined;
      if (errObj?.error === "not_found") {
        this.error(`Project not found: ${projectId}`, { exit: 4 });
      }
      this.error(`API error: ${errObj?.error ?? "Unknown"}`, { exit: 1 });
    }
    // 204 No Content → data is null/undefined. Treat as "no work".
    const task = (data as { task?: Record<string, unknown> } | undefined)?.task;
    if (!task) {
      if (flags.json || flags.quiet) {
        outputJSONAuto(
          { project: projectId, next: null },
          flags.json,
          flags.quiet,
        );
        return;
      }
      process.stdout.write(
        chalk.dim(
          `No recommended next task for ${projectId} right now. ` +
            `Try \`agnt tasks ${projectId}\` for the full list.\n`,
        ),
      );
      return;
    }
    if (flags.json || flags.quiet) {
      outputJSONAuto(
        { project: projectId, next: task },
        flags.json,
        flags.quiet,
      );
      return;
    }
    const slug = String(task.slug ?? "—");
    const title = String(task.title ?? "(no title)");
    const kind = String(task.task_kind ?? task.node_kind ?? "—");
    process.stdout.write(
      chalk.green("Next task to claim:\n") +
        chalk.bold(`  ${slug}`) +
        chalk.dim(`  (${kind})  ${title}\n`) +
        chalk.dim(
          `  Claim with: agnt task claim ${projectId} ${slug}\n`,
        ),
    );
  }

  // v0.16.0: --blocked handler. Calls GET /projects/:id/blocked.
  // Owner-only on the backend. Non-owners get 403 — we surface that
  // with a clear hint to use the default `agnt tasks` view, which
  // shows per-task `claimable` + `claim_reason` for the same info
  // a builder needs.
  private async runBlocked(
    projectId: string,
    flags: { json: boolean; quiet: boolean; summary: boolean },
  ): Promise<void> {
    const { data, error } = await client.GET(
      "/builder/projects/{id}/blocked" as never,
      { params: { path: { id: projectId } } } as never,
    );
    if (error) {
      const errObj = error as { error?: string; status?: number } | undefined;
      const msg = errObj?.error ?? "Unknown";
      if (errObj?.status === 403 || /forbidden|not.+owner/i.test(msg)) {
        this.error(
          `Blocked-list is owner-only on the backend. ` +
            `For your agent's view of what's claimable right now, ` +
            `use \`agnt tasks ${projectId}\` (per-task claimable + claim_reason).`,
          { exit: 1 },
        );
        return;
      }
      if (errObj?.status === 404 || /not found/i.test(msg)) {
        this.error(`Project not found: ${projectId}`, { exit: 4 });
      }
      this.error(`API error: ${msg}`, { exit: 1 });
    }
    const items =
      (data as { items?: Array<Record<string, unknown>> } | undefined)?.items ?? [];
    if (flags.json || flags.quiet) {
      outputJSONAuto(
        { project: projectId, items },
        flags.json,
        flags.quiet,
      );
      return;
    }
    if (items.length === 0) {
      process.stdout.write(
        chalk.dim(`No blocked tasks in ${projectId}.\n`),
      );
      return;
    }
    process.stdout.write(
      chalk.yellow(`Blocked tasks in ${projectId}:\n`),
    );
    for (const it of items) {
      const slug = String(it.slug ?? "—");
      const title = String(it.title ?? "(no title)");
      const status = String(it.status ?? "—");
      const kind = String(it.node_kind ?? "—");
      const since = it.blocked_since
        ? chalk.dim(`  blocked since: ${String(it.blocked_since)}`)
        : "";
      process.stdout.write(
        `  ${chalk.bold(slug)}  ${chalk.dim(`(${kind})`)}  ${title}  ${chalk.dim(`[${status}]`)}\n${since}\n`,
      );
      if (it.warning) {
        process.stdout.write(
          chalk.yellow(`    ! ${String(it.warning)}\n`),
        );
      }
    }
  }
}

// Render a compact TTY table. process.stdout.write (not cmd.log) so
// the runCommand test harness captures it through the same pipe the
// user sees.
function renderSummary(cmd: Command, data: DagResponse): void {
  const tasks = data.tasks ?? [];
  const projectSlug = data.project_slug ?? "project";
  const phase = data.current_phase ?? "—";
  const status = data.phase_status ?? "—";

  const out = (line: string): void => {
    process.stdout.write(line + "\n");
  };

  out(
    `DAG: ${projectSlug}  (phase: ${phase} / ${status})  —  ${tasks.length} task${tasks.length === 1 ? "" : "s"}`,
  );
  if (tasks.length === 0) {
    out("  (no tasks)");
    return;
  }

  const header =
    "  " +
    "slug".padEnd(8) +
    "kind".padEnd(12) +
    "status".padEnd(12) +
    "claimable".padEnd(11) +
    "title";
  out(chalk.dim(header));
  out(chalk.dim("  " + "-".repeat(header.length - 2)));

  for (const t of tasks) {
    const slug = String(t.slug).padEnd(8);
    const kind = String(t.task_kind ?? "—").padEnd(12);
    const st = String(t.status).padEnd(12);
    const claim =
      t.claimable === true
        ? chalk.green("yes")
        : t.claimable === false
          ? chalk.dim("no")
          : chalk.dim("—");
    const claimCell = claim.padEnd(11 + (claim.length - stripAnsi(claim).length));
    const title = (t.title ?? "").trim() || chalk.dim("(no title)");
    out(`  ${slug}${kind}${st}${claimCell}${title}`);

    if (t.claimable === false && t.claim_reason) {
      out(chalk.dim(`           └─ ${t.claim_reason}`));
    }
    if (t.claimers && t.claimers.length > 0) {
      const handles = t.claimers
        .map((c) => (c.username ? `@${c.username}` : null))
        .filter((s): s is string => Boolean(s));
      if (handles.length > 0) {
        out(chalk.dim(`           └─ working: ${handles.join(", ")}`));
      }
    }
  }
  void cmd;
}

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

async function fetchMyUsername(): Promise<string | null> {
  try {
    const { data } = await client.GET("/builder/agents/me", {
      headers: authHeaders(),
    });
    const u = (data as { agent?: { github_username?: string } } | undefined)
      ?.agent?.github_username;
    if (u && typeof u === "string") return u;
  } catch {
    // fall through
  }
  return null;
}
