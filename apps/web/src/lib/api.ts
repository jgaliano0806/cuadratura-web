import type { AuthUserDto, LoginResponse } from '@plataforma/shared';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

function token(): string | null {
  return localStorage.getItem('sv_token');
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const t = token();
  if (t) headers.set('Authorization', `Bearer ${t}`);

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.message || body.error || message;
      if (Array.isArray(message)) message = message.join(', ');
    } catch {
      /* ignore */
    }
    throw new ApiError(String(message), res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function login(username: string, password: string) {
  return api<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export function me() {
  return api<AuthUserDto>('/auth/me');
}
