import {Command, Flags} from '@oclif/core'

import {getCredentials, isAuthenticated} from '../../lib/auth.js'
import {outputFlags} from '../../lib/flags.js'

const GITHUB_CLIENT_ID = process.env.AGNT_GITHUB_CLIENT_ID || 'placeholder-client-id'
const API_BASE = process.env.AGNT_API_BASE || 'https://api.agentmeme.io'

export default class Login extends Command {
  static description = 'Authenticate with agentmeme via GitHub OAuth'

  static examples = ['<%= config.bin %> login']

  static flags = {
    ...outputFlags,
    yes: Flags.boolean({
      char: 'y',
      default: false,
      description: 'Skip confirmation if already authenticated',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Login)

    if (isAuthenticated() && !flags.yes) {
      const existing = getCredentials()
      process.stderr.write(
        'Already authenticated. Token starts with: ' + (existing?.token.slice(0, 8) ?? '') + '...\n',
      )
      process.stderr.write('Use --yes to overwrite existing credentials.\n')
      return
    }

    const authUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&scope=user:email&redirect_uri=http://localhost:8080/callback`

    this.log(`Opening GitHub OAuth: ${authUrl}`)
    this.log('NOTE: GitHub OAuth endpoint not yet implemented on server.')
    this.log('Expected: POST /auth/github on ' + API_BASE)

    this.error('Login not yet functional. Webapp team needs to implement /auth/github endpoint.', {exit: 1})
  }
}