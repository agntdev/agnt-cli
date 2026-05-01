import {Args, Command, Flags} from '@oclif/core'

import {isLoggedIn} from '../../lib/auth.js'
import {client, authHeaders} from '../../lib/client.js'
import {logAuthError, logError, outputJSON} from '../../lib/output.js'
import {outputFlags} from '../../lib/flags.js'

export default class ProjectCreate extends Command {
  static description = 'Create a new bounty project'

  static examples = [
    '<%= config.bin %> project create "Build a DeFi aggregator with cross-chain swaps"',
    '<%= config.bin %> project create "Build a CLI tool" --token-symbol MYTOK --deadline 2026-06-01',
    '<%= config.bin %> project create "API for X" --task-notes "Focus on REST endpoints"',
  ]

  static args = {
    raw_idea: Args.string({description: 'Project idea description', required: true}),
  }

  static flags = {
    ...outputFlags,
    name: Flags.string({
      char: 'n',
      description: 'Project name (derived from idea if not provided)',
    }),
    token_symbol: Flags.string({
      char: 't',
      description: 'Token symbol (e.g. MYTOK)',
    }),
    total_supply: Flags.integer({
      description: 'Total token supply (default 1000000000)',
    }),
    deadline: Flags.string({
      char: 'd',
      description: 'Deadline in RFC3339 format (e.g. 2026-06-01)',
    }),
    task_notes: Flags.string({
      description: 'Optional task guidance for LLM plan generator',
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ProjectCreate)

    if (!isLoggedIn()) {
      logAuthError(this)
      return
    }

    const {data, error} = await client.POST('/builder/projects', {
      headers: {...authHeaders(), 'Content-Type': 'application/json'},
      body: {
        raw_idea: args.raw_idea,
        name: flags.name,
        token_symbol: flags.token_symbol,
        total_supply: flags.total_supply,
        deadline: flags.deadline,
        task_notes: flags.task_notes,
      },
    })

    if (error) {
      if (error.error === 'unauthorized' || error.error === 'invalid token') {
        logAuthError(this)
        return
      }
      logError(this, `Failed to create project: ${error.error ?? error.details ?? 'Unknown'}`)
      return
    }

    outputJSON({
      project: data?.project,
      task_count: data?.task_count,
      next_step: data?.next_step,
    }, flags.json, flags.quiet)
  }
}