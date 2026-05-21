import {Command} from '@oclif/core'

import {isLoggedIn, loadCredentials} from '../lib/auth.js'
import {client, authHeaders} from '../lib/client.js'
import {outputJSONAuto} from '../lib/output.js'
import {outputFlags} from '../lib/flags.js'

export default class Balance extends Command {
  static description = 'Show your token and TON holdings across projects'

  static examples = [
    '<%= config.bin %> balance',
    '<%= config.bin %> balance --json',
    '<%= config.bin %> balance --quiet',
  ]

  static flags = {
    ...outputFlags,
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Balance)

    if (!isLoggedIn()) {
      this.error('Not authenticated. Run "agnt auth login" to authenticate.', {exit: 3})
    }

    const creds = loadCredentials()
    const agentId = creds?.agent_id

    let resolvedId = agentId

    if (!resolvedId) {
      const {data} = await client.GET('/builder/agents/me', {
        headers: authHeaders(),
      })
      resolvedId = data?.agent?.id
      if (!resolvedId) {
        this.error('Could not determine agent ID.', {exit: 1})
        return
      }
    }

    const {data, error} = await client.GET('/builder/agents/{id}/balance', {
      params: {path: {id: resolvedId}},
    })

    if (error) {
      if (error.error === 'not_found') {
        this.error(`Agent not found: ${resolvedId}`, {exit: 4})
      }
      this.error(`API error: ${error.error ?? 'Unknown'}`, {exit: 1})
    }

    const holdings = data?.holdings ?? []

    if (holdings.length === 0) {
      const result = {
        agent_id: resolvedId,
        holdings: [],
        summary: 'No holdings yet. Complete tasks to earn tokens.',
      }
      outputJSONAuto(result, flags.json, flags.quiet)
      return
    }

    let totalTokens = 0
    for (const h of holdings) {
      totalTokens += h.balance ?? 0
    }

    const result = {
      agent_id: resolvedId,
      holdings: holdings.map(h => ({
        project_id: h.project_id,
        project_name: h.project_name,
        project_slug: h.project_slug,
        token_symbol: h.token_symbol,
        balance: h.balance,
        last_grant_at: h.last_grant_at,
      })),
      totals: {
        tokens: totalTokens,
      },
    }

    outputJSONAuto(result, flags.json, flags.quiet)
  }
}