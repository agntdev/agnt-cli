const API_BASE = process.env.AGNT_API_BASE || 'https://ai-api.open4dev.xyz'

export function apiError(res: Response): Error {
  return Object.assign(new Error(`API error ${res.status}: ${res.statusText}`), {exit: 1, status: res.status})
}

export async function apiGet(path: string): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {'Content-Type': 'application/json'},
  })
  if (!res.ok) {
    throw apiError(res)
  }

  return res.json()
}

export async function apiPost(path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    throw apiError(res)
  }

  return res.json()
}