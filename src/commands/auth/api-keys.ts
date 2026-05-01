import {Command, Flags} from '@oclif/core'

import {isLoggedIn} from '../../lib/auth.js'
import {client, authHeaders} from '../../lib/client.js'
import {logAuthError, outputJSON} from '../../lib/output.js'
import {outputFlags} from '../../lib/flags.js'

export default class AuthApiKeys extends Command {
  static description = 'Manage API keys'

  static examples = [
    '<%= config.bin %> auth api-keys',
    '<%= config.bin %> auth api-keys --create',
    '<%= config.bin %> auth api-keys --revoke <key-id>',
  ]

  static flags = {
    ...outputFlags,
    create: Flags.boolean({
      default: false,
      description: 'Create a new API key',
    }),
    revoke: Flags.string({
      default: undefined,
      description: 'Revoke an API key by ID',
    }),
    force: Flags.boolean({
      char: 'f',
      default: false,
      description: 'Skip confirmation prompts',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(AuthApiKeys)

    if (flags.create) {
      await this.createKey(flags)
      return
    }

    if (flags.revoke) {
      await this.revokeKey(flags.revoke, flags)
      return
    }

    await this.listKeys(flags)
  }

  private async listKeys(flags: {json?: boolean; quiet?: boolean}): Promise<void> {
    if (!isLoggedIn()) {
      logAuthError(this)
      return
    }

    const {data, error} = await client.GET('/builder/agents/me/api-keys', {
      headers: authHeaders(),
    })

    if (error) {
      if (error.error === 'unauthorized' || error.error === 'invalid token') {
        logAuthError(this)
        return
      }
      this.error(`API error: ${error.error ?? 'Unknown'}`, {exit: 1})
    }

    const keys = (data as {keys?: Array<{created_at?: string; id: string; last_used_at?: string; name?: string; prefix?: string; revoked_at?: string}>})?.keys ?? []
    outputJSON({keys}, flags.json ?? false, flags.quiet ?? false)
  }

  private async createKey(flags: {force?: boolean; json?: boolean; quiet?: boolean}): Promise<void> {
    if (!isLoggedIn()) {
      logAuthError(this)
      return
    }

    if (!flags.force) {
      if (process.stdin.isTTY) {
        this.log('A new API key will be created. Store it securely - it will not be shown again.')
        this.log('Run with --force to skip this message.')
        this.error('Confirmation required. Run with --force to skip.', {exit: 2})
      }
      this.error('Confirmation required. Run with --force to skip.', {exit: 2})
    }

    const {data, error} = await client.POST('/builder/agents/me/api-keys', {
      headers: authHeaders(),
    })

    if (error) {
      if (error.error === 'unauthorized' || error.error === 'invalid token') {
        logAuthError(this)
        return
      }
      this.error(`API error: ${error.error ?? 'Unknown'}`, {exit: 1})
    }

    const resp = data as {created_at?: string; id?: string; name?: string; token?: string}

    if (!resp.token) {
      this.error('No token in response', {exit: 1})
    }

    this.log('\nIMPORTANT: Save this token now - it will not be shown again!')
    this.log(`Token: ${resp.token}`)
    this.log(`Key ID: ${resp.id}`)

    outputJSON(
      {
        token: resp.token,
        id: resp.id,
        name: resp.name,
        message: 'Store this token securely - it will not be shown again',
      },
      flags.json ?? false,
      flags.quiet ?? false,
    )
  }

  private async revokeKey(keyId: string, flags: {force?: boolean; json?: boolean; quiet?: boolean}): Promise<void> {
    if (!isLoggedIn()) {
      logAuthError(this)
      return
    }

    if (!flags.force) {
      if (process.stdin.isTTY) {
        this.log(`This will revoke API key: ${keyId}`)
        this.log('Any requests using this key will immediately fail.')
        this.log('Run with --force to skip this message.')
        this.error('Confirmation required. Run with --force to skip.', {exit: 2})
      }
      this.error('Confirmation required. Run with --force to skip.', {exit: 2})
    }

    const {error} = await client.DELETE('/builder/agents/me/api-keys/{id}', {
      params: {path: {id: keyId}},
      headers: authHeaders(),
    })

    if (error) {
      if (error.error === 'unauthorized' || error.error === 'invalid token') {
        logAuthError(this)
        return
      }
      this.error(`API error: ${error.error ?? 'Unknown'}`, {exit: 1})
    }

    this.log(`API key ${keyId} revoked`)
    outputJSON({id: keyId, revoked: true}, flags.json ?? false, flags.quiet ?? false)
  }
}
