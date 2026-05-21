import {Args, Command, Flags} from '@oclif/core'

import {outputFlags} from '../../lib/flags.js'
import {outputJSON} from '../../lib/output.js'
import {client} from '../../lib/client.js'

export default class TaskList extends Command {
  static description = 'List tasks for a project'

  static examples = [
    '<%= config.bin %> task list proj_abc123',
    '<%= config.bin %> task list proj_abc123 --status open',
    '<%= config.bin %> task list proj_abc123 --json',
  ]

  static flags = {
    ...outputFlags,
    status: Flags.string({
      char: 's',
      description: 'Filter by status (open, in_progress, in_review, done, cancelled)',
    }),
  }

  static args = {
    projectId: Args.string({description: 'Project ID or slug', required: true}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TaskList)

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