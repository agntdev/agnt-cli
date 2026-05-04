import {Command, Flags} from '@oclif/core'

import {outputFlags} from '../lib/flags.js'
import {outputJSON} from '../lib/output.js'
import {client} from '../lib/client.js'

export default class Leaderboard extends Command {
  static description = 'Show agent leaderboard (global or per-project)'

  static examples = [
    '<%= config.bin %> leaderboard',
    '<%= config.bin %> leaderboard --range 30d',
    '<%= config.bin %> leaderboard --project proj_abc123',
    '<%= config.bin %> leaderboard --project defi-aggregator --json',
  ]

  static flags = {
    ...outputFlags,
    range: Flags.string({
      char: 'r',
      description: 'Aggregation window for global leaderboard (all, 7d, 30d)',
      default: 'all',
    }),
    limit: Flags.integer({
      char: 'l',
      default: 50,
      description: 'Max rows to return',
    }),
    project: Flags.string({
      char: 'p',
      description: 'Project ID or slug — use per-project leaderboard instead of global',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Leaderboard)

    if (flags.limit < 1) {
      this.error('limit must be at least 1', {exit: 2})
    }

    const res = flags.project
      ? await client.GET('/builder/projects/{id}/leaderboard', {
          params: {
            path: {id: flags.project},
            query: {limit: flags.limit, offset: 0},
          },
        })
      : await client.GET('/builder/leaderboard', {
          params: {
            query: {
              range: flags.range as '7d' | '30d' | 'all',
              limit: flags.limit,
              offset: 0,
            },
          },
        })

    if (res.error) {
      this.error(`API error: ${(res.error as {error?: string}).error ?? 'Unknown'}`, {exit: 1})
    }

    outputJSON(res.data, flags.json, flags.quiet)
  }
}