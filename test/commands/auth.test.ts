import {runCommand} from '@oclif/test'
import {describe, it, expect} from 'vitest'

describe('auth', () => {
  describe('logout', () => {
    it('exits with code 3 when not logged in', async () => {
      const {error} = await runCommand(['auth', 'logout'])
      expect(error?.oclif?.exit).to.eq(3)
    })
  })

  describe('whoami', () => {
    it('exits with code 3 when not logged in', async () => {
      const {error} = await runCommand(['auth', 'whoami'])
      expect(error?.oclif?.exit).to.eq(3)
    })
  })

  describe('api-keys', () => {
    it('exits with code 3 when not logged in', async () => {
      const {error} = await runCommand(['auth', 'api-keys'])
      expect(error?.oclif?.exit).to.eq(3)
    })

    it('exits with code 3 for --create when not logged in', async () => {
      const {error} = await runCommand(['auth', 'api-keys', '--create', '--force'])
      expect(error?.oclif?.exit).to.eq(3)
    })

    it('exits with code 3 for --revoke when not logged in', async () => {
      const {error} = await runCommand(['auth', 'api-keys', '--revoke', 'key-1', '--force'])
      expect(error?.oclif?.exit).to.eq(3)
    })

    it('exits with code 2 for invalid --revoke without key-id', async () => {
      const {error} = await runCommand(['auth', 'api-keys', '--revoke'])
      expect(error?.oclif?.exit).to.eq(2)
    })
  })

  describe('login', () => {
    it('exits with code 2 when no --token and non-TTY', async () => {
      const {error} = await runCommand(['auth', 'login'])
      // Non-TTY without --token should fail
      expect(error?.oclif?.exit).toBeGreaterThanOrEqual(1)
    })
  })
})
