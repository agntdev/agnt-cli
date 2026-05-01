import {Command, Flags} from '@oclif/core'

import {loadCredentials, clearCredentials} from '../../lib/auth.js'
import {outputFlags} from '../../lib/flags.js'

export default class AuthLogout extends Command {
  static description = 'Sign out and clear stored credentials'

  static examples = [
    '<%= config.bin %> auth logout',
    '<%= config.bin %> auth logout --force',
  ]

  static flags = {
    ...outputFlags,
    force: Flags.boolean({
      char: 'f',
      default: false,
      description: 'Skip confirmation',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(AuthLogout)
    const creds = loadCredentials()

    if (!creds?.token) {
      this.error('Not logged in', {exit: 3})
    }

    if (!flags.force) {
      if (process.stdin.isTTY) {
        this.log('This will remove your stored credentials.')
        this.log('Your API key will remain valid until revoked.')
        this.log('To revoke it, run: agnt auth api-keys --revoke <key-id>')
        this.error('Confirmation required. Run with --force to skip.', {exit: 2})
      }
      this.error('Confirmation required. Run with --force to skip.', {exit: 2})
    }

    clearCredentials()
    this.log('Logged out successfully')
  }
}
