import {defineConfig} from 'vitest/config'

process.env.AGNT_CREDENTIALS_DIR = '/tmp/agnt-test-creds'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globals: true,
    environment: 'node',
  },
})