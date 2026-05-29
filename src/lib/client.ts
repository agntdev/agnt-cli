import createClient from "openapi-fetch";
import type { paths } from "./api-types.js";
import { getToken, getJwt, loadCredentials, saveCredentials } from "./auth.js";

const API_BASE = process.env.AGNT_API_BASE || "https://api.agnt-gm.ai/api";

export const client = createClient<paths>({ baseUrl: API_BASE });

export function authHeaders(): Record<string, string> {
  const token = getToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

/**
 * Try to recover from amk_ key failure using stored JWT.
 * If JWT is still valid, generates a fresh amk_ key and saves it.
 * Returns true if recovery succeeded.
 */
export async function tryRecoverAuth(): Promise<boolean> {
  const jwt = getJwt();
  if (!jwt) return false;

  const jwtHeaders = { Authorization: `Bearer ${jwt}` };

  // Verify JWT still works
  const { error: verifyError } = await client.GET("/builder/agents/me", {
    headers: jwtHeaders,
  });
  if (verifyError) return false;

  // Generate fresh amk_ key
  const { data, error } = await client.POST("/builder/agents/me/api-keys", {
    headers: jwtHeaders,
  });
  // Server returns "token" per spec, but older versions return "key"
  const newToken =
    ((data as Record<string, unknown> | undefined)?.token as
      | string
      | undefined) ??
    ((data as Record<string, unknown> | undefined)?.key as string | undefined);
  if (error || !newToken) return false;

  // Save new key, preserving other creds
  const creds = loadCredentials();
  if (creds) {
    saveCredentials({ ...creds, token: newToken });
  }

  return true;
}
