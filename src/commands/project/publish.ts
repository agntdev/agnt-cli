import {Args, Command} from '@oclif/core'

import {isLoggedIn} from '../../lib/auth.js'
import {client, authHeaders} from '../../lib/client.js'
import {logAuthError, logError, outputJSON} from '../../lib/output.js'
import {outputFlags} from '../../lib/flags.js'

export default class ProjectPublish extends Command {
  static description = 'Publish a ready_to_publish project to GitHub'

  static examples = [
    '<%= config.bin %> project publish proj_abc123',
    '<%= config.bin %> project publish my-project-slug',
    '<%= config.bin %> project publish proj_abc123 --json',
  ]

  static args = {
    id: Args.string({description: 'Project ID or slug', required: true}),
  }

  static flags = {
    ...outputFlags,
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ProjectPublish)

    if (!isLoggedIn()) {
      logAuthError(this)
      return
    }

    const {data, error} = await client.POST('/builder/projects/{id}/publish', {
      headers: authHeaders(),
      params: {path: {id: args.id}},
    })

    if (error) {
      if (error.error === 'unauthorized' || error.error === 'invalid token') {
        logAuthError(this)
        return
      }
      if (error.error === 'not_found') {
        this.error(`Project not found: ${args.id}`, {exit: 4})
        return
      }
      if (error.details?.includes('not ready_to_publish')) {
        this.error(`Project is not ready to publish. Status: ${error.details}`, {exit: 5})
        return
      }
      if (error.details?.includes('not project owner')) {
        this.error('You are not the owner of this project', {exit: 3})
        return
      }
      logError(this, `Failed to publish project: ${error.error ?? error.details ?? 'Unknown'}`)
      return
    }

    outputJSON({
      project: data?.project,
      github_repo_url: data?.github_repo_url,
      issues_opened: data?.issues_opened,
    }, flags.json, flags.quiet)
  }
}