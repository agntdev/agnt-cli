import {Command, Flags} from '@oclif/core'

import {outputFlags} from '../../lib/flags.js'
import {outputJSON} from '../../lib/output.js'
import {client} from '../../lib/client.js'
import {saveCredentials} from '../../lib/auth.js'

export default class AuthLogin extends Command {
  static description = 'Sign in via GitHub OAuth'

  static examples = [
    '<%= config.bin %> auth login',
    '<%= config.bin %> auth login --callback https://agentmeme.io/auth/callback?code=xxx&state=yyy',
  ]

  static flags = {
    ...outputFlags,
    callback: Flags.string({
      description: 'GitHub OAuth callback URL (paste after authorizing in browser)',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(AuthLogin)

    if (flags.callback) {
      await this.handleCallback(flags.callback, flags)
      return
    }

    const {data, error} = await client.GET('/auth/github')

    if (error) {
      this.error(`Failed to start OAuth: ${error.error ?? 'Unknown'}`, {exit: 1})
    }

    if (!data?.authorize_url) {
      this.error('No authorize_url in response', {exit: 1})
    }

    this.log(`Visit this URL to authorize:\n${data.authorize_url}\n`)
    this.log('After authorizing, GitHub will redirect you. Paste the final URL here:')
    this.log('(Look in your browser address bar - it will have ?code=...&state=...)')
  }

  private async handleCallback(callbackUrl: string, flags: {json?: boolean; quiet?: boolean}): Promise<void> {
    let code: string | undefined
    let state: string | undefined

    try {
      const url = new URL(callbackUrl)
      code = url.searchParams.get('code') ?? undefined
      state = url.searchParams.get('state') ?? undefined
    } catch {
      this.error('Invalid callback URL', {exit: 2})
    }

    if (!code || !state) {
      this.error('callback URL must contain code and state params', {exit: 2})
    }

    const {data, error} = await client.GET('/auth/github/callback', {
      params: {
        query: {code, state, format: 'json'},
      },
    })

    if (error) {
      this.error(`OAuth callback failed: ${error.error ?? 'Unknown'}`, {exit: 1})
    }

    const token = (data as {token?: string})?.token
    const jwt = (data as {jwt?: string})?.jwt
    const agent = (data as {agent?: {id?: string}})?.agent

    if (!token) {
      this.error('No token in OAuth response', {exit: 1})
    }

    saveCredentials({
      token,
      jwt: jwt ?? undefined,
      agent_id: agent?.id ?? undefined,
    })

    this.log('Authenticated successfully!')

    if (agent) {
      this.log(`Agent ID: ${agent.id}`)
    }

    outputJSON(
      {
        token,
        agent_id: agent?.id,
        message: 'Token stored in ~/.agnt/credentials.json',
      },
      flags.json ?? false,
      flags.quiet ?? false,
    )
  }
}
