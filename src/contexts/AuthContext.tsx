import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authApi, setAuthToken, clearAuthToken, getAuthToken } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

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

interface User {
  id: string;
  email: string;
  name: string;
  role?: string;
  organization_id?: string;
  modules_enabled?: ModulesEnabled;
  feature_permissions?: FeaturePermissions | null;
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

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

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
    if (token) {
      try {
        const { user } = await authApi.getMe();
        setUser(user);
      } catch {
        // Ignore errors on refresh
      }
    }
  };

  useEffect(() => {
    const checkAuth = async () => {
      const token = getAuthToken();
      if (token) {
        try {
          const { user } = await authApi.getMe();
          setUser(user);
        } catch (error) {
          // Only clear token on auth errors (401), not network errors
          const msg = error instanceof Error ? error.message : '';
          if (msg.includes('401') || msg.includes('Token') || msg.includes('inválido')) {
            clearAuthToken();
          }
        }
      }
      setIsLoading(false);
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
    toast({ title: 'Logout realizado' });
  };

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
