import { Args, Command } from "@oclif/core";
import chalk from "chalk";

import { outputFlags } from "../../lib/flags.js";
import { outputJSONAuto } from "../../lib/output.js";
import { client, authHeaders, tryRecoverAuth, unwrapProject } from "../../lib/client.js";

// Owner escape hatch. POST /phase/advance to skip the failed phase
// and proceed to the next. C11: with safety gates, no confirm flag.
//
// Why this exists: when a phase is failed, the platform blocks
// claiming new tasks (the chicken-and-egg). The builder's path is
// usually to push fix PRs (branch + title match the fix-slug). But
// sometimes the reviewer is just wrong (post-push bot has been
// wrong before — comparing HEAD instead of diff, etc). The owner
// can override with this command.
//
// Safety gates:
//   - Refuse if phase_status != "failed" (exit 1, the platform
//     already advances on its own when the phase passes).
//   - Refuse if the response says the owner isn't authorized
//     (403 from /phase/advance → exit 1, "owner authorization
//     required").
//   - For local_agent projects: warn that this is a no-op
//     (the executor already auto-advances).
//   - Print what it's about to do (last verdict summary, audit
//     log entry that will be written, destination phase) and
//     then POST. No prompt, no --confirm. (Per v0.13.0 decision:
//     the agent wrote the command, the agent knows what it's
//     doing. v0.12.0's --force flag was cut.)
//
// The backend records the audit entry as owner_override.
type PhaseResponse = {
  project_id?: string;
  project_slug?: string;
  current_phase?: string;
  phase_status?: string;
  next_action?: string;
  next_action_reason?: string;
  phase_runs?: Array<{ verdict?: { verdict?: string; notes?: string } }>;
  [k: string]: unknown;
};

type ProjectResponse = {
  build_mode?: "platform_agent" | "local_agent";
  [k: string]: unknown;
};

type AdvanceResponse = {
  ok?: boolean;
  advanced_to?: string;
  audit_log?: string;
  reason?: string;
  [k: string]: unknown;
};

export default class PhaseAdvance extends Command {
  static description =
    "Owner escape hatch: advance a failed phase to the next (audit log: owner_override)";

  static examples = [
    "<%= config.bin %> phase advance proj_abc123",
    "<%= config.bin %> phase advance my-project --json",
  ];

  static args = {
    projectId: Args.string({
      description: "Project ID or slug",
      required: true,
    }),
  };

