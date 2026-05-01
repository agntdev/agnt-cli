import {runCommand} from '@oclif/test'
import {describe, it, expect} from 'vitest'

describe('task', () => {
  describe('list', () => {
    it('exits with code 2 for invalid limit', async () => {
      const {error} = await runCommand(['task', 'list', 'proj_1', '--limit', '0'])
      expect(error?.oclif?.exit).to.eq(2)
    })

    it('requires project id argument', async () => {
      const {error} = await runCommand(['task', 'list'])
      expect(error?.oclif?.exit).to.eq(2)
    })
  })

  describe('show', () => {
    it('requires project id and slug arguments', async () => {
      const {error} = await runCommand(['task', 'show'])
      expect(error?.oclif?.exit).to.eq(2)
    })
  })
})