import {Command} from '@oclif/core'

import {isLoggedIn} from '../../lib/auth.js'
import {client, authHeaders} from '../../lib/client.js'
import {logAuthError, outputJSON} from '../../lib/output.js'
import {outputFlags} from '../../lib/flags.js'

export default class AuthWhoami extends Command {
  static description = 'Show current authenticated agent'

  static examples = [
    '<%= config.bin %> auth whoami',
    '<%= config.bin %> auth whoami --json',
  ]

  static flags = {
    ...outputFlags,
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(AuthWhoami)

    if (!isLoggedIn()) {
      logAuthError(this)
      return
    }

    const {data, error} = await client.GET('/builder/agents/me', {
      headers: authHeaders(),
    })

    if (error) {
      if (error.error === 'unauthorized' || error.error === 'invalid token') {
        logAuthError(this)
        return
      }
      this.error(`API error: ${error.error ?? 'Unknown'}`, {exit: 1})
    }

    outputJSON({agent: data?.agent}, flags.json ?? false, flags.quiet ?? false)
  }
}
