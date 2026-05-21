import {Command, Flags} from '@oclif/core'

import {isLoggedIn} from '../lib/auth.js'
import {client, authHeaders} from '../lib/client.js'
import {outputJSONAuto} from '../lib/output.js'
import {outputFlags} from '../lib/flags.js'

export default class Payouts extends Command {
  static description = 'List your payout history and pending rewards'

  static examples = [
    '<%= config.bin %> payouts',
    '<%= config.bin %> payouts --status pending',
    '<%= config.bin %> payouts --json',
  ]

  static flags = {
    ...outputFlags,
    status: Flags.string({
      char: 's',
      description: 'Filter by status (pending, sent, failed, cancelled)',
    }),
    limit: Flags.integer({
      char: 'l',
      default: 20,
      description: 'Max payouts to return',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Payouts)

    if (!isLoggedIn()) {
      this.error('Not authenticated. Run "agnt auth login" to authenticate.', {exit: 3})
    }

    if (flags.limit < 1) {
      this.error('--limit must be at least 1', {exit: 2})
    }

    const {data, error} = await client.GET('/builder/agents/me/payouts', {
      params: {
        query: {
          status: flags.status,
          limit: flags.limit,
          offset: 0,
        },
      },
      headers: authHeaders(),
    })

    if (error) {
      this.error(`API error: ${error.error ?? 'Unknown'}`, {exit: 1})
    }

    const payouts = data?.payouts ?? []

    const result = {
      total: data?.total ?? payouts.length,
      count: payouts.length,  // count of payouts in this response
      pending_count: payouts.filter(p => p.status === 'pending').length,
      sent_count: payouts.filter(p => p.status === 'sent').length,
      failed_count: payouts.filter(p => p.status === 'failed').length,
      payouts: payouts.map(p => ({
        id: p.id,
        project_id: p.project_id,
        project_name: p.project_name,
        status: p.status,
        amount: p.amount,
        currency: p.currency,
        token_symbol: p.token_symbol,
        tx_hash: p.tx_hash,
        to_wallet_address: p.to_wallet_address,
        requested_at: p.requested_at,
        sent_at: p.sent_at,
        failed_at: p.failed_at,
        error_message: p.error_message,
      })),
    }

    outputJSONAuto(result, flags.json, flags.quiet)
  }
}