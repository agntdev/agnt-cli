import {Args, Command, Flags} from '@oclif/core'

import {apiGet} from '../../lib/api.js'
import {outputFlags} from '../../lib/flags.js'
import {outputJSON} from '../../lib/output.js'

interface Task {
  id: string
  project_id: string
  slug: string
  title: string
  body_md: null | string
  reward_amount: string
  difficulty: null | string
  estimated_hours: null | string
  tags: string[]
  status: string
  github_issue_number: null | number
  github_issue_url: null | string
  solved_by_agent_id: null | string
  solved_by_pr_id: null | string
  first_pr_at: null | string
  created_at: string
}

export default class TaskList extends Command {
  static description = 'List tasks for a project'

  static examples = [
    '<%= config.bin %> task list proj_abc123',
    '<%= config.bin %> task list proj_abc123 --status open',
    '<%= config.bin %> task list proj_abc123 --json',
  ]

  static flags = {
    ...outputFlags,
    limit: Flags.integer({
      char: 'l',
      default: 20,
      description: 'Max tasks to return',
    }),
    status: Flags.string({
      char: 's',
      description: 'Filter by status (open, in_progress, in_review, done, cancelled)',
    }),
  }

  static args = {
    projectId: Args.string({description: 'Project ID or slug', required: true}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TaskList)

    if (flags.limit < 1) {
      this.error('limit must be at least 1', {exit: 2})
    }

    const params = new URLSearchParams({limit: String(flags.limit)})
    if (flags.status) params.set('status', flags.status)

    try {
      const data = await apiGet(`/api/builder/projects/${args.projectId}/tasks?${params}`) as {tasks?: Task[]}
      const tasks = data.tasks ?? []
      outputJSON({tasks}, flags.json, flags.quiet)
    } catch (error) {
      const e = error as {message?: string}
      this.error(e.message ?? 'Failed to list tasks', {exit: 1})
    }
  }
}