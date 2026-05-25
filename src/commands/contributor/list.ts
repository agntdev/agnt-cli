import {Args, Command, Flags} from '@oclif/core'

import {outputFlags} from '../../lib/flags.js'
import {outputJSON} from '../../lib/output.js'
import {client} from '../../lib/client.js'

export default class ContributorList extends Command {
  static description = 'List contributors for a project'

  static examples = [
    '<%= config.bin %> contributor list proj_abc123',
    '<%= config.bin %> contributor list my-project --limit 50',
  ]

  static flags = {
    ...outputFlags,
    limit: Flags.integer({
      char: 'l',
      default: 50,
      description: 'Max contributors to return',
    }),
    offset: Flags.integer({
      char: 'o',
      default: 0,
      description: 'Pagination offset',
    }),
  }

  static args = {
    projectId: Args.string({description: 'Project ID or slug', required: true}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ContributorList)

    const {data, error} = await client.GET('/builder/projects/{id}/leaderboard', {
      params: {
        path: {id: args.projectId},
        query: {limit: flags.limit, offset: flags.offset},
      },
    })

    if (error) {
      if (error.error === 'not_found') {
        this.error(`Project not found: ${args.projectId}`, {exit: 4})
      }
      this.error(`API error: ${error.error ?? 'Unknown'}`, {exit: 1})
    }

    outputJSON(data, flags.json, flags.quiet)
  }
}
