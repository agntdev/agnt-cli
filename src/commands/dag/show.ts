import { Args, Command, Flags } from "@oclif/core";

import { outputFlags } from "../../lib/flags.js";
import { outputJSON } from "../../lib/output.js";
import { client } from "../../lib/client.js";

export default class DagShow extends Command {
  static description = "Show the task dependency graph (DAG) for a project";

  static examples = [
    "<%= config.bin %> dag show proj_abc123",
    "<%= config.bin %> dag show my-project --summary",
    "<%= config.bin %> dag show my-project --json",
  ];

  static flags = {
    ...outputFlags,
    // Summary: render a scannable TTY table (slug, title, kind, status,
    // claimable) instead of the full JSON. Default: full JSON to a TTY
    // is overwhelming on multi-task projects (Grug review 2026-06-11).
    summary: Flags.boolean({
      default: false,
      description:
        "Render a compact TTY table (slug, title, kind, status, claimable) instead of the full JSON payload.",
    }),
  };

  static args = {
    projectId: Args.string({
      description: "Project ID or slug",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(DagShow);

    const { data, error } = await client.GET("/builder/projects/{id}/dag", {
      params: {
        path: { id: args.projectId },
      },
    });

    if (error) {
      this.error(
        `API error: ${(error as { error?: string }).error ?? "Unknown"}`,
        { exit: 1 },
      );
    }

    if (flags.summary && !flags.json) {
      // Human-friendly TTY table. JSON output remains the full payload
      // for scripting — the table is a presentation choice, not a
      // data shape change.
      renderDagSummary(this, data as DagResponse);
      return;
    }

    outputJSON(data, flags.json, flags.quiet);
  }
}

type DagResponse = {
  project_slug?: string;
  current_phase?: string;
  phase_status?: string;
  tasks?: Array<{
    slug: string;
    title?: string;
    task_kind?: string;
    status: string;
    claimable?: boolean;
    claim_reason?: string;
    // claimers[] arrived with #118 (F1 follow-up from
    // AGNTDEV-POSTLAUNCH-FIXES). Each entry is a brief — username,
    // avatar, claimed_at, expires_at. The summary render shows the
    // usernames inline so builders can see who's working on what
    // without opening a second endpoint.
    claimers?: Array<{
      username?: string;
      agent_id?: string;
      claimed_at?: string;
      expires_at?: string;
    }>;
  }>;
};

// Render a TTY table. Widths are picked to keep it readable on a
// typical 100-col terminal; titles truncate to fit.
function renderDagSummary(cmd: Command, data: DagResponse): void {
  const tasks = data.tasks ?? [];
  const projectSlug = data.project_slug ?? "project";
  const phase = data.current_phase ?? "—";
  const status = data.phase_status ?? "—";

  // process.stdout.write (not cmd.log) so the runCommand test harness
  // captures it through the same pipe the user sees. cmd.log routes
  // to stderr in test mode, which is invisible to `runCommand`'s
  // stdout assertion.
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

  // Column widths: slug(8) · kind(11) · status(11) · claimable(10) · title(rest)
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

    // If the task is NOT claimable, print the reason on the next line
    // so the agent knows the gate without re-running the command.
    if (t.claimable === false && t.claim_reason) {
      out(chalk.dim(`           └─ ${t.claim_reason}`));
    }

    // If there are active claimers, print them on the next line as a
    // comma-separated @handle list. Avoids the "who's working on this?"
    // round-trip to a second endpoint. (#118)
    if (t.claimers && t.claimers.length > 0) {
      const handles = t.claimers
        .map((c) => (c.username ? `@${c.username}` : null))
        .filter((s): s is string => Boolean(s));
      if (handles.length > 0) {
        out(chalk.dim(`           └─ working: ${handles.join(", ")}`));
      }
    }
  }
  // Reference the cmd param to keep the lint quiet (kept for future
  // extension; not used in the current table render).
  void cmd;
}

// Strip ANSI escape codes to get the visible string length. Used to
// compute padding for colorized cells so columns line up in the TTY.
function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

// Lazy import chalk so the JSON-only code path doesn't pull it in
// unnecessarily. (oclif commands are bundled; chalk is a small dep
// so the import is essentially free, but keeping the import local
// makes the intent clear.)
import chalk from "chalk";
