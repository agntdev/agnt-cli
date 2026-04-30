import {runCommand} from '@oclif/test'
import {describe, it, expect} from 'vitest'
import nock from 'nock'

const API_BASE = 'https://ai-api.open4dev.xyz'

describe('task', () => {
  describe('list', () => {
    it('returns tasks list', async () => {
      const scope = nock(API_BASE)
        .get('/api/builder/projects/proj_1/tasks')
        .query({limit: '20'})
        .reply(200, {
          tasks: [
            {id: 'task_1', project_id: 'proj_1', slug: 'T01', title: 'Fix bug', status: 'open'},
          ],
        })

      const {stdout} = await runCommand(['task', 'list', 'proj_1', '--json'])
      const parsed = JSON.parse(stdout)
      expect(parsed.tasks).to.have.length(1)
      expect(parsed.tasks[0].slug).to.eq('T01')
      scope.done()
    })

    it('passes status filter', async () => {
      const scope = nock(API_BASE)
        .get('/api/builder/projects/proj_1/tasks')
        .query({limit: '20', status: 'open'})
        .reply(200, {tasks: []})

      await runCommand(['task', 'list', 'proj_1', '--status', 'open'])
      scope.done()
    })

    it('exits with code 2 for invalid limit', async () => {
      const {error} = await runCommand(['task', 'list', 'proj_1', '--limit', '0'])
      expect(error?.oclif?.exit).to.eq(2)
    })
  })

  describe('show', () => {
    it('returns task details', async () => {
      const scope = nock(API_BASE)
        .get('/api/builder/projects/proj_1/tasks/T01')
        .reply(200, {
          id: 'task_1',
          project_id: 'proj_1',
          slug: 'T01',
          title: 'Fix bug',
          body_md: '## Fix this bug\n\nDo the thing.',
        })

      const {stdout} = await runCommand(['task', 'show', 'proj_1', 'T01', '--json'])
      const parsed = JSON.parse(stdout)
      expect(parsed.slug).to.eq('T01')
      expect(parsed.body_md).to.contain('Fix this bug')
      scope.done()
    })

    it('outputs raw body_md with --body flag', async () => {
      const scope = nock(API_BASE)
        .get('/api/builder/projects/proj_1/tasks/T01')
        .reply(200, {id: 'task_1', slug: 'T01', body_md: '## Raw markdown'})

      const {stdout} = await runCommand(['task', 'show', 'proj_1', 'T01', '--body'])
      expect(stdout).to.eq('## Raw markdown')
      scope.done()
    })

    it('exits with code 4 when not found', async () => {
      nock(API_BASE).get('/api/builder/projects/proj_1/tasks/T99').reply(404, {error: 'not found'})

      const {error} = await runCommand(['task', 'show', 'proj_1', 'T99'])
      expect(error?.oclif?.exit).to.eq(4)
    })
  })
})