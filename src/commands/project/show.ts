import {Args, Command} from '@oclif/core'

import {apiGet} from '../../lib/api.js'
import {outputFlags} from '../../lib/flags.js'
import {outputJSON} from '../../lib/output.js'

export default class ProjectShow extends Command {
  static description = 'Show project details'

  static examples = [
    '<%= config.bin %> project show proj_abc123',
    '<%= config.bin %> project show my-project-slug',
    '<%= config.bin %> project show proj_abc123 --json',
  ]

  static args = {
    id: Args.string({description: 'Project ID or slug', required: true}),
  }

  static flags = {
    ...outputFlags,
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ProjectShow)

    try {
      const project = await apiGet(`/api/builder/projects/${args.id}`)
      outputJSON(project, flags.json, flags.quiet)
    } catch (error) {
      const e = error as {message?: string; status?: number}
      if (e.status === 404) {
        this.error(`Project not found: ${args.id}`, {exit: 4})
      }

      this.error(e.message ?? 'Failed to get project', {exit: 1})
    }
  }
}