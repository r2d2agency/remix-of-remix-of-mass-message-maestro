import { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface AsaasIntegration {
  id: string;
  organization_id: string;
  environment: 'sandbox' | 'production';
  is_active: boolean;
  last_sync_at: string | null;
  webhook_url?: string;
}

interface AsaasPayment {
  id: string;
  asaas_id: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  value: number;
  due_date: string;
  billing_type: string;
  status: string;
  payment_link: string;
  invoice_url: string;
  bank_slip_url: string;
}

interface AsaasCustomer {
  id: string;
  asaas_id: string;
  name: string;
  email: string;
  phone: string;
  pending_count: number;
  overdue_count: number;
  total_due: number;
}

interface NotificationRule {
  id: string;
  name: string;
  trigger_type: 'before_due' | 'on_due' | 'after_due';
  days_offset: number;
  max_days_overdue: number | null;
  message_template: string;
  send_time: string;
  connection_id: string | null;
  connection_name: string | null;
  is_active: boolean;
}

export function useAsaas(organizationId: string | null) {
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  const getIntegration = useCallback(async (): Promise<AsaasIntegration | null> => {
    if (!organizationId) return null;
    
    try {
      const response = await fetch(`${API_URL}/api/asaas/integration/${organizationId}`, { headers });
      if (!response.ok) throw new Error('Erro ao buscar integração');
      return response.json();
    } catch (err) {
      console.error('Get integration error:', err);
      return null;
    }
  }, [organizationId, token]);

  const configureIntegration = useCallback(async (apiKey: string, environment: 'sandbox' | 'production') => {
    if (!organizationId) return null;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_URL}/api/asaas/integration/${organizationId}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ api_key: apiKey, environment })
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Erro ao configurar integração');
      }
      
      return response.json();
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [organizationId, token]);

  const syncPayments = useCallback(async () => {
    if (!organizationId) return null;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_URL}/api/asaas/sync/${organizationId}`, {
        method: 'POST',
        headers
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Erro ao sincronizar');
      }
      
      return response.json();
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [organizationId, token]);

  const getPayments = useCallback(async (filters?: { status?: string; due_date_start?: string; due_date_end?: string }): Promise<AsaasPayment[]> => {
    if (!organizationId) return [];
    
    try {
      const params = new URLSearchParams();
      if (filters?.status) params.set('status', filters.status);
      if (filters?.due_date_start) params.set('due_date_start', filters.due_date_start);
      if (filters?.due_date_end) params.set('due_date_end', filters.due_date_end);
      
      const response = await fetch(`${API_URL}/api/asaas/payments/${organizationId}?${params}`, { headers });
      if (!response.ok) throw new Error('Erro ao buscar cobranças');
      return response.json();
    } catch (err) {
      console.error('Get payments error:', err);
      return [];
    }
  }, [organizationId, token]);

  const getCustomers = useCallback(async (): Promise<AsaasCustomer[]> => {
    if (!organizationId) return [];
    
    try {
      const response = await fetch(`${API_URL}/api/asaas/customers/${organizationId}`, { headers });
      if (!response.ok) throw new Error('Erro ao buscar clientes');
      return response.json();
    } catch (err) {
      console.error('Get customers error:', err);
      return [];
    }
  }, [organizationId, token]);

  const getRules = useCallback(async (): Promise<NotificationRule[]> => {
    if (!organizationId) return [];
    
    try {
      const response = await fetch(`${API_URL}/api/asaas/rules/${organizationId}`, { headers });
      if (!response.ok) throw new Error('Erro ao buscar regras');
      return response.json();
    } catch (err) {
      console.error('Get rules error:', err);
      return [];
    }
  }, [organizationId, token]);

  const createRule = useCallback(async (rule: Partial<NotificationRule>) => {
    if (!organizationId) return null;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_URL}/api/asaas/rules/${organizationId}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(rule)
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Erro ao criar regra');
      }
      
      return response.json();
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [organizationId, token]);

  const updateRule = useCallback(async (ruleId: string, rule: Partial<NotificationRule>) => {
    if (!organizationId) return null;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_URL}/api/asaas/rules/${organizationId}/${ruleId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(rule)
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Erro ao atualizar regra');
      }
      
      return response.json();
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [organizationId, token]);

  const deleteRule = useCallback(async (ruleId: string) => {
    if (!organizationId) return false;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_URL}/api/asaas/rules/${organizationId}/${ruleId}`, {
        method: 'DELETE',
        headers
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Erro ao excluir regra');
      }
      
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [organizationId, token]);

  return {
    loading,
    error,
    getIntegration,
    configureIntegration,
    syncPayments,
    getPayments,
    getCustomers,
    getRules,
    createRule,
    updateRule,
    deleteRule
  };
}
