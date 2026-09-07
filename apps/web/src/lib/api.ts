import type { AuthUserDto, LoginResponse } from '@plataforma/shared';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    /** Cuerpo completo de la respuesta: algunos errores traen datos para mostrar. */
    public body?: unknown,
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

  const ac = new AbortController();
  const timer = window.setTimeout(() => ac.abort(), 12000);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      signal: options.signal ?? ac.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new ApiError(
        'La API no responde. Ejecutá abrir-cuadratura.bat y recargá.',
        0,
      );
    }
    throw new ApiError(
      'No hay conexión con la API. Ejecutá abrir-cuadratura.bat y recargá.',
      0,
    );
  } finally {
    window.clearTimeout(timer);
  }
  if (!res.ok) {
    let message = res.statusText;
    let body: unknown;
    try {
      body = await res.json();
      const b = body as { message?: unknown; error?: unknown };
      message = String(b.message || b.error || message);
      if (Array.isArray(b.message)) message = b.message.join(', ');
    } catch {
      /* ignore */
    }
    throw new ApiError(String(message), res.status, body);
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
