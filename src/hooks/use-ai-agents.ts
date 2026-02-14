import { useState, useCallback } from 'react';
import { api } from '@/lib/api';

// PostgreSQL arrays may come back as strings like "{a,b,c}" depending on driver/query.
function normalizePgArray<T extends string>(value: unknown, defaultValue: T[] = []): T[] {
  if (Array.isArray(value)) return value as T[];

  if (typeof value === 'string') {
    const trimmed = value.trim();

    // JSON arrays sometimes get serialized to string
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? (parsed as T[]) : defaultValue;
      } catch {
        // fall through
      }
    }

    // PostgreSQL array format: {item1,item2}
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      const inner = trimmed.slice(1, -1).trim();
      if (!inner) return defaultValue;
      return inner.split(',').map((s) => s.trim().replace(/^"|"$/g, '')) as T[];
    }

    // Single value
    if (!trimmed) return defaultValue;
    return [trimmed.replace(/^"|"$/g, '') as T];
  }

  return defaultValue;
}

// PostgreSQL sometimes returns numeric fields as strings
function normalizeNumber(value: unknown, defaultValue: number): number {
  if (typeof value === 'number' && !isNaN(value)) return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? defaultValue : parsed;
  }
  return defaultValue;
}

function normalizeAgent(agent: AIAgent): AIAgent {
  return {
    ...agent,
    capabilities: normalizePgArray<AgentCapability>(agent.capabilities, ['respond_messages']),
    handoff_keywords: normalizePgArray<string>(agent.handoff_keywords, ['humano', 'atendente', 'pessoa']),
    personality_traits: normalizePgArray<string>(agent.personality_traits, []),
    temperature: normalizeNumber(agent.temperature, 0.7),
    max_tokens: normalizeNumber(agent.max_tokens, 1000),
    context_window: normalizeNumber(agent.context_window, 10),
    auto_handoff_after_failures: normalizeNumber(agent.auto_handoff_after_failures, 3),
  };
}

export type AIProvider = 'openai' | 'gemini';
export type KnowledgeSourceType = 'file' | 'url' | 'text';
export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed';

export type AgentCapability = 
  | 'respond_messages'
  | 'read_files'
  | 'schedule_meetings'
  | 'google_calendar'
  | 'manage_tasks'
  | 'create_deals'
  | 'suggest_actions'
  | 'generate_content'
  | 'summarize_history'
  | 'qualify_leads'
  | 'call_agent';

export interface CallAgentRule {
  agent_id: string;
  agent_name?: string;
  trigger: 'auto' | 'keyword' | 'topic';
  keywords?: string[];
  topic_description?: string;
}

export interface CallAgentConfig {
  allowed_agent_ids?: string[];
  rules?: CallAgentRule[];
  allow_all?: boolean;
}

export interface AIAgent {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  is_active: boolean;
  ai_provider: AIProvider;
  ai_model: string;
  ai_api_key: string | null;
  system_prompt: string;
  personality_traits: string[];
  language: string;
  temperature: number;
  max_tokens: number;
  context_window: number;
  capabilities: AgentCapability[];
  greeting_message: string | null;
  fallback_message: string;
  handoff_message: string;
  handoff_keywords: string[];
  auto_handoff_after_failures: number;
  default_department_id: string | null;
  default_user_id: string | null;
  lead_scoring_criteria: Record<string, unknown>;
  call_agent_config: CallAgentConfig;
  auto_create_deal_funnel_id: string | null;
  auto_create_deal_stage_id: string | null;
  total_conversations: number;
  total_messages: number;
  avg_response_time_ms: number | null;
  satisfaction_score: number | null;
  created_by: string | null;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
  // Computed
  knowledge_sources_count?: number;
  connections_count?: number;
  active_sessions?: number;
}

