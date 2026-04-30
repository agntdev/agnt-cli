import {Command, Flags} from '@oclif/core'

import {getCredentials} from '../../lib/auth.js'
import {outputFlags} from '../../lib/flags.js'
import {outputJSON} from '../../lib/output.js'
import {apiGet} from '../../lib/api.js'

interface Bounty {
  id: string
  project_id: string
  project_name: string
  reward: string
  status: string
  title: string
}

export default class BountyList extends Command {
  static description = 'List available bounties'

  static examples = [
    '<%= config.bin %> bounty list',
    '<%= config.bin %> bounty list --project proj_abc123',
    '<%= config.bin %> bounty list --status open',
  ]

  static flags = {
    ...outputFlags,
    limit: Flags.integer({
      char: 'l',
      default: 20,
      description: 'Max bounties to return',
    }),
    project: Flags.string({
      char: 'p',
      description: 'Filter by project ID',
    }),
    status: Flags.string({
      char: 's',
      default: 'open',
      description: 'Filter by status (open, claimed, closed)',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(BountyList)

    if (flags.limit < 1) {
      this.error('limit must be at least 1', {exit: 2})
    }

    const creds = getCredentials()
    if (!creds) {
      this.error('Not authenticated. Run "agnt login" first.', {exit: 3})
    }

    const params = new URLSearchParams({
      limit: String(flags.limit),
      status: flags.status,
    })
    if (flags.project) {
      params.set('project_id', flags.project)
    }

    try {
      const data = await apiGet(`/bounties?${params}`, creds.token) as {bounties?: Bounty[]}
      const bounties = data.bounties ?? []
      outputJSON({bounties}, flags.json, flags.quiet)
    } catch (error) {
      const e = error as {exit?: number; message?: string}
      if (e.exit === 3) {
        this.error(e.message ?? 'Not authenticated', {exit: 3})
      }

      this.error(e.message ?? 'Failed to list bounties', {exit: 1})
    }
  }
}