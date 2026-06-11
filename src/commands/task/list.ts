import {Args, Command, Flags} from '@oclif/core'

import {outputFlags} from '../../lib/flags.js'
import {outputJSON} from '../../lib/output.js'
import {client, authHeaders} from '../../lib/client.js'

export default class TaskList extends Command {
  static description = 'List tasks for a project'

  static examples = [
    '<%= config.bin %> task list proj_abc123',
    '<%= config.bin %> task list proj_abc123 --status open',
    '<%= config.bin %> task list proj_abc123 --claimable',
    '<%= config.bin %> task list proj_abc123 --mine',
    '<%= config.bin %> task list proj_abc123 --json',
  ]

  static flags = {
    ...outputFlags,
    status: Flags.string({
      char: 's',
      description: 'Filter by status (open, in_progress, in_review, done, cancelled)',
    }),
    claimable: Flags.boolean({
      default: false,
      description:
        'Show only tasks that are claimable RIGHT NOW (gates: phase active, deps merged, project live). Sources from the project DAG, not the raw task list.',
    }),
    // --mine: filter the project's DAG to tasks where the current agent
    // is an active claimer. Uses GET /builder/projects/:id/tasks/:slug per
    // task to fetch the full claimer list (Grug review 2026-06-11: "I
    // had 5 active 2h claims, no way to list them"). Per-project only;
    // for a cross-project claim listing, see #122 (agnt claims command).
    mine: Flags.boolean({
      default: false,
      description:
        'Show only tasks where the current agent is an active claimer. Per-project only; the claim is auto-detected from /builder/agents/me.',
    }),
  }

  static args = {
    projectId: Args.string({description: 'Project ID or slug', required: true}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TaskList)

    if (flags.claimable || flags.mine) {
      // Both flags source from the project DAG. /dag is the only endpoint
      // that exposes the live `claimable` verdict and the full task list
      // we need to walk per-task. Fetch it once, then narrow.
      const {data, error} = await client.GET('/builder/projects/{id}/dag', {
        params: {path: {id: args.projectId}},
      })

      if (error) {
        const errObj = error as unknown as {error?: string}
        if (errObj.error === 'not_found') {
          this.error(`Project not found: ${args.projectId}`, {exit: 4})
        }
        this.error(`API error: ${errObj.error ?? 'Unknown'}`, {exit: 1})
      }

      // The /dag endpoint's OpenAPI schema is a placeholder (Record<string, never>)
      // in src/lib/api-types.ts; the real shape is documented in
      // agnt-api/internal/handler/builder_phase_api.go (projectDAGResponse).
      const dag = (data ?? {}) as {
        tasks?: Array<{slug: string}>
        current_phase?: string
        phase_status?: string
      }
      const allTasks = dag.tasks ?? []
      const currentPhase = dag.current_phase
      const phaseStatus = dag.phase_status

      let filtered: Array<{slug: string}> = allTasks

      if (flags.mine) {
        // /dag doesn't expose claimers per task (that's the F1 fix in #118).
        // Until #118 lands, we hit /tasks/:slug per task to get the full
        // claimer list. N+1 requests, but only when --mine is explicit.
        // Cache the username once; cache per-task results to avoid
        // double-fetching if --mine is combined with --claimable.
        const me = await fetchMyUsername()
        if (!me) {
          this.error(
            'Cannot resolve your GitHub username. Run `agnt auth login` first, or pass it via GH_USER env.',
            {exit: 3},
          )
        }

        const checks = await Promise.all(
          allTasks.map(async (t) => {
            const { data: taskData } = await client.GET(
              '/builder/projects/{id}/tasks/{slug}',
              { params: { path: { id: args.projectId, slug: t.slug } } },
            )
            // claimers live on the nested `task` object, not at the
            // top level — see TaskDetailResponse in
            // agnt-api/internal/handler/openapi_types.go:199.
            const claimers =
              (
                taskData as
                  | { task?: { claimers?: Array<{ username?: string }> } }
                  | undefined
              )?.task?.claimers ?? []
            return { slug: t.slug, claimedByMe: claimers.some((c) => c.username === me) }
          }),
        )
        const mySlugs = new Set(
          checks.filter((c) => c.claimedByMe).map((c) => c.slug),
        )
        filtered = allTasks.filter((t) => mySlugs.has(t.slug))
      } else {
        // Pure --claimable: no per-task fetch needed.
        filtered = allTasks.filter((t: Record<string, unknown>) => t.claimable === true)
      }

      outputJSON(
        {
          tasks: filtered,
          total: filtered.length,
          filter: flags.mine && flags.claimable
            ? 'mine+claimable'
            : flags.mine
              ? 'mine'
              : 'claimable',
          current_phase: currentPhase,
          phase_status: phaseStatus,
        },
        flags.json,
        flags.quiet,
      )
      return
    }

    const {data, error} = await client.GET('/builder/projects/{id}/tasks', {
      params: {
        path: {id: args.projectId},
        query: {status: flags.status as 'cancelled' | 'done' | 'in_progress' | 'in_review' | 'open' | undefined},
      },
    })

    if (error) {
      this.error(`API error: ${error.error ?? 'Unknown'}`, {exit: 1})
    }

    outputJSON({tasks: data?.tasks ?? []}, flags.json, flags.quiet)
  }
}

// Resolve the current agent's GitHub username via /builder/agents/me.
// Returns null on failure so the caller can render a clear error
// (this is the only place we need it; no per-process cache because
// the username doesn't change between commands in a session).
async function fetchMyUsername(): Promise<string | null> {
  try {
    const { data } = await client.GET('/builder/agents/me', {
      headers: authHeaders(),
    })
    const u = (data as { agent?: { github_username?: string } } | undefined)
      ?.agent?.github_username
    if (u && typeof u === 'string') return u
  } catch {
    // fall through
  }
  return null
}
