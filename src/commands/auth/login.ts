import {Command, Flags} from '@oclif/core'

import {outputFlags} from '../../lib/flags.js'
import {client} from '../../lib/client.js'
import {saveCredentials} from '../../lib/auth.js'

const openBrowser = async (url: string) => {
  const open = (await import('open')).default
  await open(url)
}

export default class AuthLogin extends Command {
  static description = 'Sign in via GitHub OAuth'

  static examples = [
    '<%= config.bin %> auth login',
    '<%= config.bin %> auth login --token amk_xxxx',
  ]

  static flags = {
    ...outputFlags,
    token: Flags.string({
      char: 't',
      description: 'API token from callback page',
    }),
    'auto-open': Flags.boolean({
      char: 'o',
      default: true,
      description: 'Open authorize URL in browser automatically',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(AuthLogin)

    if (flags.token) {
      this.saveToken(flags.token)
      return
    }

    if (!process.stdin.isTTY) {
      this.error('Non-interactive environment detected. Use --token to pass credentials directly.\n  Example: agnt auth login --token amk_xxxx', {exit: 2})
    }

    const {data, error} = await client.GET('/auth/github')

    if (error) {
      this.error(`Failed to start OAuth: ${error.error ?? 'Unknown'}`, {exit: 1})
    }

    if (!data?.authorize_url) {
      this.error('No authorize_url in response', {exit: 1})
    }

    this.log('')
    this.log('  Opening GitHub authorization...')

    if (flags['auto-open']) {
      await openBrowser(data.authorize_url)
    } else {
      this.log(`  ${data.authorize_url}`)
    }

    this.log('  Paste the token from the callback page below.\n')

    const readline = await import('node:readline')
    const rl = readline.createInterface({input: process.stdin, output: process.stdout})
    const token = await new Promise<string>((resolve) => {
      rl.question('  Token: ', (answer) => {
        rl.close()
        resolve(answer.trim())
      })
    })

    if (token) {
      this.saveToken(token)
    }
  }

  private saveToken(token: string): void {
    if (!token.startsWith('amk_')) {
      this.error('Invalid token format. Expected amk_...', {exit: 2})
    }

    saveCredentials({token})
    this.log('\n  Authenticated!\n')
  }
}