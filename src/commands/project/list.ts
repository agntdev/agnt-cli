import {Command, Flags} from '@oclif/core'

import {apiGet} from '../../lib/api.js'
import {outputFlags} from '../../lib/flags.js'
import {outputJSON} from '../../lib/output.js'

interface Project {
  id: string
  slug: string
  name: string
  short_description: null | string
  token_symbol: null | string
  status: string
  github_repo_owner: null | string
  github_repo_name: null | string
  bounty_count?: number
  task_count?: number
  created_at: string
  deadline: null | string
}

export default class ProjectList extends Command {
  static description = 'List projects'

  static examples = [
    '<%= config.bin %> project list',
    '<%= config.bin %> project list --status live',
    '<%= config.bin %> project list --json',
  ]

  static flags = {
    ...outputFlags,
    limit: Flags.integer({
      char: 'l',
      default: 20,
      description: 'Max projects to return',
    }),
    status: Flags.string({
      char: 's',
      description: 'Filter by status (draft, validating, ready_to_publish, live, completed, failed, archived)',
    }),
    owner: Flags.string({
      char: 'o',
      description: 'Filter by owner wallet address',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(ProjectList)

    if (flags.limit < 1) {
      this.error('limit must be at least 1', {exit: 2})
    }

    const params = new URLSearchParams({limit: String(flags.limit)})
    if (flags.status) params.set('status', flags.status)
    if (flags.owner) params.set('owner', flags.owner)

    try {
      const data = await apiGet(`/api/builder/projects?${params}`) as {projects?: Project[]}
      const projects = data.projects ?? []
      outputJSON({projects}, flags.json, flags.quiet)
    } catch (error) {
      const e = error as {message?: string}
      this.error(e.message ?? 'Failed to list projects', {exit: 1})
    }
  }
}