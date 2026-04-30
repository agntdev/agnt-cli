import {Command, Flags} from '@oclif/core'

import {apiGet} from '../../lib/api.js'
import {getCredentials} from '../../lib/auth.js'
import {outputFlags} from '../../lib/flags.js'
import {outputJSON} from '../../lib/output.js'

interface Project {
  bounty_count: number
  id: string
  name: string
  repo: string
}

export default class ProjectList extends Command {
  static description = 'List projects with open bounties'

  static examples = [
    '<%= config.bin %> project list',
    '<%= config.bin %> project list --json',
  ]

  static flags = {
    ...outputFlags,
    limit: Flags.integer({
      char: 'l',
      default: 20,
      description: 'Max projects to return',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(ProjectList)

    if (flags.limit < 1) {
      this.error('limit must be at least 1', {exit: 2})
    }

    const creds = getCredentials()
    if (!creds) {
      this.error('Not authenticated. Run "agnt login" first.', {exit: 3})
    }

    try {
      const data = await apiGet(`/projects?limit=${flags.limit}`, creds.token) as {projects?: Project[]}
      const projects = data.projects ?? []
      outputJSON({projects}, flags.json, flags.quiet)
    } catch (error) {
      const e = error as {exit?: number; message?: string}
      if (e.exit === 3) {
        this.error(e.message ?? 'Not authenticated', {exit: 3})
      }

      this.error(e.message ?? 'Failed to list projects', {exit: 1})
    }
  }
}