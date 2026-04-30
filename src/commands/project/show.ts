import {Args, Command} from '@oclif/core'

import {apiGet} from '../../lib/api.js'
import {getCredentials} from '../../lib/auth.js'
import {outputFlags} from '../../lib/flags.js'
import {outputJSON} from '../../lib/output.js'

export default class ProjectShow extends Command {
  static description = 'Show project details'

  static examples = [
    '<%= config.bin %> project show proj_abc123',
    '<%= config.bin %> project show proj_abc123 --quiet',
  ]

  static args = {
    id: Args.string({description: 'Project ID', required: true}),
  }

  static flags = {
    ...outputFlags,
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ProjectShow)

    const creds = getCredentials()
    if (!creds) {
      this.error('Not authenticated. Run "agnt login" first.', {exit: 3})
    }

    try {
      const project = await apiGet(`/projects/${args.id}`, creds.token)
      outputJSON(project, flags.json, flags.quiet)
    } catch (error) {
      const e = error as {exit?: number; message?: string; status?: number}
      if (e.exit === 3) {
        this.error(e.message ?? 'Not authenticated', {exit: 3})
      }

      if (e.status === 404) {
        this.error(`Project not found: ${args.id}`, {exit: 4})
      }

      this.error(e.message ?? 'Failed to get project', {exit: 1})
    }
  }
}