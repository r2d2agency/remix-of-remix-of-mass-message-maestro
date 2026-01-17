import { useState, useCallback } from 'react';
import { api } from '@/lib/api';

export interface Campaign {
  id: string;
  user_id: string;
  name: string;
  connection_id: string | null;
  list_id: string | null;
  message_id: string | null;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'cancelled';
  scheduled_at: string | null;
  min_delay: number;
  max_delay: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
  updated_at: string;
  // Joined fields
  list_name?: string;
  message_name?: string;
  connection_name?: string;
}

export interface CampaignStats {
  total: number;
  sent: number;
  failed: number;
  pending: number;
}

export interface CreateCampaignData {
  name: string;
  connection_id: string;
  list_id: string;
  message_id: string;
  scheduled_at?: string;
  min_delay?: number;
  max_delay?: number;
}

export const useCampaigns = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getCampaigns = useCallback(async (): Promise<Campaign[]> => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<Campaign[]>('/api/campaigns');
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao buscar campanhas';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const createCampaign = useCallback(async (data: CreateCampaignData): Promise<Campaign> => {
    setLoading(true);
    setError(null);
    try {
      const result = await api<Campaign>('/api/campaigns', {
        method: 'POST',
        body: data,
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao criar campanha';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateStatus = useCallback(async (id: string, status: Campaign['status']): Promise<Campaign> => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<Campaign>(`/api/campaigns/${id}/status`, {
        method: 'PATCH',
        body: { status },
      });
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao atualizar status';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const getCampaignStats = useCallback(async (id: string): Promise<{ campaign: Campaign; stats: CampaignStats }> => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<{ campaign: Campaign; stats: CampaignStats }>(`/api/campaigns/${id}/stats`);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao buscar estatísticas';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteCampaign = useCallback(async (id: string): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      await api(`/api/campaigns/${id}`, { method: 'DELETE' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao deletar campanha';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    getCampaigns,
    createCampaign,
    updateStatus,
    getCampaignStats,
    deleteCampaign,
  };
};
