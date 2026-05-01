import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

const CREDENTIALS_DIR = process.env.AGNT_CREDENTIALS_DIR || join(process.env.HOME || '', '.agnt')
const CREDENTIALS_FILE = join(CREDENTIALS_DIR, 'credentials.json')

export interface Credentials {
  token: string
  agent_id?: string
  jwt?: string
}

export function loadCredentials(): Credentials | null {
  try {
    mkdirSync(CREDENTIALS_DIR, {recursive: true})
    const raw = readFileSync(CREDENTIALS_FILE, 'utf8')
    return JSON.parse(raw) as Credentials
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
    const creds = loadCredentials()
    if (creds) {
      const backupFile = CREDENTIALS_FILE + '.bak'
      writeFileSync(backupFile, JSON.stringify(creds, null, 2))
    }
    writeFileSync(CREDENTIALS_FILE, JSON.stringify({}))
  } catch {
    // ignore
  }
}

export function getToken(): null | string {
  return loadCredentials()?.token ?? null
}

export function isLoggedIn(): boolean {
  return getToken() !== null
}
