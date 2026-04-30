import {Args, Command} from '@oclif/core'

import {getCredentials} from '../../lib/auth.js'
import {apiGet} from '../../lib/api.js'
import {outputFlags} from '../../lib/flags.js'
import {outputJSON} from '../../lib/output.js'

export default class BountyShow extends Command {
  static description = 'Show bounty details'

  static examples = [
    '<%= config.bin %> bounty show bounty_xyz789',
  ]

  static args = {
    id: Args.string({description: 'Bounty ID', required: true}),
  }

  static flags = {
    ...outputFlags,
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(BountyShow)

    const creds = getCredentials()
    if (!creds) {
      this.error('Not authenticated. Run "agnt login" first.', {exit: 3})
    }

    try {
      const bounty = await apiGet(`/bounties/${args.id}`, creds.token)
      outputJSON(bounty, flags.json, flags.quiet)
    } catch (error) {
      const e = error as {exit?: number; message?: string; status?: number}
      if (e.exit === 3) {
        this.error(e.message ?? 'Not authenticated', {exit: 3})
      }

      if (e.status === 404) {
        this.error(`Bounty not found: ${args.id}`, {exit: 4})
      }

      this.error(e.message ?? 'Failed to get bounty', {exit: 1})
    }
  }
}