export interface KnowledgeSource {
  id: string;
  agent_id: string;
  source_type: KnowledgeSourceType;
  name: string;
  description: string | null;
  source_content: string;
  file_type: string | null;
  file_size: number | null;
  original_filename: string | null;
  status: ProcessingStatus;
  error_message: string | null;
  processed_at: string | null;
  chunk_count: number;
  total_tokens: number;
  is_active: boolean;
  priority: number;
  created_by: string | null;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
  embedding_model?: string | null;
  embedding_dimensions?: number | null;
  extracted_text?: string | null;
}

export interface AgentConnection {
  id: string;
  agent_id: string;
  connection_id: string;
  mode: 'always' | 'business_hours' | 'keywords';
  trigger_keywords: string[];
  business_hours_start: string;
  business_hours_end: string;
  business_days: number[];
  is_active: boolean;
  priority: number;
  connection_name?: string;
  connection_phone?: string;
  connection_status?: string;
  created_at: string;
}

export interface AgentStats {
  summary: {
    total_sessions: number;
    total_messages: number;
    total_tokens_used: number;
    handoff_count: number;
    avg_response_time_ms: number;
    positive_feedback: number;
    negative_feedback: number;
    deals_created: number;
    meetings_scheduled: number;
    leads_qualified: number;
  };
  daily: Array<{
    date: string;
    total_sessions: number;
    total_messages: number;
    handoff_count: number;
    deals_created: number;
  }>;
  active_sessions: number;
}

export interface AIModel {
  id: string;
  name: string;
  description: string;
}

export interface AIModels {
  openai: AIModel[];
  gemini: AIModel[];
}

export interface PromptTemplate {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  category: string | null;
  template: string;
  variables: string[];
  is_system: boolean;
  usage_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const useAIAgents = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ==================== AGENTES ====================

