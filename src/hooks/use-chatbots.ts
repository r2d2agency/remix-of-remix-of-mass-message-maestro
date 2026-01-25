import { useState, useCallback } from 'react';
import { api } from '@/lib/api';

export type AIProvider = 'gemini' | 'openai' | 'none';
export type ChatbotMode = 'always' | 'business_hours' | 'outside_hours' | 'pre_service';
export type ChatbotType = 'flow' | 'traditional' | 'ai' | 'hybrid';
export type FlowNodeType = 'start' | 'message' | 'menu' | 'input' | 'condition' | 'action' | 'transfer' | 'ai_response' | 'end';

export interface MenuOption {
  id: string;
  number: string;
  label: string;
  action: 'submenu' | 'transfer' | 'message' | 'tag';
  action_value: string;
  submenu_options?: MenuOption[];
}

export interface Chatbot {
  id: string;
  organization_id: string;
  connection_id: string | null;
  name: string;
  description: string | null;
  is_active: boolean;
  mode: ChatbotMode;
  business_hours_start: string;
  business_hours_end: string;
  business_days: number[];
  timezone: string;
  ai_provider: AIProvider;
  ai_model: string | null;
  ai_api_key: string | null;
  ai_system_prompt: string | null;
  ai_temperature: number;
  ai_max_tokens: number;
  welcome_message: string | null;
  fallback_message: string;
  transfer_after_failures: number;
  typing_delay_ms: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  connection_name?: string;
  connection_phone?: string;
  created_by_name?: string;
  active_sessions?: number;
  // Novos campos
  default_agent_id?: string | null;
  trigger_keywords?: string[];
  trigger_enabled?: boolean;
  // Tipo do chatbot
  chatbot_type?: ChatbotType;
  menu_options?: MenuOption[];
  menu_message?: string;
  invalid_option_message?: string;
  // Fluxo visual vinculado
  linked_flow_id?: string | null;
}

