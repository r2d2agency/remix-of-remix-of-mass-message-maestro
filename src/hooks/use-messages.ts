import { useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { MessageItem } from '@/components/mensagens/MessageItemEditor';

export interface MessageTemplate {
  id: string;
  user_id: string;
  name: string;
  items: MessageItem[];
  created_at: string;
  updated_at: string;
}

export const useMessages = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getMessages = useCallback(async (): Promise<MessageTemplate[]> => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<MessageTemplate[]>('/api/messages');
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao buscar mensagens';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const getMessage = useCallback(async (id: string): Promise<MessageTemplate> => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<MessageTemplate>(`/api/messages/${id}`);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao buscar mensagem';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const createMessage = useCallback(async (name: string, items: MessageItem[]): Promise<MessageTemplate> => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<MessageTemplate>('/api/messages', {
        method: 'POST',
        body: { name, items },
      });
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao criar mensagem';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateMessage = useCallback(async (id: string, updates: { name?: string; items?: MessageItem[] }): Promise<MessageTemplate> => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<MessageTemplate>(`/api/messages/${id}`, {
        method: 'PATCH',
        body: updates,
      });
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao atualizar mensagem';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteMessage = useCallback(async (id: string): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      await api(`/api/messages/${id}`, { method: 'DELETE' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao deletar mensagem';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    getMessages,
    getMessage,
    createMessage,
    updateMessage,
    deleteMessage,
  };
};
