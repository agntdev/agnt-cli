import createClient from 'openapi-fetch'
import type {paths} from './api-types.js'
import {getToken} from './auth.js'

const API_BASE = process.env.AGNT_API_BASE || 'https://api.agnt-gm.ai/api'

export const client = createClient<paths>({baseUrl: API_BASE})

export function authHeaders(): Record<string, string> {
  const token = getToken()
  if (!token) return {}
  return {Authorization: `Bearer ${token}`}
}