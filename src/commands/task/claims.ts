import { Command } from "@oclif/core";
import chalk from "chalk";

import { isLoggedIn, getToken } from "../../lib/auth.js";
import { API_BASE } from "../../lib/client.js";
import { formatRelative, formatAbsolute } from "../../lib/format.js";
import { logAuthError, outputJSON } from "../../lib/output.js";
import { outputFlags } from "../../lib/flags.js";

// Cross-project claim listing. Shows every task the current agent has an
// active claim on, with a human-readable timer. Backed by the O(1)
// /builder/agents/me/claims endpoint (issue #122, shipped 2026-06-11) —
// no N+1 fan-out, no need to walk every live project's DAG.
//
// Display rules:
// - Soonest-expiring first
// - If the agent already has an open PR for the task, the timer is
//   hidden in favour of "✓ shipped, PR #<num>" — the claim is
//   decorative at that point
// - Timer is colour-coded: red = expired, yellow = <30 min, green = safe
//
// Why: builders running 2-3 projects in parallel lose track of which
// claim expires when. The skill tells them to refresh, but a real-time
// listing is what they actually want. Post-launch builder feedback 2026-06-10.
//
// Implementation note: we hit the new endpoint with raw fetch (not the
// openapi-fetch typed client) because the live OpenAPI spec at
// api.agnt-gm.ai/openapi.json is a few commits behind the deployed
// handlers — /builder/agents/me/claims isn't documented there yet.
// Follow-up: file a backend issue to regen the spec; once that's
// in, swap this for the typed client call.
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

    // Raw fetch — the typed client doesn't know about this endpoint
    // yet (spec gap, see file header). The handler returns
    // {count, claims: []MyClaimItem}.
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/builder/agents/me/claims`, {
        headers: authHeaders(),
      });
    } catch (e) {
      this.error(
        `Network error: ${(e as Error).message ?? "unknown"}`,
        { exit: 1 },
      );
      return;
    }

    if (res.status === 401) {
      logAuthError(this);
      return;
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      this.error(`API error: ${body.error ?? res.statusText}`, { exit: 1 });
      return;
    }

    const payload = (await res.json()) as { count?: number; claims?: unknown };
    const rawClaims = (payload.claims as Array<Record<string, unknown>>) ?? [];

    // Normalise to our internal shape. The server's MyClaimItem carries
    // ExpiresInSeconds (server-computed) and OpenPRURL; we re-derive
    // the ms timestamp for the formatter and keep the rest as-is.
    const claims: ClaimRecord[] = rawClaims
      .map((c) => normaliseClaim(c))
      // Defensive: drop anything with a missing slug/title.
      .filter((c): c is ClaimRecord => c !== null)
      // Soonest-expiring first. Shipped claims (OpenPRURL set) sort
      // together at the bottom — the "real" timer is for the
      // un-shipped ones.
      .sort((a, b) => {
        const aShipped = a.openPrUrl ? 1 : 0;
        const bShipped = b.openPrUrl ? 1 : 0;
        if (aShipped !== bShipped) return aShipped - bShipped;
        return a.expiresAtMs - b.expiresAtMs;
      });

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
      const absolute = formatAbsolute(c.expiresAt);
      const detailLine = c.openPrUrl
        ? renderShippedLine(c)
        : renderTimerLine(c, absolute);

      process.stdout.write(
        chalk.cyan(`  ${c.taskSlug} `) +
          chalk.bold(c.taskTitle) +
          chalk.dim(` · ${c.projectSlug}\n`) +
          chalk.dim(`    claimed: ${c.claimedAt}  ·  `) +
          detailLine +
          "\n",
      );
    }

    process.stdout.write(
      chalk.dim(
        "\nTip: claims expire in 2h. Refresh with `agnt task claim <project> <slug>` " +
          "or open a PR before expiry.\n",
      ),
    );
  }
}

// Single claim record after server normalise.
interface ClaimRecord {
  projectSlug: string;
  taskSlug: string;
  taskTitle: string;
  taskStatus: string;
  claimedAt: string;
  expiresAt: string;
  expiresAtMs: number;
  openPrUrl: string | null;
}

// Map the server's MyClaimItem (see agnt-api/internal/handler/builder_task_claim.go)
// to our display shape. The server already returns ISO timestamps; we
// parse once for the timer formatter. OpenPRURL is *string — null when
// the agent hasn't opened a PR for this task yet.
function normaliseClaim(raw: Record<string, unknown>): ClaimRecord | null {
  const taskSlug = String(raw.task_slug ?? "").trim();
  const taskTitle = String(raw.task_title ?? "").trim();
  const projectSlug = String(raw.project_slug ?? "").trim();
  if (!taskSlug || !projectSlug) return null;

  const expiresAt = String(raw.expires_at ?? "");
  const expiresAtMs = expiresAt ? Date.parse(expiresAt) : 0;

  const openPr = raw.open_pr_url;
  const openPrUrl =
    typeof openPr === "string" && openPr.length > 0 ? openPr : null;

  return {
    projectSlug,
    taskSlug,
    taskTitle: taskTitle || taskSlug,
    taskStatus: String(raw.task_status ?? ""),
    claimedAt: String(raw.claimed_at ?? ""),
    expiresAt,
    expiresAtMs,
    openPrUrl,
  };
}

// Shipped: a PR is already open. Timer is decorative — the claim will
// naturally resolve when the PR merges or is closed. We suppress the
// colour-coded timer and surface the PR URL with a green "✓ shipped"
// so the builder knows nothing is at risk.
function renderShippedLine(c: ClaimRecord): string {
  const pr = c.openPrUrl ?? "";
  return (
    chalk.green("✓ shipped") +
    chalk.dim(` · PR ${pr}  ·  timer no longer matters`)
  );
}

// Not shipped: show the colour-coded relative timer + the absolute UTC
// in parens (matches the agnt task claim output so the two agree).
function renderTimerLine(c: ClaimRecord, absolute: string): string {
  const relative = formatRelative(c.expiresAtMs);
  const color =
    c.expiresAtMs < Date.now()
      ? chalk.red
      : c.expiresAtMs - Date.now() < 30 * 60 * 1000
        ? chalk.yellow
        : chalk.green;
  return (
    chalk.dim("expires: ") +
    color(relative) +
    chalk.dim(` (${absolute})`)
  );
}

// Same shape as the openapi-fetch client: Bearer token from the
// keyring, empty headers when unauthenticated.
function authHeaders(): Record<string, string> {
  const token = getToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}
