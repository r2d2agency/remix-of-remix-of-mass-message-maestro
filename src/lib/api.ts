export const API_URL = import.meta.env.VITE_API_URL || '';

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
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

  // Read body as text first for safer parsing
  const rawText = await response.text().catch(() => '');

  if (contentType.includes('application/json') || rawText.trim().startsWith('{') || rawText.trim().startsWith('[')) {
    try {
      data = JSON.parse(rawText);
    } catch {
      data = { raw: rawText };
    }
  } else {
    // Got HTML or unexpected format – log for debugging
    if (rawText.trim().startsWith('<!') || rawText.includes('<html')) {
      console.error('[api] Got HTML instead of JSON', {
        url: `${API_URL}${endpoint}`,
        status: response.status,
        preview: rawText.substring(0, 300),
      });
    }
    data = { raw: rawText };
  }

  if (!response.ok) {
    const baseMsg = data?.error || data?.message || `Erro na requisição (${response.status})`;
    const details = data?.details ? `: ${data.details}` : '';
    // eslint-disable-next-line no-console
    console.error('[api] request failed', {
      url: `${API_URL}${endpoint}`,
      status: response.status,
      contentType,
      body,
      response: data,
    });
    throw new Error(`${baseMsg}${details}`);
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

  register: (email: string, password: string, name: string, plan_id?: string) =>
    api<{ user: { id: string; email: string; name: string }; token: string }>(
      '/api/auth/register',
      { method: 'POST', body: { email, password, name, plan_id }, auth: false }
    ),

  getMe: () =>
    api<{ user: { id: string; email: string; name: string } }>('/api/auth/me'),

  getSignupPlans: () =>
    api<Array<{
      id: string;
      name: string;
      description: string | null;
      max_connections: number;
      max_monthly_messages: number;
      max_users: number;
      price: number;
      billing_period: string;
      trial_days: number;
      has_chat: boolean;
      has_campaigns: boolean;
      has_asaas_integration: boolean;
    }>>('/api/auth/plans', { auth: false }),
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
