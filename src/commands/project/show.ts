import {Args, Command} from '@oclif/core'

import {outputFlags} from '../../lib/flags.js'
import {outputJSON} from '../../lib/output.js'
import {client} from '../../lib/client.js'

export default class ProjectShow extends Command {
  static description = 'Show project details'

  static examples = [
    '<%= config.bin %> project show proj_abc123',
    '<%= config.bin %> project show my-project-slug',
    '<%= config.bin %> project show proj_abc123 --json',
  ]

  static args = {
    id: Args.string({description: 'Project ID or slug', required: true}),
  }

  static flags = {
    ...outputFlags,
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ProjectShow)

    const {data, error} = await client.GET('/builder/projects/{id}', {
      params: {path: {id: args.id}},
    })

    if (error) {
      if (error.error === 'not_found') {
        this.error(`Project not found: ${args.id}`, {exit: 4})
      }
      this.error(`API error: ${error.error ?? 'Unknown'}`, {exit: 1})
    }

    outputJSON(data, flags.json, flags.quiet)
  }
}