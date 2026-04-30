import {Args, Command, Flags} from '@oclif/core'

import {apiGet} from '../../lib/api.js'
import {outputFlags} from '../../lib/flags.js'
import {outputJSON} from '../../lib/output.js'

export default class TaskShow extends Command {
  static description = 'Show task details including full body_md'

  static examples = [
    '<%= config.bin %> task show proj_abc123 T01',
    '<%= config.bin %> task show proj_abc123 T01 --json',
  ]

  static args = {
    projectId: Args.string({description: 'Project ID or slug', required: true}),
    slug: Args.string({description: 'Task slug (e.g. T01)', required: true}),
  }

  static flags = {
    ...outputFlags,
    body: Flags.boolean({
      char: 'b',
      default: false,
      description: 'Output only the body_md field (raw markdown)',
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TaskShow)

    try {
      const task = await apiGet(`/api/builder/projects/${args.projectId}/tasks/${args.slug}`) as {body_md?: string}

      if (flags.body && task.body_md) {
        process.stdout.write(task.body_md)
        return
      }

      outputJSON(task, flags.json, flags.quiet)
    } catch (error) {
      const e = error as {message?: string; status?: number}
      if (e.status === 404) {
        this.error(`Task not found: ${args.projectId}/${args.slug}`, {exit: 4})
      }

      this.error(e.message ?? 'Failed to get task', {exit: 1})
    }
  }
}