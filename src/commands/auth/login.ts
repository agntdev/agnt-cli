import {Command, Flags} from '@oclif/core'

import {outputFlags} from '../../lib/flags.js'
import {saveCredentials} from '../../lib/auth.js'

const API_BASE = (process.env.AGNT_API_BASE || 'https://api.agnt-gm.ai/api').replace(/\/$/, '')

interface CliSession {
  session_id: string
  login_url: string
  expires_at: string
}

interface CliSessionResult {
  token: string
  jwt?: string
  agent?: {id: string}
}

const openBrowser = async (url: string) => {
  const open = (await import('open')).default
  await open(url)
}

export default class AuthLogin extends Command {
  static description = 'Sign in via GitHub OAuth (device flow)'

  static examples = [
    '<%= config.bin %> auth login',
    '<%= config.bin %> auth login --token amk_xxxx',
  ]

  static flags = {
    ...outputFlags,
    token: Flags.string({
      char: 't',
      description: 'API token (skip browser auth)',
    }),
    'auto-open': Flags.boolean({
      char: 'o',
      default: true,
      description: 'Open authorize URL in browser automatically',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(AuthLogin)

    if (flags.token) {
      this.saveToken(flags.token)
      return
    }

    if (!process.stdin.isTTY) {
      this.error('Non-interactive environment detected. Use --token to pass credentials directly.\n  Example: agnt auth login --token amk_xxxx', {exit: 2})
    }

    // 1. Create a CLI session
    this.log('')
    this.log('  Creating authentication session…')

    let session: CliSession
    try {
      const res = await fetch(`${API_BASE}/auth/cli-session`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({client_name: 'agnt-cli'}),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => 'Unknown')
        this.error(`Failed to create auth session: ${res.status} ${text}`, {exit: 1})
      }
      session = await res.json() as CliSession
    } catch (err) {
      this.error(`Failed to create auth session: ${err}`, {exit: 1})
    }

    this.log(`  Session ID: ${session.session_id}`)
    this.log(`  Expires at: ${session.expires_at}`)
    this.log('')

    // 2. Open browser
    this.log('  Opening GitHub authorization…')
    if (flags['auto-open']) {
      await openBrowser(session.login_url)
    } else {
      this.log(`  ${session.login_url}`)
    }

    this.log('  Waiting for you to authorize in the browser…')
    this.log('  (polling every 2s)')
    this.log('')

    // 3. Poll for result
    const timeoutMs = 300_000 // 5 min
    const deadline = Date.now() + timeoutMs

    while (Date.now() < deadline) {
      await sleep(2000)

      try {
        const res = await fetch(`${API_BASE}/auth/cli-session/${session.session_id}`)

        if (res.status === 200) {
          const data = await res.json() as CliSessionResult
          this.saveToken(data.token, data.jwt, data.agent?.id)
          return
        }

        if (res.status === 410) {
          this.error('Session expired. Run agnt auth login again.', {exit: 1})
        }

        // 202 = still pending, keep polling
      } catch {
        // Network blip — retry
      }
    }

    this.error('Authentication timed out after 5 minutes.', {exit: 1})
  }

  private saveToken(token: string, jwt?: string, agentId?: string): void {
    if (!token.startsWith('amk_')) {
      this.error('Invalid token format. Expected amk_...', {exit: 2})
    }

    saveCredentials({token, jwt, agent_id: agentId})
    this.log('\n  Authenticated!\n')
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