export interface ChatbotFlow {
  id: string;
  chatbot_id: string;
  node_id: string;
  node_type: FlowNodeType;
  name: string | null;
  position_x: number;
  position_y: number;
  content: Record<string, unknown>;
  next_node_id: string | null;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface ChatbotStats {
  summary: {
    total_sessions: number;
    completed_sessions: number;
    transferred_sessions: number;
    total_messages_in: number;
    total_messages_out: number;
    ai_requests: number;
    ai_tokens_used: number;
    avg_duration: number;
  };
  daily: Array<{
    date: string;
    total_sessions: number;
    completed_sessions: number;
    transferred_sessions: number;
    ai_requests: number;
  }>;
  active_sessions: number;
}

export interface AIModel {
  id: string;
  name: string;
  description: string;
}

export interface AIModels {
  gemini: AIModel[];
  openai: AIModel[];
}

export const useChatbots = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Listar chatbots
  const getChatbots = useCallback(async (): Promise<Chatbot[]> => {
    setLoading(true);
    setError(null);
    try {
      const result = await api<Chatbot[]>('/api/chatbots', { auth: true });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar chatbots';
      setError(message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // Buscar chatbot por ID
  const getChatbot = useCallback(async (id: string): Promise<Chatbot | null> => {
    setLoading(true);
    setError(null);
    try {
      const result = await api<Chatbot>(`/api/chatbots/${id}`, { auth: true });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar chatbot';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Criar chatbot
  const createChatbot = useCallback(async (data: Partial<Chatbot>): Promise<Chatbot | null> => {
    setLoading(true);
    setError(null);
    try {
      const result = await api<Chatbot>('/api/chatbots', {
        method: 'POST',
        body: data,
        auth: true,
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao criar chatbot';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Atualizar chatbot
  const updateChatbot = useCallback(async (id: string, data: Partial<Chatbot>): Promise<Chatbot | null> => {
    setLoading(true);
    setError(null);
    try {
      const result = await api<Chatbot>(`/api/chatbots/${id}`, {
        method: 'PATCH',
        body: data,
        auth: true,
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao atualizar chatbot';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Deletar chatbot
  const deleteChatbot = useCallback(async (id: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      await api(`/api/chatbots/${id}`, { method: 'DELETE', auth: true });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao deletar chatbot';
      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // Ativar/Desativar chatbot
  const toggleChatbot = useCallback(async (id: string): Promise<{ id: string; is_active: boolean } | null> => {
    setLoading(true);
    setError(null);
    try {
      const result = await api<{ id: string; is_active: boolean }>(`/api/chatbots/${id}/toggle`, {
        method: 'POST',
        auth: true,
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao alternar chatbot';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Buscar fluxos de um chatbot
  const getFlows = useCallback(async (chatbotId: string): Promise<ChatbotFlow[]> => {
    setLoading(true);
    setError(null);
    try {
      const result = await api<ChatbotFlow[]>(`/api/chatbots/${chatbotId}/flows`, { auth: true });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar fluxos';
      setError(message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // Salvar fluxos
  const saveFlows = useCallback(async (chatbotId: string, flows: Partial<ChatbotFlow>[]): Promise<ChatbotFlow[]> => {
    setLoading(true);
    setError(null);
    try {
      const result = await api<ChatbotFlow[]>(`/api/chatbots/${chatbotId}/flows`, {
        method: 'PUT',
        body: { flows },
        auth: true,
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao salvar fluxos';
      setError(message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // Buscar estatísticas
  const getStats = useCallback(async (chatbotId: string, startDate?: string, endDate?: string): Promise<ChatbotStats | null> => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set('start_date', startDate);
      if (endDate) params.set('end_date', endDate);
      
      const url = `/api/chatbots/${chatbotId}/stats${params.toString() ? `?${params}` : ''}`;
      const result = await api<ChatbotStats>(url, { auth: true });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar estatísticas';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Buscar modelos de IA disponíveis
  const getAIModels = useCallback(async (): Promise<AIModels> => {
    try {
      const result = await api<AIModels>('/api/chatbots/ai/models', { auth: true });
      return result;
    } catch {
      return { gemini: [], openai: [] };
    }
  }, []);

  // Buscar chatbots disponíveis para uma conexão
  const getAvailableForConnection = useCallback(async (connectionId: string): Promise<Chatbot[]> => {
    try {
      const result = await api<Chatbot[]>(`/api/chatbots/available-for-conversation/${connectionId}`, { auth: true });
      return result;
    } catch {
      return [];
    }
  }, []);

  // Iniciar fluxo em uma conversa
  const startFlowInConversation = useCallback(async (conversationId: string, chatbotId: string): Promise<boolean> => {
    try {
      await api(`/api/chatbots/conversation/${conversationId}/start-flow`, {
        method: 'POST',
        body: { chatbot_id: chatbotId },
        auth: true,
      });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao iniciar fluxo';
      setError(message);
      return false;
    }
  }, []);

  // Cancelar fluxo em uma conversa
  const cancelFlowInConversation = useCallback(async (conversationId: string): Promise<boolean> => {
    try {
      await api(`/api/chatbots/conversation/${conversationId}/cancel-flow`, {
        method: 'POST',
        auth: true,
      });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao cancelar fluxo';
      setError(message);
      return false;
    }
  }, []);

  // Buscar fluxo ativo de uma conversa
  const getActiveFlow = useCallback(async (conversationId: string): Promise<{ active: boolean; flow?: any } | null> => {
    try {
      const result = await api<{ active: boolean; flow?: any }>(`/api/chatbots/conversation/${conversationId}/active-flow`, { auth: true });
      return result;
    } catch {
      return null;
    }
  }, []);

  // Atualizar keywords de um chatbot
  const updateKeywords = useCallback(async (chatbotId: string, keywords: string[], enabled: boolean): Promise<boolean> => {
    try {
      await api(`/api/chatbots/${chatbotId}/keywords`, {
        method: 'PATCH',
        body: { trigger_keywords: keywords, trigger_enabled: enabled },
        auth: true,
      });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao atualizar keywords';
      setError(message);
      return false;
    }
  }, []);

  return {
    loading,
    error,
    getChatbots,
    getChatbot,
    createChatbot,
    updateChatbot,
    deleteChatbot,
    toggleChatbot,
    getFlows,
    saveFlows,
    getStats,
    getAIModels,
    getAvailableForConnection,
    startFlowInConversation,
    cancelFlowInConversation,
    getActiveFlow,
    updateKeywords,
  };
};
