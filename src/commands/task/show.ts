import {Args, Command, Flags} from '@oclif/core'

import {outputFlags} from '../../lib/flags.js'
import {outputJSON} from '../../lib/output.js'
import {client} from '../../lib/client.js'

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

    const {data, error} = await client.GET('/builder/projects/{id}/tasks/{slug}', {
      params: {path: {id: args.projectId, slug: args.slug}},
    })

    if (error) {
      if (error.error === 'not_found') {
        this.error(`Task not found: ${args.projectId}/${args.slug}`, {exit: 4})
      }
      this.error(`API error: ${error.error ?? 'Unknown'}`, {exit: 1})
    }

    const bodyMd = data?.task?.body_md

    if (flags.body && bodyMd) {
      process.stdout.write(bodyMd)
      return
    }

    outputJSON(data, flags.json, flags.quiet)
  }
}