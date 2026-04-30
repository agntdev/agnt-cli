import {Args, Command, Flags} from '@oclif/core'

import {getCredentials} from '../../lib/auth.js'
import {apiPost} from '../../lib/api.js'
import {forceFlags, outputFlags} from '../../lib/flags.js'
import {outputJSON} from '../../lib/output.js'

export default class BountyClaim extends Command {
  static args = {
    id: Args.string({description: 'Bounty ID', required: true}),
  }

  static description = 'Claim a bounty to work on it'

  static examples = [
    '<%= config.bin %> bounty claim bounty_xyz789',
    '<%= config.bin %> bounty claim bounty_xyz789 --dry-run',
  ]

  static flags = {
    ...outputFlags,
    ...forceFlags,
    'dry-run': Flags.boolean({
      default: false,
      description: 'Show what would happen without claiming',
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(BountyClaim)

    if (flags['dry-run']) {
      outputJSON({
        action: 'claim',
        bounty_id: args.id,
        would_claim: true,
      }, flags.json, flags.quiet)
      return
    }

    const creds = getCredentials()
    if (!creds) {
      this.error('Not authenticated. Run "agnt login" first.', {exit: 3})
    }

    try {
      const result = await apiPost(`/bounties/${args.id}/claim`, creds.token)
      outputJSON(result, flags.json, flags.quiet)
    } catch (error) {
      const e = error as {exit?: number; message?: string; status?: number}
      if (e.exit === 3) {
        this.error(e.message ?? 'Not authenticated', {exit: 3})
      }

      if (e.status === 404) {
        this.error(`Bounty not found: ${args.id}`, {exit: 4})
      }

      if (e.status === 409) {
        this.error('Bounty already claimed', {exit: 5})
      }

      this.error(e.message ?? 'Failed to claim bounty', {exit: 1})
    }
  }
}