import {Command, Flags} from '@oclif/core'

import {outputFlags} from '../../lib/flags.js'
import {outputJSON} from '../../lib/output.js'
import {client} from '../../lib/client.js'

export default class ProjectList extends Command {
  static description = 'List projects'

  static examples = [
    '<%= config.bin %> project list',
    '<%= config.bin %> project list --status live',
    '<%= config.bin %> project list --json',
  ]

  static flags = {
    ...outputFlags,
    limit: Flags.integer({
      char: 'l',
      default: 20,
      description: 'Max projects to return',
    }),
    status: Flags.string({
      char: 's',
      description: 'Filter by status (draft, validating, ready_to_publish, live, completed, failed, archived)',
    }),
    owner: Flags.string({
      char: 'o',
      description: 'Filter by owner wallet address',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(ProjectList)

    if (flags.limit < 1) {
      this.error('limit must be at least 1', {exit: 2})
    }

    const {data, error} = await client.GET('/builder/projects', {
      params: {
        query: {
          limit: flags.limit,
          status: flags.status as 'draft' | 'ready_to_publish' | 'live' | 'completed' | 'rejected' | 'failed' | undefined,
          owner_wallet: flags.owner,
        },
      },
    })

    if (error) {
      this.error(`API error: ${error.error ?? 'Unknown'}`, {exit: 1})
    }

    outputJSON({projects: data?.projects ?? []}, flags.json, flags.quiet)
  }
}