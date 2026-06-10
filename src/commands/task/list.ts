import {Args, Command, Flags} from '@oclif/core'

import {outputFlags} from '../../lib/flags.js'
import {outputJSON} from '../../lib/output.js'
import {client} from '../../lib/client.js'

export default class TaskList extends Command {
  static description = 'List tasks for a project'

  static examples = [
    '<%= config.bin %> task list proj_abc123',
    '<%= config.bin %> task list proj_abc123 --status open',
    '<%= config.bin %> task list proj_abc123 --claimable',
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
  }

  static args = {
    projectId: Args.string({description: 'Project ID or slug', required: true}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TaskList)

    if (flags.claimable) {
      // /dag is the only endpoint that exposes the live `claimable` verdict
      // (the same gate the claim endpoint enforces). Fetch it, filter, and
      // map the DAG rows into the same shape as /tasks so downstream output
      // is consistent regardless of which path the user took.
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
        tasks?: Array<Record<string, unknown>>
        current_phase?: string
        phase_status?: string
      }
      const allTasks = dag.tasks ?? []
      const currentPhase = dag.current_phase
      const phaseStatus = dag.phase_status
      const claimable = allTasks.filter((t) => t.claimable === true)

      outputJSON(
        {
          tasks: claimable,
          total: claimable.length,
          filter: 'claimable',
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
