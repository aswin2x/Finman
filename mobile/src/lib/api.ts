/**
 * HTTP client.
 *
 * Holds the access token in memory, persists the refresh token in secure
 * storage, and transparently refreshes an expired session once per request.
 * Concurrent 401s share a single refresh so the server is not stampeded.
 */
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { TokenResponse } from './types';

const ACCESS_KEY = 'finman.access';
const REFRESH_KEY = 'finman.refresh';

/** Resolves the API host: explicit config wins, else the Metro host, else localhost. */
function resolveBaseUrl(): string {
  const configured =
    (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ??
    process.env.EXPO_PUBLIC_API_URL;
  if (configured) return configured.replace(/\/$/, '');

  const hostUri = Constants.expoConfig?.hostUri ?? (Constants as any).manifest2?.extra?.expoGo?.debuggerHost;
  if (hostUri) {
    const host = String(hostUri).split(':')[0];
    return `http://${host}:8000`;
  }
  return Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://localhost:8000';
}

export const BASE_URL = resolveBaseUrl();
const API = `${BASE_URL}/api/v1`;

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }

  /** True when retrying later could plausibly succeed. */
  get isNetwork(): boolean {
    return this.status === 0;
  }
}

let accessToken: string | null = null;
let refreshPromise: Promise<boolean> | null = null;
let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

const secure = {
  async get(key: string): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  async set(key: string, value: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      // Storage can be unavailable; the in-memory token still works this session.
    }
  },
  async remove(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      /* no-op */
    }
  },
};

export async function saveSession(tokens: TokenResponse): Promise<void> {
  accessToken = tokens.access_token;
  await Promise.all([
    secure.set(ACCESS_KEY, tokens.access_token),
    secure.set(REFRESH_KEY, tokens.refresh_token),
  ]);
}

export async function restoreSession(): Promise<boolean> {
  const stored = await secure.get(ACCESS_KEY);
  if (stored) accessToken = stored;
  return Boolean(stored);
}

export async function clearSession(): Promise<void> {
  accessToken = null;
  await Promise.all([secure.remove(ACCESS_KEY), secure.remove(REFRESH_KEY)]);
}

export function hasSession(): boolean {
  return accessToken !== null;
}

async function refreshSession(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const refreshToken = await secure.get(REFRESH_KEY);
    if (!refreshToken) return false;
    try {
      const response = await fetch(`${API}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!response.ok) return false;
      await saveSession((await response.json()) as TokenResponse);
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

async function readError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { msg?: string; loc?: string[] };
      const field = first.loc?.slice(-1)[0];
      return field ? `${field}: ${first.msg ?? 'is invalid'}` : (first.msg ?? 'Invalid request');
    }
  } catch {
    /* fall through */
  }
  if (response.status >= 500) return 'The server had a problem. Please try again.';
  return `Request failed (${response.status})`;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  auth?: boolean;
  raw?: boolean;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}, isRetry = false): Promise<T> {
  const { method = 'GET', body, auth = true, raw = false, signal } = options;

  const headers: Record<string, string> = {};
  if (body !== undefined && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      method,
      headers,
      signal,
      body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error;
    throw new ApiError(0, 'No connection. Showing the last saved data.');
  }

  if (response.status === 401 && auth && !isRetry) {
    if (await refreshSession()) return request<T>(path, options, true);
    await clearSession();
    onUnauthorized?.();
    throw new ApiError(401, 'Your session has expired. Please sign in again.');
  }

  if (!response.ok) throw new ApiError(response.status, await readError(response));
  if (raw) return response as unknown as T;
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Builds a query string, repeating keys for array values. */
export function query(params: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      value.forEach((entry) => parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(entry))}`));
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

export const http = {
  get: <T,>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T,>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T,>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  del: <T,>(path: string, body?: unknown) => request<T>(path, { method: 'DELETE', body }),
  postPublic: <T,>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body, auth: false }),
  postForm: <T,>(path: string, form: FormData) => request<T>(path, { method: 'POST', body: form }),
  raw: (path: string) => request<Response>(path, { raw: true }),
  url: (path: string) => `${API}${path}`,
  token: () => accessToken,
};
