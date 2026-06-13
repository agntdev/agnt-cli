import {runCommand} from '@oclif/test'
import {describe, it, expect, beforeEach, afterAll} from 'vitest'
import nock from 'nock'
import {saveCredentials, clearCredentials} from '../../src/lib/auth.js'

const API = 'https://api.agnt-gm.ai'

describe('phase', () => {
  beforeEach(() => {
    nock.cleanAll()
    saveCredentials({token: 'amk_test', agent_id: 'agent-1'})
  })

  afterAll(() => {
    clearCredentials()
  })

  describe('advance', () => {
    it('POSTs with the Authorization header (regression for #PR51: missing-header bug)', async () => {
      // GET /phase (no auth required)
      nock(API)
        .get('/api/builder/projects/proj-1/phase')
        .reply(200, {
          project_id: 'proj-1',
          current_phase: 'details',
          phase_status: 'failed',
        })

      // GET /projects/:id for build_mode (no auth required)
      nock(API)
        .get('/api/builder/projects/proj-1')
        .reply(200, {
          id: 'proj-1',
          slug: 'my-project',
          build_mode: 'platform_agent',
        })

      // POST /phase/advance — the regression test. We assert the
      // request actually carries the Authorization header. The
      // first cut shipped without it (openapi-fetch happily sends
      // an unauthenticated POST) and surfaced as "missing or
      // invalid Authorization header". This test fails if the
      // header is missing.
      const postScope = nock(API, {
        reqheaders: {
          authorization: 'Bearer amk_test',
        },
      })
        .post('/api/builder/projects/proj-1/phase/advance', body => {
          return body?.reason === 'owner_override'
        })
        .reply(200, {ok: true, advanced_to: 'dev'})

      const {stdout, error} = await runCommand([
        'phase',
        'advance',
        'proj-1',
      ])
      expect(error).toBeUndefined()
      expect(postScope.isDone()).toBe(true)
      expect(stdout).toContain('Phase advanced')
      expect(stdout).toContain('dev')
      expect(stdout).toContain('owner_override')
    })

    it('refuses to advance a non-failed phase (safety gate)', async () => {
      nock(API)
        .get('/api/builder/projects/proj-1/phase')
        .reply(200, {
          project_id: 'proj-1',
          current_phase: 'design',
          phase_status: 'active',
        })
      nock(API)
        .get('/api/builder/projects/proj-1')
        .reply(200, {id: 'proj-1', build_mode: 'platform_agent'})

      const {error} = await runCommand(['phase', 'advance', 'proj-1'])
      expect(error?.oclif?.exit).toBe(1)
      expect(error?.message).toContain('not "failed"')
    })

    it('returns the 401 hint when the server says "missing or invalid Authorization header"', async () => {
      nock(API)
        .get('/api/builder/projects/proj-1/phase')
        .reply(200, {current_phase: 'details', phase_status: 'failed'})
      nock(API)
        .get('/api/builder/projects/proj-1')
        .reply(200, {id: 'proj-1', build_mode: 'platform_agent'})
      // 401 from server (the old bug — header not sent). Even
      // though we now send it, this tests the error-message
      // mapping for the 401 case.
      nock(API)
        .post('/api/builder/projects/proj-1/phase/advance')
        .reply(401, {error: 'missing or invalid Authorization header'})

      const {error} = await runCommand(['phase', 'advance', 'proj-1'])
      expect(error?.oclif?.exit).toBe(1)
      expect(error?.message).toContain('Authentication failed')
    })

    it('returns the 403 hint when the server says "not the owner"', async () => {
      nock(API)
        .get('/api/builder/projects/proj-1/phase')
        .reply(200, {current_phase: 'details', phase_status: 'failed'})
      nock(API)
        .get('/api/builder/projects/proj-1')
        .reply(200, {id: 'proj-1', build_mode: 'platform_agent'})
      nock(API)
        .post('/api/builder/projects/proj-1/phase/advance')
        .reply(403, {error: 'not the owner of this project'})

      const {error} = await runCommand(['phase', 'advance', 'proj-1'])
      expect(error?.oclif?.exit).toBe(1)
      expect(error?.message).toContain('Owner authorization required')
    })

    it('warns (but allows) advance on local_agent projects', async () => {
      nock(API)
        .get('/api/builder/projects/proj-1/phase')
        .reply(200, {current_phase: 'details', phase_status: 'failed'})
      nock(API)
        .get('/api/builder/projects/proj-1')
        .reply(200, {id: 'proj-1', build_mode: 'local_agent'})
      nock(API)
        .post('/api/builder/projects/proj-1/phase/advance')
        .reply(200, {ok: true, advanced_to: 'dev'})

      const {stdout, error} = await runCommand(['phase', 'advance', 'proj-1'])
      expect(error).toBeUndefined()
      expect(stdout).toContain('local_agent')
      expect(stdout).toContain('Note')
    })
  })
})
