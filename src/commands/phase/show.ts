import { Args, Command, Flags } from "@oclif/core";
import chalk from "chalk";

import { outputFlags } from "../../lib/flags.js";
import { outputJSONAuto } from "../../lib/output.js";
import { client } from "../../lib/client.js";

// Phase state + verdict history. C7 (verdict history auto-included,
// --review flag dropped) and the v0.13.0 default-short-output rule.
//
// Output rules (v0.13.0):
// - Default human: short summary. Phase, status, verdict count, last
//   verdict's `notes` (1 sentence). Agents cut long outputs.
// - --full human: complete verdict (missing[], contradictions[],
//   suggestions[], notes) for every run.
// - Default JSON: phase + phase_runs (compact).
// - --full JSON: same as default JSON (no truncation at the JSON
//   level — the data is small and structured, so always ship it).
// - For local_agent projects: "no reviews (local_agent mode)" —
//   verdict history is always empty by design. We detect build_mode
//   via /builder/projects/{id} (a 2nd round-trip; acceptable for
//   v0.13.0, the optimization is a 3-LOC backend change).
//
// Implementation note: the new endpoint /phases/:phase/runs isn't
// in src/lib/api-types.ts yet (cast like agnt test does).
type PhaseResponse = {
  project_id?: string;
  project_slug?: string;
  current_phase?: string;
  phase_status?: string;
  phase_order?: string[];
  phase_runs?: unknown[];
  next_action?: string;
  next_action_reason?: string;
  [k: string]: unknown;
};

type ProjectResponse = {
  build_mode?: "platform_agent" | "local_agent";
  [k: string]: unknown;
};

type Verdict = {
  verdict?: "approve" | "reject" | "manual_review" | string;
  notes?: string;
  missing?: string[];
  contradictions?: string[];
  suggestions?: string[];
  reviewed_at?: string;
  reviewer?: string;
  [k: string]: unknown;
};

type RunRecord = {
  id?: string;
  phase?: string;
  run_at?: string;
  verdict?: Verdict;
  [k: string]: unknown;
};

export default class PhaseShow extends Command {
  static description =
    "Show project phase + verdict history (short by default, --full for complete)";

  static examples = [
    "<%= config.bin %> phase show proj_abc123",
    "<%= config.bin %> phase show my-project --full",
    "<%= config.bin %> phase show my-project --json",
  ];

  static args = {
    projectId: Args.string({
      description: "Project ID or slug",
      required: true,
    }),
  };

