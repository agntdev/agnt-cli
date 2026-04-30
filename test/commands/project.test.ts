import {runCommand} from '@oclif/test'
import {rmSync} from 'node:fs'
import {join} from 'node:path'
import {describe, it, beforeEach, afterEach, expect} from 'vitest'

const TEST_DIR = join(process.env.HOME || '', '.agnt-test')

function cleanCredentials() {
  try { rmSync(TEST_DIR, {recursive: true})} catch {}
}

describe('project', () => {
  beforeEach(() => cleanCredentials())
  afterEach(() => cleanCredentials())

  describe('list', () => {
    it('exits with code 3 when not authenticated', async () => {
      const {error} = await runCommand(['project', 'list', '--json'])
      expect(error?.oclif?.exit).to.eq(3)
      expect(error?.message).to.contain('Not authenticated')
    })
  })

  describe('show', () => {
    it('exits with code 3 when not authenticated', async () => {
      const {error} = await runCommand(['project', 'show', 'test123', '--json'])
      expect(error?.oclif?.exit).to.eq(3)
      expect(error?.message).to.contain('Not authenticated')
    })
  })
})