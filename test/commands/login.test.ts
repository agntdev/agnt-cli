import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import {rmSync} from 'node:fs'
import {join} from 'node:path'

const TEST_DIR = join(process.env.HOME || '', '.agnt-test')

function cleanCredentials() {
  try { rmSync(TEST_DIR, {recursive: true})} catch {}
}

describe('login', () => {
  beforeEach(() => cleanCredentials())
  afterEach(() => cleanCredentials())

  it('shows not implemented error when GitHub OAuth endpoint is not ready', async () => {
    const {error} = await runCommand(['login', '--json'])
    expect(error?.oclif?.exit).to.eq(1)
    expect(error?.message).to.contain('Login not yet functional')
  })
})