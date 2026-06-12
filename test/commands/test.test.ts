import {runCommand} from '@oclif/test'
import {describe, it, expect, beforeEach, afterAll, beforeAll, afterEach} from 'vitest'
import nock from 'nock'
import {writeFileSync, mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {saveCredentials, clearCredentials} from '../../src/lib/auth.js'

const API = 'https://api.agnt-gm.ai'

// A fixture diff that's a few lines long, well under the 256 KiB cap.
const FIXTURE_DIFF = [
  'diff --git a/src/index.ts b/src/index.ts',
  'index 1234567..abcdef0 100644',
  '--- a/src/index.ts',
  '+++ b/src/index.ts',
  '@@ -1,3 +1,4 @@',
  ' import { createBot } from "@agntdev/bot-toolkit";',
  '+import { MemorySessionStorage } from "@agntdev/bot-toolkit";',
  ' export function makeBot() {',
  '   return createBot({ token: process.env.BOT_TOKEN! });',
  ' }',
  '',
].join('\n')

describe('test (preview-review)', () => {
  let workDir: string
  let diffPath: string

  beforeAll(() => {
    workDir = mkdtempSync(join(tmpdir(), 'agnt-test-'))
    diffPath = join(workDir, 'fixture.diff')
    writeFileSync(diffPath, FIXTURE_DIFF, 'utf8')
  })

  afterAll(() => {
    rmSync(workDir, {recursive: true, force: true})
  })

  beforeEach(() => {
    nock.cleanAll()
    saveCredentials({token: 'amk_test', agent_id: 'agent-1'})
  })

  afterEach(() => {
    clearCredentials()
  })

  it('POSTs the diff to /preview-review and prints APPROVE', async () => {
    const scope = nock(API)
      .post('/api/builder/projects/proj-1/tasks/T01/preview-review', body => {
        // Body matches the documented request shape.
        return typeof body?.diff_patch === 'string' && body.diff_patch.length > 0
      })
      .reply(200, {
        verdict: 'approve',
        reasons: ['looks good'],
        suggestions: [],
        engine: 'llm-preview',
        disclaimer: 'advisory',
      })

    const {stdout, error} = await runCommand([
      'test',
      'proj-1',
      'T01',
      '--diff',
      diffPath,
    ])
    expect(error).toBeUndefined()
    expect(scope.isDone()).toBe(true)
    expect(stdout).toContain('APPROVE')
  })

  it('emits JSON when --json is set', async () => {
    nock(API)
      .post('/api/builder/projects/proj-1/tasks/T01/preview-review')
      .reply(200, {
        verdict: 'reject',
        reasons: ['missing test coverage'],
        suggestions: ['add a test for the cancel path'],
        engine: 'llm-preview',
        disclaimer: 'advisory',
      })

    const {stdout, error} = await runCommand([
      'test',
      'proj-1',
      'T01',
      '--diff',
      diffPath,
      '--json',
    ])
    expect(error?.oclif?.exit).toBe(1) // reject exits 1
    const parsed = JSON.parse(stdout)
    expect(parsed.verdict).toBe('reject')
    expect(parsed.reasons).toContain('missing test coverage')
  })

  it('exits 1 on reject verdict (CI gate use case)', async () => {
    nock(API)
      .post('/api/builder/projects/proj-1/tasks/T01/preview-review')
      .reply(200, {
        verdict: 'reject',
        reasons: ['wrong import path'],
        suggestions: [],
        engine: 'llm-preview',
      })

    const {error} = await runCommand([
      'test',
      'proj-1',
      'T01',
      '--diff',
      diffPath,
    ])
    expect(error?.oclif?.exit).toBe(1)
  })

  it('exits 0 on manual_review verdict (advisory pass)', async () => {
    nock(API)
      .post('/api/builder/projects/proj-1/tasks/T01/preview-review')
      .reply(200, {
        verdict: 'manual_review',
        reasons: ['borderline'],
        engine: 'llm-preview',
      })

    const {error} = await runCommand([
      'test',
      'proj-1',
      'T01',
      '--diff',
      diffPath,
    ])
    expect(error).toBeUndefined()
  })

  it('exits 3 when not authenticated', async () => {
    clearCredentials()
    const {error} = await runCommand(['test', 'proj-1', 'T01', '--diff', diffPath])
    expect(error?.oclif?.exit).toBe(3)
  })

  it('exits 4 on 404 (project or task not found)', async () => {
    nock(API)
      .post('/api/builder/projects/missing/tasks/T01/preview-review')
      .reply(404, {error: 'task not found'})

    const {error} = await runCommand([
      'test',
      'missing',
      'T01',
      '--diff',
      diffPath,
    ])
    expect(error?.oclif?.exit).toBe(4)
  })

  it('exits 5 when server LLM is not configured', async () => {
    nock(API)
      .post('/api/builder/projects/proj-1/tasks/T01/preview-review')
      .reply(503, {error: 'preview review unavailable (LLM not configured)'})

    const {error} = await runCommand([
      'test',
      'proj-1',
      'T01',
      '--diff',
      diffPath,
    ])
    expect(error?.oclif?.exit).toBe(5)
  })

  it('exits 1 on generic API error', async () => {
    nock(API)
      .post('/api/builder/projects/proj-1/tasks/T01/preview-review')
      .reply(500, {error: 'boom'})

    const {error} = await runCommand([
      'test',
      'proj-1',
      'T01',
      '--diff',
      diffPath,
    ])
    expect(error?.oclif?.exit).toBe(1)
  })

  it('exits 2 on empty diff file', async () => {
    const emptyPath = join(workDir, 'empty.diff')
    writeFileSync(emptyPath, '', 'utf8')
    const {error} = await runCommand([
      'test',
      'proj-1',
      'T01',
      '--diff',
      emptyPath,
    ])
    expect(error?.oclif?.exit).toBe(2)
  })
})
