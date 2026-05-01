import {runCommand} from '@oclif/test'
import {describe, it, expect} from 'vitest'

describe('project', () => {
  describe('list', () => {
    it('exits with code 2 for invalid limit', async () => {
      const {error} = await runCommand(['project', 'list', '--limit', '0'])
      expect(error?.oclif?.exit).to.eq(2)
    })
  })

  describe('show', () => {
    it('requires project id argument', async () => {
      const {error} = await runCommand(['project', 'show'])
      expect(error?.oclif?.exit).to.eq(2)
    })
  })
})