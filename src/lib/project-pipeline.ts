import { client, unwrapProject } from "./client.js";

// v0.16.0: shared `fetchProjectBuildPipeline` and `assertTaskManager`,
// extracted from `task/claim.ts` so the five new task_manager write
// commands (`submit`, `comment`, `progress`, `clarify`, `thread`) can
// use the same fetch + guard logic.
//
// Why this lives in src/lib (not src/commands/task/): the phase cut
// (PR `chore/remove-phase-pipeline`) deletes the phase routes but
// leaves the `build_pipeline` enum intact on the project. Every
// task_manager write needs to (1) read the project, (2) refuse if
// the project is a `phase` (non-agntdev bounty board — wrong CLI).
//
// v0.15.1: unwrap the `ProjectDetailResponse` wrapper so we read the
// real project fields, not the wrapper.
//
// v0.16.0: fail loud when `build_pipeline` is missing. Pre-v0.16.0
// fallback to `"phase"` was the root cause of the v0.15.1 fix —
// the wrapper-unwrap bug hid the field, every call site fell back
// to the wrong pipeline, and task_manager agents never saw the
// PR-registration step. Loud failure is the cure.

export type BuildPipeline = "task_manager" | "phase";

/**
 * Read the project's `build_pipeline`. Throws on missing or unknown
 * values so the agent sees a real error rather than silently
 * defaulting to the wrong flow.
 */
export async function fetchProjectBuildPipeline(
  projectId: string,
): Promise<BuildPipeline> {
  const { data } = await client.GET("/builder/projects/{id}", {
    params: { path: { id: projectId } },
  });
  const project = unwrapProject<{ build_pipeline?: string }>(data);
  const pipeline = project.build_pipeline;
  if (pipeline === "task_manager" || pipeline === "phase") {
    return pipeline;
  }
  throw new Error(
    `server returned build_pipeline=${JSON.stringify(pipeline)} for ${projectId}; ` +
      `expected "task_manager" or "phase" — upgrade agnt-api?`,
  );
}

/**
 * Refuse to run a task_manager-only command on a non-task_manager
 * project. The `phase` pipeline is for the non-agntdev bounty board
 * (external agents use the raw API — there's no CLI surface for it).
 *
 * Returns an Error suitable for `cmd.error(err.message, { exit: 1 })`.
 * Callers should pass the returned Error to `this.error` so oclif
 * produces the right CLIError shape and exit code.
 */
export function assertTaskManager(pipeline: BuildPipeline): Error | null {
  if (pipeline !== "task_manager") {
    return new Error(
      `this command is task_manager-only; for non-agntdev bounty work ` +
        `(build_pipeline='phase'), use the API directly`,
    );
  }
  return null;
}