  const getAgents = useCallback(async (): Promise<AIAgent[]> => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<AIAgent[]>('/api/ai-agents', { auth: true });
      return Array.isArray(data) ? data.map(normalizeAgent) : [];
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar agentes';
      setError(message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const getAgent = useCallback(async (id: string): Promise<AIAgent | null> => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<AIAgent>(`/api/ai-agents/${id}`, { auth: true });
      return data ? normalizeAgent(data) : null;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar agente';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const createAgent = useCallback(async (data: Partial<AIAgent>): Promise<AIAgent | null> => {
    setLoading(true);
    setError(null);
    try {
      const created = await api<AIAgent>('/api/ai-agents', {
        method: 'POST',
        body: data,
        auth: true,
      });
      return created ? normalizeAgent(created) : null;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao criar agente';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateAgent = useCallback(async (id: string, data: Partial<AIAgent>): Promise<AIAgent | null> => {
    setLoading(true);
    setError(null);
    try {
      const updated = await api<AIAgent>(`/api/ai-agents/${id}`, {
        method: 'PATCH',
        body: data,
        auth: true,
      });
      return updated ? normalizeAgent(updated) : null;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao atualizar agente';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteAgent = useCallback(async (id: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      await api(`/api/ai-agents/${id}`, { method: 'DELETE', auth: true });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao deletar agente';
      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const toggleAgent = useCallback(async (id: string): Promise<{ id: string; is_active: boolean } | null> => {
    setLoading(true);
    setError(null);
    try {
      return await api<{ id: string; is_active: boolean }>(`/api/ai-agents/${id}/toggle`, {
        method: 'POST',
        auth: true,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao alternar agente';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // ==================== KNOWLEDGE BASE ====================

  const getKnowledgeSources = useCallback(async (agentId: string): Promise<KnowledgeSource[]> => {
    setLoading(true);
    setError(null);
    try {
      return await api<KnowledgeSource[]>(`/api/ai-agents/${agentId}/knowledge`, { auth: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar fontes';
      setError(message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const addKnowledgeSource = useCallback(async (
    agentId: string, 
    data: Partial<KnowledgeSource>
  ): Promise<KnowledgeSource | null> => {
    setLoading(true);
    setError(null);
    try {
      return await api<KnowledgeSource>(`/api/ai-agents/${agentId}/knowledge`, {
        method: 'POST',
        body: data,
        auth: true,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao adicionar fonte';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateKnowledgeSource = useCallback(async (
    agentId: string,
    sourceId: string,
    data: Partial<KnowledgeSource>
  ): Promise<KnowledgeSource | null> => {
    setLoading(true);
    setError(null);
    try {
      return await api<KnowledgeSource>(`/api/ai-agents/${agentId}/knowledge/${sourceId}`, {
        method: 'PATCH',
        body: data,
        auth: true,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao atualizar fonte';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteKnowledgeSource = useCallback(async (agentId: string, sourceId: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      await api(`/api/ai-agents/${agentId}/knowledge/${sourceId}`, { method: 'DELETE', auth: true });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao deletar fonte';
      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const reprocessKnowledgeSource = useCallback(async (agentId: string, sourceId: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      await api(`/api/ai-agents/${agentId}/knowledge/${sourceId}/reprocess`, { method: 'POST', auth: true });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao reprocessar fonte';
      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // ==================== CONEXÕES ====================

  const getAgentConnections = useCallback(async (agentId: string): Promise<AgentConnection[]> => {
    setLoading(true);
    setError(null);
    try {
      return await api<AgentConnection[]>(`/api/ai-agents/${agentId}/connections`, { auth: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar conexões';
      setError(message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const linkAgentToConnection = useCallback(async (
    agentId: string,
    data: Partial<AgentConnection>
  ): Promise<AgentConnection | null> => {
    setLoading(true);
    setError(null);
    try {
      return await api<AgentConnection>(`/api/ai-agents/${agentId}/connections`, {
        method: 'POST',
        body: data,
        auth: true,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao vincular conexão';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const unlinkAgentFromConnection = useCallback(async (agentId: string, connectionId: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      await api(`/api/ai-agents/${agentId}/connections/${connectionId}`, { method: 'DELETE', auth: true });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao desvincular conexão';
      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // ==================== ESTATÍSTICAS ====================

  const getAgentStats = useCallback(async (
    agentId: string,
    startDate?: string,
    endDate?: string
  ): Promise<AgentStats | null> => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set('start_date', startDate);
      if (endDate) params.set('end_date', endDate);
      
      const url = `/api/ai-agents/${agentId}/stats${params.toString() ? `?${params}` : ''}`;
      return await api<AgentStats>(url, { auth: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar estatísticas';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // ==================== MODELOS E TEMPLATES ====================

  const getAIModels = useCallback(async (): Promise<AIModels> => {
    try {
      return await api<AIModels>('/api/ai-agents/config/models', { auth: true });
    } catch {
      return { openai: [], gemini: [] };
    }
  }, []);

  const getPromptTemplates = useCallback(async (category?: string): Promise<PromptTemplate[]> => {
    try {
      const params = category ? `?category=${category}` : '';
      return await api<PromptTemplate[]>(`/api/ai-agents/templates${params}`, { auth: true });
    } catch {
      return [];
    }
  }, []);

  const createPromptTemplate = useCallback(async (data: Partial<PromptTemplate>): Promise<PromptTemplate | null> => {
    setLoading(true);
    setError(null);
    try {
      return await api<PromptTemplate>('/api/ai-agents/templates', {
        method: 'POST',
        body: data,
        auth: true,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao criar template';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    // Agentes
    getAgents,
    getAgent,
    createAgent,
    updateAgent,
    deleteAgent,
    toggleAgent,
    // Knowledge Base
    getKnowledgeSources,
    addKnowledgeSource,
    updateKnowledgeSource,
    deleteKnowledgeSource,
    reprocessKnowledgeSource,
    // Conexões
    getAgentConnections,
    linkAgentToConnection,
    unlinkAgentFromConnection,
    // Estatísticas
    getAgentStats,
    // Modelos e Templates
    getAIModels,
    getPromptTemplates,
    createPromptTemplate,
  };
};
