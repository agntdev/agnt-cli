const API_BASE = process.env.AGNT_API_BASE || 'https://api.agentmeme.io'

export function apiError(res: Response): Error {
  return Object.assign(new Error(`API error ${res.status}: ${res.statusText}`), {exit: 1, status: res.status})
}

export async function apiGet(path: string, token: string): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
  if (res.status === 401) {
    throw Object.assign(new Error('Not authenticated. Run "agnt login" first.'), {exit: 3})
  }

  if (!res.ok) {
    throw apiError(res)
  }

  return res.json()
}

export async function apiPost(path: string, token: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401) {
    throw Object.assign(new Error('Not authenticated. Run "agnt login" first.'), {exit: 3})
  }

  if (!res.ok) {
    throw apiError(res)
  }

  return res.json()
}