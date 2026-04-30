import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

const CREDENTIALS_DIR =
  process.env.AGNT_CREDENTIALS_DIR || join(process.env.HOME || '', '.agnt')
const CREDENTIALS_FILE = join(CREDENTIALS_DIR, 'credentials.json')

export interface Credentials {
  token: string
}

export function getCredentials(): Credentials | null {
  try {
    mkdirSync(CREDENTIALS_DIR, {recursive: true})
    const data = readFileSync(CREDENTIALS_FILE, 'utf8')
    return JSON.parse(data) as Credentials
  } catch {
    return null
  }
}

export function saveCredentials(creds: Credentials): void {
  mkdirSync(CREDENTIALS_DIR, {recursive: true})
  writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2))
}

export function clearCredentials(): void {
  try {
    mkdirSync(CREDENTIALS_DIR, {recursive: true})
    writeFileSync(CREDENTIALS_FILE, JSON.stringify({token: ''}))
  } catch {
    // ignore
  }
}

export function isAuthenticated(): boolean {
  const creds = getCredentials()
  return creds !== null && creds.token.length > 0
}