  static flags = {
    ...outputFlags,
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(PhaseAdvance);

    // 1. Read the phase to learn current_phase + phase_status.
    const { data: phaseData, error: phaseError } = await client.GET(
      "/builder/projects/{id}/phase",
      { params: { path: { id: args.projectId } } },
    );
    if (phaseError) {
      const errObj = phaseError as { error?: string } | undefined;
      if (errObj?.error === "not_found") {
        this.error(`Project not found: ${args.projectId}`, { exit: 4 });
      }
      this.error(`API error: ${errObj?.error ?? "Unknown"}`, { exit: 1 });
    }
    const phase = (phaseData ?? {}) as PhaseResponse;

    // 2. Read the project to learn build_mode.
    const { data: projectData } = await client.GET(
      "/builder/projects/{id}",
      { params: { path: { id: args.projectId } } },
    );
    const project = unwrapProject<ProjectResponse>(projectData);
    const buildMode = project.build_mode ?? "platform_agent";

    // 3. Safety gate: refuse if phase_status is not "failed".
    if (phase.phase_status !== "failed") {
      this.error(
        `Refusing to advance: phase_status is "${phase.phase_status ?? "unknown"}", not "failed". ` +
          `The platform auto-advances a passing phase; owner_override is only for failed phases.`,
        { exit: 1 },
      );
    }

    // 4. Compute the destination phase (next in phase_order, or
    // "next_action" from the response). The backend will compute the
    // canonical answer, but we print the predicted destination for
    // the agent's visibility.
    const lastRun = phase.phase_runs?.[phase.phase_runs.length - 1];
    const lastVerdict = lastRun?.verdict?.verdict ?? "unknown";
    const lastNotes = (lastRun?.verdict?.notes ?? "").trim();

    // 5. local_agent: warn (no-op in practice) but allow. The owner
    // might still want it for clarity in the audit log.
    if (buildMode === "local_agent") {
      process.stdout.write(
        chalk.yellow(
          "Note: this project is in local_agent mode — the executor auto-advances anyway. " +
            "Proceeding for audit-log clarity.\n\n",
        ),
      );
    }

    // 6. Print what we're about to do. No prompt, no --confirm.
    // Skipped for --json (would corrupt the JSON payload).
    if (!flags.json && !flags.quiet) {
      process.stdout.write(
        chalk.bold("About to POST /phase/advance\n") +
          chalk.dim(`  project:       ${args.projectId}\n`) +
          chalk.dim(`  current phase: ${phase.current_phase ?? "—"}\n`) +
          chalk.dim(`  phase_status:  failed\n`) +
          chalk.dim(`  last verdict:  ${lastVerdict}\n`) +
          (lastNotes ? chalk.dim(`  last notes:    "${lastNotes.split(/(?<=[.!?])\s+/)[0] ?? lastNotes}"\n`) : "") +
          chalk.dim(`  build_mode:    ${buildMode}\n`) +
          chalk.dim(`  audit entry:   owner_override (written by the backend)\n\n`) +
          chalk.bold("Posting…\n"),
      );
    }

    // 7. POST /phase/advance. New endpoint from backend #142, not
    // yet in api-types (cast like agnt test does). The router has
    // AuthMiddleware on this endpoint (the GETs above don't need
    // it), so we MUST pass authHeaders() — easy to miss in copy-
    // paste from the GET call above. (Fixed 2026-06-13: the first
    // cut shipped without the header and surfaced as "missing or
    // invalid Authorization header".)
    let { data: advData, error: advError } = await client.POST(
      "/builder/projects/{id}/phase/advance" as never,
      {
        headers: authHeaders(),
        params: { path: { id: args.projectId } },
        body: { reason: "owner_override" } as never,
      } as never,
    );

    // Older servers may have rotated the key — try to recover with
    // stored JWT, then retry once. Mirrors task claim's recovery path.
    if (
      advError &&
      (advError as { error?: string }).error === "unauthorized"
    ) {
      const recovered = await tryRecoverAuth();
      if (recovered) {
        ({ data: advData, error: advError } = await client.POST(
          "/builder/projects/{id}/phase/advance" as never,
          {
            headers: authHeaders(),
            params: { path: { id: args.projectId } },
            body: { reason: "owner_override" } as never,
          } as never,
        ));
      }
    }

    if (advError) {
      const errObj = advError as { error?: string; status?: number } | undefined;
      const msg = errObj?.error ?? "Unknown";
      // openapi-fetch surfaces 4xx/5xx errors as `{ error, status }`
      // where `status` is the HTTP code and `error` is the server's
      // error string. Some clients only set `error`, so we also
      // pattern-match the message. The server returns 401 with body
      // "missing or invalid Authorization header" when the header is
      // absent, and 403 with "forbidden / not the owner" when the
      // agent is authed but isn't the project owner.
      if (
        errObj?.status === 403 ||
        /forbidden|not.+owner|not the owner|not authorized as owner/i.test(msg)
      ) {
        this.error(
          `Owner authorization required. The CLI's stored agent is not the project owner. ` +
            `(API: ${msg})`,
          { exit: 1 },
        );
      }
      if (
        errObj?.status === 401 ||
        /unauthor|invalid.+authorization|missing.+authorization/i.test(msg)
      ) {
        this.error(
          `Authentication failed. Try \`agnt login --token <amk_xxx>\` to re-authenticate. ` +
            `(API: ${msg})`,
          { exit: 1 },
        );
      }
      this.error(`Phase advance failed: ${msg}`, { exit: 1 });
    }

    const result = (advData ?? {}) as AdvanceResponse;

    if (flags.json) {
      outputJSONAuto(result, true, flags.quiet);
      return;
    }

    process.stdout.write(
      chalk.green(
        `✓ Phase advanced${result.advanced_to ? ` to ${result.advanced_to}` : ""}. ` +
          `Audit log: owner_override.`,
      ) + "\n",
    );
  }
}
