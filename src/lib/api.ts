export const API_URL = import.meta.env.VITE_API_URL || 'https://whastsale-backend.exf0ty.easypanel.host';

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  auth?: boolean;
}

export const api = async <T>(endpoint: string, options: ApiOptions = {}): Promise<T> => {
  const { method = 'GET', body, auth = true } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (auth) {
    const token = localStorage.getItem('auth_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const contentType = response.headers.get('content-type') || '';
  let data: any = null;

  if (contentType.includes('application/json')) {
    data = await response.json().catch(() => null);
  } else {
    const text = await response.text().catch(() => '');
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }

  if (!response.ok) {
    throw new Error(data?.error || data?.message || `Erro na requisição (${response.status})`);
  }

  return data as T;
};

// Auth helpers
export const authApi = {
  login: (email: string, password: string) =>
    api<{ user: { id: string; email: string; name: string }; token: string }>(
      '/api/auth/login',
      { method: 'POST', body: { email, password }, auth: false }
    ),

  register: (email: string, password: string, name: string) =>
    api<{ user: { id: string; email: string; name: string }; token: string }>(
      '/api/auth/register',
      { method: 'POST', body: { email, password, name }, auth: false }
    ),

  getMe: () =>
    api<{ user: { id: string; email: string; name: string } }>('/api/auth/me'),
};

export const setAuthToken = (token: string) => {
  localStorage.setItem('auth_token', token);
};

export const clearAuthToken = () => {
  localStorage.removeItem('auth_token');
};

export const getAuthToken = () => {
  return localStorage.getItem('auth_token');
};
