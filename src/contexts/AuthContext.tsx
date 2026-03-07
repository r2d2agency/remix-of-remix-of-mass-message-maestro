import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authApi, setAuthToken, clearAuthToken, getAuthToken } from '@/lib/api';
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

    try {
      const { user } = await authApi.getMe();
      setUser(user);
    } catch {
      setUser(null);
      clearAuthToken();
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

      try {
        const { user } = await authApi.getMe();
        setUser(user);
      } catch (error) {
        const msg = error instanceof Error ? error.message : '';
        if (msg.includes('401') || msg.includes('Token') || msg.includes('inválido')) {
          clearAuthToken();
        }
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

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
  useEffect(() => {
    if (user?.theme_config) {
      applyOrgTheme(user.theme_config);
    } else {
      clearOrgTheme();
    }
  }, [user?.theme_config]);

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
