import { useState, useCallback } from 'react';
import { api } from '@/lib/api';

export interface ConversationTag {
  id: string;
  name: string;
  color: string;
}

export interface Conversation {
  id: string;
  connection_id: string;
  remote_jid: string;
  contact_name: string | null;
  contact_phone: string | null;
  last_message_at: string | null;
  unread_count: number;
  is_archived: boolean;
  assigned_to: string | null;
  assigned_name: string | null;
  connection_name: string;
  connection_phone: string | null;
  tags: ConversationTag[];
  last_message: string | null;
  last_message_type: string | null;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  message_id: string | null;
  from_me: boolean;
  sender_id: string | null;
  sender_name: string | null;
  content: string | null;
  message_type: string;
  media_url: string | null;
  media_mimetype: string | null;
  quoted_message_id: string | null;
  status: string;
  timestamp: string;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
}

export const useChat = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Conversations
  const getConversations = useCallback(async (filters?: {
    search?: string;
    tag?: string;
    assigned?: string;
    archived?: boolean;
  }): Promise<Conversation[]> => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters?.search) params.append('search', filters.search);
      if (filters?.tag) params.append('tag', filters.tag);
      if (filters?.assigned) params.append('assigned', filters.assigned);
      if (filters?.archived !== undefined) params.append('archived', String(filters.archived));
      
      const url = `/api/chat/conversations${params.toString() ? `?${params}` : ''}`;
      const data = await api<Conversation[]>(url);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao buscar conversas';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const getConversation = useCallback(async (id: string): Promise<Conversation & {
    instance_name: string;
    api_url: string;
    api_key: string;
  }> => {
    const data = await api<Conversation & {
      instance_name: string;
      api_url: string;
      api_key: string;
    }>(`/api/chat/conversations/${id}`);
    return data;
  }, []);

  const updateConversation = useCallback(async (id: string, updates: {
    assigned_to?: string | null;
    is_archived?: boolean;
  }): Promise<Conversation> => {
    const data = await api<Conversation>(`/api/chat/conversations/${id}`, {
      method: 'PATCH',
      body: updates,
    });
    return data;
  }, []);

  const markAsRead = useCallback(async (id: string): Promise<void> => {
    await api(`/api/chat/conversations/${id}/read`, { method: 'POST' });
  }, []);

  const transferConversation = useCallback(async (id: string, toUserId: string | null, note?: string): Promise<void> => {
    await api(`/api/chat/conversations/${id}/transfer`, {
      method: 'POST',
      body: { to_user_id: toUserId, note },
    });
  }, []);

  // Messages
  const getMessages = useCallback(async (conversationId: string, options?: {
    limit?: number;
    before?: string;
  }): Promise<ChatMessage[]> => {
    const params = new URLSearchParams();
    if (options?.limit) params.append('limit', String(options.limit));
    if (options?.before) params.append('before', options.before);
    
    const url = `/api/chat/conversations/${conversationId}/messages${params.toString() ? `?${params}` : ''}`;
    const data = await api<ChatMessage[]>(url);
    return data;
  }, []);

  const sendMessage = useCallback(async (conversationId: string, message: {
    content?: string;
    message_type?: string;
    media_url?: string;
    media_mimetype?: string;
    quoted_message_id?: string;
  }): Promise<ChatMessage> => {
    const data = await api<ChatMessage>(`/api/chat/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: message,
    });
    return data;
  }, []);

  // Tags
  const getTags = useCallback(async (): Promise<ConversationTag[]> => {
    const data = await api<ConversationTag[]>('/api/chat/tags');
    return data;
  }, []);

  const createTag = useCallback(async (name: string, color?: string): Promise<ConversationTag> => {
    const data = await api<ConversationTag>('/api/chat/tags', {
      method: 'POST',
      body: { name, color },
    });
    return data;
  }, []);

  const deleteTag = useCallback(async (id: string): Promise<void> => {
    await api(`/api/chat/tags/${id}`, { method: 'DELETE' });
  }, []);

  const addTagToConversation = useCallback(async (conversationId: string, tagId: string): Promise<void> => {
    await api(`/api/chat/conversations/${conversationId}/tags`, {
      method: 'POST',
      body: { tag_id: tagId },
    });
  }, []);

  const removeTagFromConversation = useCallback(async (conversationId: string, tagId: string): Promise<void> => {
    await api(`/api/chat/conversations/${conversationId}/tags/${tagId}`, {
      method: 'DELETE',
    });
  }, []);

  // Team
  const getTeam = useCallback(async (): Promise<TeamMember[]> => {
    const data = await api<TeamMember[]>('/api/chat/team');
    return data;
  }, []);

  // History sync
  const syncChatHistory = useCallback(async (params: {
    connectionId: string;
    remoteJid: string;
    days?: number;
  }): Promise<{ imported: number; skipped?: number; total?: number; message?: string }> => {
    const data = await api<{ imported: number; skipped?: number; total?: number; message?: string }>(
      `/api/evolution/${params.connectionId}/sync-chat`,
      {
        method: 'POST',
        body: {
          remoteJid: params.remoteJid,
          days: params.days ?? 7,
        },
      }
    );
    return data;
  }, []);

  return {
    loading,
    error,
    // Conversations
    getConversations,
    getConversation,
    updateConversation,
    markAsRead,
    transferConversation,
    // Messages
    getMessages,
    sendMessage,
    // Tags
    getTags,
    createTag,
    deleteTag,
    addTagToConversation,
    removeTagFromConversation,
    // Team
    getTeam,
    // History sync
    syncChatHistory,
  };
};