  static flags = {
    ...outputFlags,
    // --full: dump the complete verdict (missing[], contradictions[],
    // suggestions[], notes) for every run. Default is short: phase +
    // status + verdict count + last verdict's notes (1 sentence).
    full: Flags.boolean({
      default: false,
      description:
        "Dump the complete verdict history (missing[], contradictions[], suggestions[], notes) for every run.",
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(PhaseShow);

    // 1. Get current phase
    const { data: phaseData, error: phaseError } = await client.GET(
      "/builder/projects/{id}/phase",
      { params: { path: { id: args.projectId } } },
    );
    if (phaseError) {
      const errObj = phaseError as { error?: string } | undefined;
      this.error(`API error: ${errObj?.error ?? "Unknown"}`, { exit: 1 });
    }
    const phase = (phaseData ?? {}) as PhaseResponse;

    // 2. Get project (for build_mode)
    const { data: projectData } = await client.GET(
      "/builder/projects/{id}",
      { params: { path: { id: args.projectId } } },
    );
    const project = (projectData ?? {}) as ProjectResponse;
    const buildMode = project.build_mode ?? "platform_agent";

    // 3. Get verdict history. Skip for local_agent (always empty by
    // design — saves a round-trip and avoids confusing the agent
    // with an empty runs list).
    let runs: RunRecord[] = [];
    if (buildMode !== "local_agent" && phase.current_phase) {
      const { data: runsData } = await client.GET(
        // New endpoint from backend #140, not yet in api-types.
        "/builder/projects/{id}/phases/{phase}/runs" as never,
        {
          params: {
            path: { id: args.projectId, phase: phase.current_phase },
          } as never,
        } as never,
      );
      runs = ((runsData as { runs?: RunRecord[] } | undefined)?.runs ??
        []) as RunRecord[];
    }

    if (flags.json) {
      // JSON path: always include the full data. --full is
      // effectively a no-op for JSON (the data is structured and
      // agents need it complete). Document the symmetry in --help.
      const result: Record<string, unknown> = {
        ...phase,
        build_mode: buildMode,
        phase_runs: runs,
      };
      outputJSONAuto(result, true, flags.quiet);
      return;
    }

    // Human output
    if (buildMode === "local_agent") {
      this.renderLocalAgent(phase, flags.full);
      return;
    }

    this.renderSummary(phase, runs, flags.full);
  }

  // local_agent: verdict history is always empty by design. Show
  // a clear hint so the agent doesn't go looking for missing
  // reviews.
  private renderLocalAgent(phase: PhaseResponse, full: boolean): void {
    const write = (line: string): void => {
      process.stdout.write(line + "\n");
    };
    write(
      `Phase: ${phase.current_phase ?? "—"}  ·  Status: ${phase.phase_status ?? "—"}`,
    );
    write(
      "Reviews: no reviews (local_agent mode — your agent writes the code, the platform just hosts it)",
    );
    if (full) {
      // Nothing more to show in local_agent — the runs list is
      // always empty. But we honour the flag by being explicit.
      write(
        "(--full: nothing more to show; local_agent projects have no verdict history)",
      );
    }
    if (phase.next_action) {
      write(`Next:   ${phase.next_action}`);
    }
  }

  // platform_agent: short summary by default, --full dumps everything.
  private renderSummary(
    phase: PhaseResponse,
    runs: RunRecord[],
    full: boolean,
  ): void {
    const write = (line: string): void => {
      process.stdout.write(line + "\n");
    };

    write(
      `Phase: ${phase.current_phase ?? "—"}  ·  Status: ${phase.phase_status ?? "—"}  ·  Reviews: ${runs.length}`,
    );

    if (runs.length > 0) {
      const last = runs[runs.length - 1];
      const v = last.verdict;
      const verdict = v?.verdict ?? "unknown";
      const verdictColor =
        verdict === "approve"
          ? chalk.green
          : verdict === "reject"
            ? chalk.red
            : chalk.yellow;
      const notes = (v?.notes ?? "").trim();
      const oneSentence = notes.split(/(?<=[.!?])\s+/)[0] ?? notes;
      write(
        `Last verdict: ${verdictColor(verdict)}  ·  ${verdictColor(`"${oneSentence}"`)}`,
      );
    } else {
      write(chalk.dim("Last verdict: (no reviews yet)"));
    }

    if (full) {
      write("");
      write(chalk.bold("Full verdict history:"));
      if (runs.length === 0) {
        write(chalk.dim("  (none)"));
      } else {
        for (const r of runs) {
          write(
            chalk.cyan(`  run #${r.id ?? "?"}`) +
              chalk.dim(`  ${r.run_at ?? ""}  ·  ${r.verdict?.verdict ?? "—"}`),
          );
          const v = r.verdict;
          if (v?.notes) {
            write(chalk.dim(`    notes: ${v.notes}`));
          }
          if (v?.missing && v.missing.length > 0) {
            write(chalk.dim(`    missing:`));
            for (const m of v.missing) write(chalk.dim(`      • ${m}`));
          }
          if (v?.contradictions && v.contradictions.length > 0) {
            write(chalk.dim(`    contradictions:`));
            for (const c of v.contradictions) write(chalk.dim(`      • ${c}`));
          }
          if (v?.suggestions && v.suggestions.length > 0) {
            write(chalk.dim(`    suggestions:`));
            for (const s of v.suggestions) write(chalk.dim(`      • ${s}`));
          }
        }
      }
    }

    if (phase.next_action) {
      write(`Next:   ${phase.next_action}`);
      if (phase.next_action_reason) {
        write(chalk.dim(`        ${phase.next_action_reason}`));
      }
    }
  }
}
