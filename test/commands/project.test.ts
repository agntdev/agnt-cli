import {runCommand} from '@oclif/test'
import {describe, it, expect} from 'vitest'
import nock from 'nock'

const API_BASE = 'https://ai-api.open4dev.xyz'

describe('project', () => {
  describe('list', () => {
    it('returns projects list', async () => {
      const scope = nock(API_BASE)
        .get('/api/builder/projects')
        .query({limit: '20'})
        .reply(200, {
          projects: [
            {id: 'proj_1', slug: 'my-project', name: 'My Project', status: 'live'},
          ],
        })

      const {stdout} = await runCommand(['project', 'list', '--json'])
      const parsed = JSON.parse(stdout)
      expect(parsed.projects).to.have.length(1)
      expect(parsed.projects[0].slug).to.eq('my-project')
      scope.done()
    })

    it('passes status filter', async () => {
      const scope = nock(API_BASE)
        .get('/api/builder/projects')
        .query({limit: '20', status: 'live'})
        .reply(200, {projects: []})

      await runCommand(['project', 'list', '--status', 'live', '--json'])
      scope.done()
    })

    it('exits with code 2 for invalid limit', async () => {
      const {error} = await runCommand(['project', 'list', '--limit', '0'])
      expect(error?.oclif?.exit).to.eq(2)
    })
  })

  describe('show', () => {
    it('returns project details', async () => {
      const scope = nock(API_BASE)
        .get('/api/builder/projects/proj_123')
        .reply(200, {id: 'proj_123', slug: 'test', name: 'Test', status: 'live'})

      const {stdout} = await runCommand(['project', 'show', 'proj_123', '--json'])
      const parsed = JSON.parse(stdout)
      expect(parsed.id).to.eq('proj_123')
      scope.done()
    })

    it('exits with code 4 when not found', async () => {
      nock(API_BASE).get('/api/builder/projects/not-exist').reply(404, {error: 'not found'})

      const {error} = await runCommand(['project', 'show', 'not-exist'])
      expect(error?.oclif?.exit).to.eq(4)
    })
  })
})