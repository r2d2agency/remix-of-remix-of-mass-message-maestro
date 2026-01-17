import { useState, useCallback } from 'react';
import { api } from '@/lib/api';

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getIntegration = useCallback(async (): Promise<AsaasIntegration | null> => {
    if (!organizationId) return null;
    
    try {
      return await api<AsaasIntegration | null>(`/api/asaas/integration/${organizationId}`);
    } catch (err) {
      console.error('Get integration error:', err);
      return null;
    }
  }, [organizationId]);

  const configureIntegration = useCallback(async (apiKey: string, environment: 'sandbox' | 'production') => {
    if (!organizationId) return null;
    
    setLoading(true);
    setError(null);
    
    try {
      const result = await api<AsaasIntegration>(`/api/asaas/integration/${organizationId}`, {
        method: 'POST',
        body: { api_key: apiKey, environment }
      });
      return result;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  const syncPayments = useCallback(async () => {
    if (!organizationId) return null;
    
    setLoading(true);
    setError(null);
    
    try {
      const result = await api<{ customers_synced: number; payments_synced: number }>(`/api/asaas/sync/${organizationId}`, {
        method: 'POST'
      });
      return result;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  const getPayments = useCallback(async (filters?: { status?: string; due_date_start?: string; due_date_end?: string }): Promise<AsaasPayment[]> => {
    if (!organizationId) return [];
    
    try {
      const params = new URLSearchParams();
      if (filters?.status) params.set('status', filters.status);
      if (filters?.due_date_start) params.set('due_date_start', filters.due_date_start);
      if (filters?.due_date_end) params.set('due_date_end', filters.due_date_end);
      
      const queryString = params.toString() ? `?${params.toString()}` : '';
      return await api<AsaasPayment[]>(`/api/asaas/payments/${organizationId}${queryString}`);
    } catch (err) {
      console.error('Get payments error:', err);
      return [];
    }
  }, [organizationId]);

  const getCustomers = useCallback(async (): Promise<AsaasCustomer[]> => {
    if (!organizationId) return [];
    
    try {
      return await api<AsaasCustomer[]>(`/api/asaas/customers/${organizationId}`);
    } catch (err) {
      console.error('Get customers error:', err);
      return [];
    }
  }, [organizationId]);

  const getRules = useCallback(async (): Promise<NotificationRule[]> => {
    if (!organizationId) return [];
    
    try {
      return await api<NotificationRule[]>(`/api/asaas/rules/${organizationId}`);
    } catch (err) {
      console.error('Get rules error:', err);
      return [];
    }
  }, [organizationId]);

  const createRule = useCallback(async (rule: Partial<NotificationRule>) => {
    if (!organizationId) return null;
    
    setLoading(true);
    setError(null);
    
    try {
      const result = await api<NotificationRule>(`/api/asaas/rules/${organizationId}`, {
        method: 'POST',
        body: rule
      });
      return result;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  const updateRule = useCallback(async (ruleId: string, rule: Partial<NotificationRule>) => {
    if (!organizationId) return null;
    
    setLoading(true);
    setError(null);
    
    try {
      const result = await api<NotificationRule>(`/api/asaas/rules/${organizationId}/${ruleId}`, {
        method: 'PATCH',
        body: rule
      });
      return result;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  const deleteRule = useCallback(async (ruleId: string) => {
    if (!organizationId) return false;
    
    setLoading(true);
    setError(null);
    
    try {
      await api(`/api/asaas/rules/${organizationId}/${ruleId}`, {
        method: 'DELETE'
      });
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

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
