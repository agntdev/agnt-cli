import {Command, Flags} from '@oclif/core'

import {outputFlags} from '../../lib/flags.js'
import {saveCredentials} from '../../lib/auth.js'

const API_BASE = (process.env.AGNT_API_BASE || 'https://api.agnt-gm.ai/api').replace(/\/$/, '')

interface CreateSessionResponse {
  session_id: string
  login_url: string
  expires_at: string
  expires_in: number
}

interface PollReadyResponse {
  status: 'ready'
  token: string
  jwt?: string
  agent?: {
    [key: string]: unknown
    github_username?: string
    id: string
  }
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
      description: 'Open GitHub authorization in browser automatically',
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

    // 1. Create a CLI poll-session
    this.log('')
    this.log('  Creating authentication session…')

    let session: CreateSessionResponse
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
      session = await res.json() as CreateSessionResponse
    } catch (error) {
      this.error(`Failed to create auth session: ${error}`, {exit: 1})
    }

    this.log(`  Session ID: ${session.session_id}`)
    this.log(`  Expires in: ${session.expires_in}s`)
    this.log('')

    // 2. Open the browser directly to GitHub OAuth with the session embedded.
    //    We bypass the SPA's /cli-login page (which doesn't exist yet) and
    //    instead use the API's own ?cli_session= parameter on the GitHub
    //    OAuth start endpoint. The callback handler stores tokens in Redis
    //    under this session_id, and we pick them up via polling below.
    const authUrl = `${API_BASE}/auth/github?cli_session=${session.session_id}&redirect=1`
    this.log('  Opening GitHub authorization…')
    if (flags['auto-open']) {
      await openBrowser(authUrl)
    } else {
      this.log(`  Open this URL in your browser:\n  ${authUrl}`)
    }

    this.log('  Waiting for you to authorize in the browser…')
    this.log('  (polling every 2s)')
    this.log('')

    // 3. Poll for result — intentional sequential polling for device flow
    const timeoutMs = 300_000 // 5 min
    const deadline = Date.now() + timeoutMs

    /* eslint-disable no-await-in-loop */
    while (Date.now() < deadline) {
      await sleep(2000)

      try {
        const res = await fetch(`${API_BASE}/auth/cli-session/${session.session_id}`)

        if (res.status === 200) {
          const data = await res.json() as PollReadyResponse
          this.saveToken(data.token, data.jwt, data.agent?.id)
          return
        }

        if (res.status === 410) {
          const text = await res.text().catch(() => '')
          this.error(`Session expired. Run ${this.config.bin} auth login again.${text ? ' ' + text : ''}`, {exit: 1})
        }

        // 202 = still pending, keep polling
      } catch {
        // Network blip — retry
      }
    }
    /* eslint-enable no-await-in-loop */

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
  return new Promise<void>(resolve => {
    setTimeout(resolve, ms)
  })
}
