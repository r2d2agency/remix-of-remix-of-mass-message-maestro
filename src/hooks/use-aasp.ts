import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface AASPConfig {
  id: string;
  organization_id: string;
  api_token_masked: string;
  notify_phone: string | null;
  connection_id: string | null;
  is_active: boolean;
  last_sync_at: string | null;
  created_at: string;
}

export interface AASPIntimacao {
  id: string;
  organization_id: string;
  external_id: string;
  jornal: string | null;
  data_publicacao: string | null;
  data_disponibilizacao: string | null;
  caderno: string | null;
  pagina: string | null;
  comarca: string | null;
  vara: string | null;
  processo: string | null;
  tipo: string | null;
  conteudo: string | null;
  partes: string | null;
  advogados: string | null;
  read: boolean;
  created_at: string;
}

export function useAASPConfig() {
  const queryClient = useQueryClient();

  const configQuery = useQuery({
    queryKey: ['aasp-config'],
    queryFn: () => api<AASPConfig | null>('/api/aasp/config'),
  });

  const saveConfig = useMutation({
    mutationFn: (data: { api_token: string; notify_phone?: string; connection_id?: string; is_active?: boolean }) =>
      api<AASPConfig>('/api/aasp/config', { method: 'POST', body: data }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['aasp-config'] }),
  });

  return { config: configQuery.data, isLoading: configQuery.isLoading, saveConfig };
}

export function useAASPIntimacoes(page = 1, unreadOnly = false) {
  return useQuery({
    queryKey: ['aasp-intimacoes', page, unreadOnly],
    queryFn: () =>
      api<{ data: AASPIntimacao[]; total: number; page: number; limit: number }>(
        `/api/aasp/intimacoes?page=${page}&limit=50${unreadOnly ? '&unread_only=true' : ''}`
      ),
  });
}

export function useAASPUnreadCount() {
  return useQuery({
    queryKey: ['aasp-unread-count'],
    queryFn: () => api<{ count: number }>('/api/aasp/intimacoes/unread-count'),
    refetchInterval: 60000, // refresh every minute
  });
}

export function useAASPActions() {
  const queryClient = useQueryClient();

  const markRead = useMutation({
    mutationFn: (ids?: string[]) =>
      api('/api/aasp/intimacoes/mark-read', { method: 'POST', body: { ids } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aasp-intimacoes'] });
      queryClient.invalidateQueries({ queryKey: ['aasp-unread-count'] });
    },
  });

  const syncNow = useMutation({
    mutationFn: () => api<{ success: boolean; newCount: number; total: number }>('/api/aasp/sync', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aasp-intimacoes'] });
      queryClient.invalidateQueries({ queryKey: ['aasp-unread-count'] });
      queryClient.invalidateQueries({ queryKey: ['aasp-config'] });
    },
  });

  return { markRead, syncNow };
}
