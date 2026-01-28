import { useState, useCallback } from 'react';
import { api } from '@/lib/api';

interface NotificationStats {
  sent_count: number;
  failed_count: number;
  pending_count: number;
  sent_today: number;
  sent_week: number;
  sent_month: number;
}

interface NotificationHistory {
  id: string;
  rule_name: string;
  customer_name: string;
  phone: string;
  message: string;
  status: 'pending' | 'sent' | 'failed';
  sent_at: string | null;
  created_at: string;
  payment_value: number;
  due_date: string;
}

interface TriggerResult {
  success: boolean;
  sent: number;
  failed: number;
  total: number;
}

export function useNotifications(organizationId: string | null) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getStats = useCallback(async (): Promise<NotificationStats | null> => {
    if (!organizationId) return null;
    
    try {
      return await api<NotificationStats>(`/api/notifications/stats/${organizationId}`);
    } catch (err) {
      console.error('Get stats error:', err);
      return null;
    }
  }, [organizationId]);

  const getHistory = useCallback(async (filters?: {
    status?: string;
    from_date?: string;
    to_date?: string;
    limit?: number;
  }): Promise<NotificationHistory[]> => {
    if (!organizationId) return [];
    
    try {
      const params = new URLSearchParams();
      if (filters?.status) params.set('status', filters.status);
      if (filters?.from_date) params.set('from_date', filters.from_date);
      if (filters?.to_date) params.set('to_date', filters.to_date);
      if (filters?.limit) params.set('limit', String(filters.limit));
      
      const queryString = params.toString() ? `?${params.toString()}` : '';
      return await api<NotificationHistory[]>(`/api/notifications/history/${organizationId}${queryString}`);
    } catch (err) {
      console.error('Get history error:', err);
      return [];
    }
  }, [organizationId]);

  const triggerRule = useCallback(async (ruleId: string): Promise<TriggerResult | null> => {
    if (!organizationId) return null;
    
    setLoading(true);
    setError(null);
    
    try {
      const result = await api<TriggerResult>(`/api/notifications/trigger/${organizationId}/${ruleId}`, {
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

  const retryNotifications = useCallback(async (notificationIds: string[]): Promise<{ retried: number; failed: number } | null> => {
    if (!organizationId) return null;
    
    setLoading(true);
    setError(null);
    
    try {
      const result = await api<{ success: boolean; retried: number; failed: number }>(
        `/api/notifications/retry/${organizationId}`,
        {
          method: 'POST',
          body: { notification_ids: notificationIds }
        }
      );
      return { retried: result.retried, failed: result.failed };
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  const getQueue = useCallback(async (days: number = 7): Promise<any> => {
    if (!organizationId) return null;
    
    try {
      return await api<any>(`/api/notifications/queue/${organizationId}?days=${days}`);
    } catch (err) {
      console.error('Get queue error:', err);
      return null;
    }
  }, [organizationId]);

  const getLogs = useCallback(async (filters?: {
    status?: string;
    from_date?: string;
    to_date?: string;
    limit?: number;
  }): Promise<any> => {
    if (!organizationId) return null;
    
    try {
      const params = new URLSearchParams();
      if (filters?.status) params.set('status', filters.status);
      if (filters?.from_date) params.set('from_date', filters.from_date);
      if (filters?.to_date) params.set('to_date', filters.to_date);
      if (filters?.limit) params.set('limit', String(filters.limit));
      
      const queryString = params.toString() ? `?${params.toString()}` : '';
      return await api<any>(`/api/notifications/logs/${organizationId}${queryString}`);
    } catch (err) {
      console.error('Get logs error:', err);
      return null;
    }
  }, [organizationId]);

  return {
    loading,
    error,
    getStats,
    getHistory,
    getQueue,
    getLogs,
    triggerRule,
    retryNotifications
  };
}
