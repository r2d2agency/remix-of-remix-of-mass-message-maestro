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
  is_blacklisted?: boolean;
  blacklist_reason?: string;
  blacklisted_at?: string;
  billing_paused?: boolean;
  billing_paused_until?: string;
  billing_paused_reason?: string;
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

interface AsaasSettings {
  daily_message_limit_per_customer: number;
  billing_paused: boolean;
  billing_paused_until: string | null;
  billing_paused_reason: string | null;
  critical_alert_threshold: number;
  critical_alert_days: number;
  alert_email: string | null;
  alert_whatsapp: string | null;
  alert_connection_id: string | null;
}

interface BillingAlert {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  alert_type: string;
  title: string;
  description: string;
  total_overdue: number;
  days_overdue: number;
  is_read: boolean;
  is_resolved: boolean;
  created_at: string;
}

interface DashboardData {
  general: {
    pending_count: number;
    overdue_count: number;
    paid_count: number;
    pending_value: number;
    overdue_value: number;
    paid_value: number;
  };
  paymentsByMonth: Array<{
    month: string;
    paid_count: number;
    overdue_count: number;
    pending_count: number;
    paid_value: number;
    overdue_value: number;
  }>;
  notifications: {
    total: number;
    sent: number;
    failed: number;
    sent_today: number;
    sent_week: number;
  };
  recovery: {
    notified_payments: number;
    recovered_payments: number;
  };
  topDefaulters: Array<{
    name: string;
    phone: string;
    email: string;
    overdue_count: number;
    total_overdue: number;
  }>;
  overdueByDays: Array<{
    range: string;
    count: number;
    value: number;
  }>;
}

interface ReportItem {
  cliente: string;
  telefone: string;
  email: string;
  documento: string;
  valor: number;
  vencimento: string;
  status: string;
  tipo_cobranca: string;
  descricao: string;
  dias_atraso: number;
  link_fatura: string;
  notificacoes_enviadas: number;
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

  const getCustomers = useCallback(async (showBlacklisted = false): Promise<AsaasCustomer[]> => {
    if (!organizationId) return [];
    
    try {
      const params = showBlacklisted ? '?show_blacklisted=true' : '';
      return await api<AsaasCustomer[]>(`/api/asaas/customers/${organizationId}${params}`);
    } catch (err) {
      console.error('Get customers error:', err);
      return [];
    }
  }, [organizationId]);

  const updateCustomer = useCallback(async (customerId: string, data: Partial<AsaasCustomer>) => {
    if (!organizationId) return null;
    
    setLoading(true);
    setError(null);
    
    try {
      const result = await api<AsaasCustomer>(`/api/asaas/customers/${organizationId}/${customerId}`, {
        method: 'PATCH',
        body: data
      });
      return result;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  const getSettings = useCallback(async (): Promise<AsaasSettings | null> => {
    if (!organizationId) return null;
    
    try {
      return await api<AsaasSettings>(`/api/asaas/settings/${organizationId}`);
    } catch (err) {
      console.error('Get settings error:', err);
      return null;
    }
  }, [organizationId]);

  const updateSettings = useCallback(async (settings: Partial<AsaasSettings>) => {
    if (!organizationId) return null;
    
    setLoading(true);
    setError(null);
    
    try {
      const result = await api<AsaasSettings>(`/api/asaas/settings/${organizationId}`, {
        method: 'PATCH',
        body: settings
      });
      return result;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  const getAlerts = useCallback(async (unreadOnly = false): Promise<BillingAlert[]> => {
    if (!organizationId) return [];
    
    try {
      const params = unreadOnly ? '?unread_only=true' : '';
      return await api<BillingAlert[]>(`/api/asaas/alerts/${organizationId}${params}`);
    } catch (err) {
      console.error('Get alerts error:', err);
      return [];
    }
  }, [organizationId]);

  const updateAlert = useCallback(async (alertId: string, data: { is_read?: boolean; is_resolved?: boolean }) => {
    if (!organizationId) return null;
    
    try {
      return await api<BillingAlert>(`/api/asaas/alerts/${organizationId}/${alertId}`, {
        method: 'PATCH',
        body: data
      });
    } catch (err: any) {
      console.error('Update alert error:', err);
      return null;
    }
  }, [organizationId]);

  const generateAlerts = useCallback(async () => {
    if (!organizationId) return null;
    
    try {
      return await api<{ alerts_created: number }>(`/api/asaas/alerts/generate/${organizationId}`, {
        method: 'POST'
      });
    } catch (err: any) {
      console.error('Generate alerts error:', err);
      return null;
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

  const getDashboard = useCallback(async (): Promise<DashboardData | null> => {
    if (!organizationId) return null;
    
    try {
      return await api<DashboardData>(`/api/asaas/dashboard/${organizationId}`);
    } catch (err) {
      console.error('Get dashboard error:', err);
      return null;
    }
  }, [organizationId]);

  const getReport = useCallback(async (filters?: {
    status?: string;
    min_days_overdue?: number;
    max_days_overdue?: number;
  }): Promise<ReportItem[]> => {
    if (!organizationId) return [];
    
    try {
      const params = new URLSearchParams();
      if (filters?.status) params.set('status', filters.status);
      if (filters?.min_days_overdue) params.set('min_days_overdue', String(filters.min_days_overdue));
      if (filters?.max_days_overdue) params.set('max_days_overdue', String(filters.max_days_overdue));
      
      const queryString = params.toString() ? `?${params.toString()}` : '';
      return await api<ReportItem[]>(`/api/asaas/report/${organizationId}${queryString}`);
    } catch (err) {
      console.error('Get report error:', err);
      return [];
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
    updateCustomer,
    getRules,
    createRule,
    updateRule,
    deleteRule,
    getDashboard,
    getReport,
    getSettings,
    updateSettings,
    getAlerts,
    updateAlert,
    generateAlerts
  };
}
