import React, { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { authApi, setAuthToken, clearAuthToken, getAuthToken, refreshAuthToken } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

// Apply organization theme CSS variables
function applyOrgTheme(config: OrgThemeConfig) {
  const root = document.documentElement;
  const isDark = root.classList.contains('dark');
  const vars = isDark ? config.dark : config.light;
  if (!vars) return;
  
  // Create or update the org-theme style element
  let style = document.getElementById('org-theme-vars') as HTMLStyleElement;
  if (!style) {
    style = document.createElement('style');
    style.id = 'org-theme-vars';
    document.head.appendChild(style);
  }

  const lightVars = config.light ? Object.entries(config.light).map(([k, v]) => `--${k}: ${v};`).join('\n    ') : '';
  const darkVars = config.dark ? Object.entries(config.dark).map(([k, v]) => `--${k}: ${v};`).join('\n    ') : '';

  style.textContent = `
  :root, .light {
    ${lightVars}
  }
  .dark {
    ${darkVars}
  }`;
}

function clearOrgTheme() {
  const style = document.getElementById('org-theme-vars');
  if (style) style.remove();
}

interface ModulesEnabled {
  campaigns: boolean;
  billing: boolean;
  groups: boolean;
  scheduled_messages: boolean;
  chatbots: boolean;
  chat: boolean;
  crm: boolean;
  ai_agents: boolean;
  group_secretary: boolean;
  ghost: boolean;
  aasp: boolean;
  lead_gleego: boolean;
}

export interface FeaturePermissions {
  [key: string]: boolean;
}

export interface OrgThemeConfig {
  preset?: string;
  light?: Record<string, string>;
  dark?: Record<string, string>;
  custom_themes?: Array<{
    id: string;
    name: string;
    light: Record<string, string>;
    dark: Record<string, string>;
    preview: { primary: string; accent: string; bg: string };
  }>;
}

interface User {
  id: string;
  email: string;
  name: string;
  role?: string;
  organization_id?: string;
  modules_enabled?: ModulesEnabled;
  feature_permissions?: FeaturePermissions | null;
  theme_config?: OrgThemeConfig | null;
  organization_logo?: string | null;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  modulesEnabled: ModulesEnabled;
  featurePermissions: FeaturePermissions | null;
  hasFeatureAccess: (featureKey: string) => boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string, planId?: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const USER_CACHE_KEY = 'cached_user';

function getCachedUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function parseJwtPayload(token: string): { exp?: number } | null {
  try {
    const payloadPart = token.split('.')[1];
    if (!payloadPart) return null;
    const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

function isJwtExpired(token: string): boolean {
  const payload = parseJwtPayload(token);
  if (!payload?.exp) return false;
  return payload.exp * 1000 <= Date.now();
}

function shouldClearSession(error: unknown): boolean {
  const msg = error instanceof Error ? error.message.toLowerCase() : '';
  return (
    msg.includes('401') ||
    msg.includes('token inválido') ||
    msg.includes('token nao fornecido') ||
    msg.includes('token não fornecido') ||
    msg.includes('jwt expired') ||
    msg.includes('unauthorized')
  );
}

function setCachedUser(user: User | null) {
  if (user) {
    localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(USER_CACHE_KEY);
  }
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUserState] = useState<User | null>(getCachedUser);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const setUser = (u: User | null) => {
    setUserState(u);
    setCachedUser(u);
  };

  const defaultModules: ModulesEnabled = {
    campaigns: true,
    billing: true,
    groups: true,
    scheduled_messages: true,
    chatbots: true,
    chat: true,
    crm: true,
    ai_agents: true,
    group_secretary: false,
    ghost: true,
    aasp: false,
    lead_gleego: false,
  };

  const refreshUser = async () => {
    const token = getAuthToken();
    if (!token) {
      setUser(null);
      return;
    }

    if (isJwtExpired(token)) {
      clearAuthToken();
      setUser(null);
      return;
    }

    try {
      const { user } = await authApi.getMe();
      setUser(user);
    } catch (error) {
      if (shouldClearSession(error)) {
        clearAuthToken();
      }
      setUser(null);
    }
  };

  useEffect(() => {
    const checkAuth = async () => {
      const token = getAuthToken();

      if (!token) {
        setUser(null);
        setIsLoading(false);
        return;
      }

      if (isJwtExpired(token)) {
        clearAuthToken();
        setUser(null);
        setIsLoading(false);
        return;
      }

      try {
        const { user } = await authApi.getMe();
        setUser(user);
      } catch (error) {
        if (shouldClearSession(error)) {
          clearAuthToken();
        }
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  // Auto-refresh token before it expires
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleTokenRefresh = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }

    const token = getAuthToken();
    if (!token) return;

    const payload = parseJwtPayload(token);
    if (!payload?.exp) return;

    // Refresh 5 minutes before expiry (or immediately if less than 1 min left)
    const msUntilExpiry = payload.exp * 1000 - Date.now();
    const refreshIn = Math.max(msUntilExpiry - 5 * 60 * 1000, 30_000); // at least 30s

    refreshTimerRef.current = setTimeout(async () => {
      const newToken = await refreshAuthToken();
      if (newToken) {
        console.log('[Auth] Token refreshed automatically');
        scheduleTokenRefresh(); // schedule next refresh
      } else {
        // Refresh failed – force logout
        clearAuthToken();
        setUser(null);
      }
    }, refreshIn);
  }, []);

  // Start refresh timer when user is authenticated
  useEffect(() => {
    if (user) {
      scheduleTokenRefresh();
    }
    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, [user, scheduleTokenRefresh]);

  const login = async (email: string, password: string) => {
    const { user, token } = await authApi.login(email, password);
    setAuthToken(token);
    setUser(user);
    toast({ title: 'Login realizado com sucesso!' });
  };

  const register = async (email: string, password: string, name: string, planId?: string) => {
    const { user, token } = await authApi.register(email, password, name, planId);
    setAuthToken(token);
    setUser(user);
    toast({ title: 'Conta criada com sucesso!' });
  };

  const logout = () => {
    clearAuthToken();
    setUser(null);
    setCachedUser(null);
    toast({ title: 'Logout realizado' });
  };

  // Apply org theme when user changes
  const themeConfigJson = user?.theme_config ? JSON.stringify(user.theme_config) : null;
  useEffect(() => {
    if (user?.theme_config) {
      applyOrgTheme(user.theme_config);
    } else {
      clearOrgTheme();
    }
  }, [themeConfigJson]);

  const modulesEnabled = user?.modules_enabled || defaultModules;
  const featurePermissions = user?.feature_permissions || null;

  // Check if user has access to a specific feature
  // If no template is assigned (null), user has full access based on role
  // If template assigned, check the permission key
  const hasFeatureAccess = (featureKey: string): boolean => {
    if (!featurePermissions) return true; // No template = full access (controlled by role)
    return featurePermissions[featureKey] !== false; // Default to true if key not in template
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        modulesEnabled,
        featurePermissions,
        hasFeatureAccess,
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
