import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import {rmSync} from 'node:fs'
import {join} from 'node:path'

const TEST_DIR = join(process.env.HOME || '', '.agnt-test')

function cleanCredentials() {
  try { rmSync(TEST_DIR, {recursive: true})} catch {}
}

describe('bounty', () => {
  beforeEach(() => cleanCredentials())
  afterEach(() => cleanCredentials())

  describe('list', () => {
    it('exits with code 3 when not authenticated', async () => {
      const {error} = await runCommand(['bounty', 'list', '--json'])
      expect(error?.oclif?.exit).to.eq(3)
      expect(error?.message).to.contain('Not authenticated')
    })
  })

  describe('show', () => {
    it('exits with code 3 when not authenticated', async () => {
      const {error} = await runCommand(['bounty', 'show', 'test123', '--json'])
      expect(error?.oclif?.exit).to.eq(3)
      expect(error?.message).to.contain('Not authenticated')
    })
  })

  describe('claim', () => {
    it('exits with code 3 when not authenticated', async () => {
      const {error} = await runCommand(['bounty', 'claim', 'test123', '--json'])
      expect(error?.oclif?.exit).to.eq(3)
      expect(error?.message).to.contain('Not authenticated')
    })

    it('dry-run outputs structured JSON without auth', async () => {
      const {stdout, error} = await runCommand(['bounty', 'claim', 'test123', '--dry-run', '--json'])
      expect(error).to.be.undefined
      const parsed = JSON.parse(stdout)
      expect(parsed.action).to.eq('claim')
      expect(parsed.bounty_id).to.eq('test123')
      expect(parsed.would_claim).to.be.true
    })
  })
})