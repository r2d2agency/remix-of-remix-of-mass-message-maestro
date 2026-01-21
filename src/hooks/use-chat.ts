import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
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
  is_pinned: boolean;
  is_group: boolean;
  group_name: string | null;
  assigned_to: string | null;
  assigned_name: string | null;
  connection_name: string;
  connection_phone: string | null;
  tags: ConversationTag[];
  last_message: string | null;
  last_message_type: string | null;
  attendance_status: 'waiting' | 'attending';
  accepted_at: string | null;
  accepted_by: string | null;
  accepted_by_name: string | null;
  created_at: string;
}

export interface Connection {
  id: string;
  name: string;
  phone_number: string | null;
  status: string;
}

export interface ChatStats {
  total_conversations: number;
  unread_conversations: number;
  messages_today: number;
  messages_week: number;
  avg_response_time_minutes: number | null;
  conversations_by_connection: { connection_name: string; count: number }[];
  conversations_by_status: { status: string; count: number }[];
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  message_id: string | null;
  from_me: boolean;
  sender_id: string | null;
  sender_name: string | null;
  sender_phone: string | null;
  content: string | null;
  message_type: string;
  media_url: string | null;
  media_mimetype: string | null;
  quoted_message_id: string | null;
  quoted_content: string | null;
  quoted_message_type: string | null;
  quoted_from_me: boolean | null;
  quoted_sender_name: string | null;
  status: string;
  timestamp: string;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface ConversationNote {
  id: string;
  conversation_id: string;
  user_id: string | null;
  user_name: string | null;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface ScheduledMessage {
  id: string;
  conversation_id: string;
  connection_id: string;
  sender_id: string | null;
  sender_name: string | null;
  content: string | null;
  message_type: string;
  media_url: string | null;
  scheduled_at: string;
  timezone: string;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
}

export interface UserAlert {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string | null;
  metadata: {
    conversation_id?: string;
    scheduled_message_id?: string;
    message_preview?: string;
  };
  is_read: boolean;
  created_at: string;
}

export const useChat = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alertsPollingRef = useRef<NodeJS.Timeout | null>(null);
  const lastAlertIdRef = useRef<string | null>(null);

  // Alerts polling - show toast when new scheduled messages are sent
  const getAlerts = useCallback(async (): Promise<UserAlert[]> => {
    try {
      const data = await api<UserAlert[]>('/api/chat/alerts');
      return data;
    } catch (err) {
      console.error('Error fetching alerts:', err);
      return [];
    }
  }, []);

  const markAlertsRead = useCallback(async (alertIds: string[]): Promise<void> => {
    try {
      await api('/api/chat/alerts/read', {
        method: 'POST',
        body: { alert_ids: alertIds },
      });
    } catch (err) {
      console.error('Error marking alerts as read:', err);
    }
  }, []);

  // Start polling for alerts
  const startAlertsPolling = useCallback(() => {
    if (alertsPollingRef.current) return;

    const pollAlerts = async () => {
      const alerts = await getAlerts();
      
      if (alerts.length > 0) {
        // Show toast for new alerts
        const newAlerts = lastAlertIdRef.current 
          ? alerts.filter(a => a.id !== lastAlertIdRef.current && new Date(a.created_at) > new Date(Date.now() - 60000))
          : alerts.filter(a => new Date(a.created_at) > new Date(Date.now() - 10000));

        newAlerts.forEach(alert => {
          toast.success(alert.title, {
            description: alert.message || undefined,
            duration: 5000,
          });
        });

        if (newAlerts.length > 0) {
          // Mark as read
          await markAlertsRead(newAlerts.map(a => a.id));
        }

        lastAlertIdRef.current = alerts[0]?.id || null;
      }
    };

    // Initial poll
    pollAlerts();

    // Poll every 15 seconds
    alertsPollingRef.current = setInterval(pollAlerts, 15000);
  }, [getAlerts, markAlertsRead]);

  const stopAlertsPolling = useCallback(() => {
    if (alertsPollingRef.current) {
      clearInterval(alertsPollingRef.current);
      alertsPollingRef.current = null;
    }
  }, []);

  // Conversations
  const getConversations = useCallback(async (filters?: {
    search?: string;
    tag?: string;
    assigned?: string;
    archived?: boolean;
    connection?: string;
    is_group?: boolean | string;
    attendance_status?: 'waiting' | 'attending';
  }): Promise<Conversation[]> => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters?.search) params.append('search', filters.search);
      // Only append tag if it's a valid UUID (not 'all')
      if (filters?.tag && filters.tag !== 'all') params.append('tag', filters.tag);
      // Only append assigned if it's a specific value (not 'all')
      if (filters?.assigned && filters.assigned !== 'all') params.append('assigned', filters.assigned);
      if (filters?.archived !== undefined) params.append('archived', String(filters.archived));
      // Only append connection if it's a valid UUID (not 'all')
      if (filters?.connection && filters.connection !== 'all') params.append('connection', filters.connection);
      if (filters?.is_group !== undefined) params.append('is_group', String(filters.is_group));
      if (filters?.attendance_status) params.append('attendance_status', filters.attendance_status);
      
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

  // Get connections for filter
  const getConnections = useCallback(async (): Promise<Connection[]> => {
    try {
      const data = await api<Connection[]>('/api/connections');
      return data;
    } catch (err) {
      console.error('Error fetching connections:', err);
      return [];
    }
  }, []);

  // Get chat statistics
  const getChatStats = useCallback(async (): Promise<ChatStats> => {
    const data = await api<ChatStats>('/api/chat/stats');
    return data;
  }, []);

  // Pin/unpin conversation
  const pinConversation = useCallback(async (id: string, pinned: boolean): Promise<void> => {
    await api(`/api/chat/conversations/${id}/pin`, {
      method: 'POST',
      body: { pinned },
    });
  }, []);

  // Accept conversation (move to attending)
  const acceptConversation = useCallback(async (id: string): Promise<void> => {
    await api(`/api/chat/conversations/${id}/accept`, { method: 'POST' });
  }, []);

  // Release conversation (move back to waiting)
  const releaseConversation = useCallback(async (id: string): Promise<void> => {
    await api(`/api/chat/conversations/${id}/release`, { method: 'POST' });
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

  // Notes
  const getNotes = useCallback(async (conversationId: string): Promise<ConversationNote[]> => {
    try {
      const data = await api<ConversationNote[]>(`/api/chat/conversations/${conversationId}/notes`);
      return data;
    } catch (err: any) {
      console.error('Erro ao buscar anotações:', err);
      return [];
    }
  }, []);

  const createNote = useCallback(async (conversationId: string, content: string): Promise<ConversationNote | null> => {
    try {
      const data = await api<ConversationNote>(`/api/chat/conversations/${conversationId}/notes`, {
        method: 'POST',
        body: { content },
      });
      return data;
    } catch (err: any) {
      setError(err.message || 'Erro ao criar anotação');
      return null;
    }
  }, []);

  const updateNote = useCallback(async (conversationId: string, noteId: string, content: string): Promise<ConversationNote | null> => {
    try {
      const data = await api<ConversationNote>(`/api/chat/conversations/${conversationId}/notes/${noteId}`, {
        method: 'PATCH',
        body: { content },
      });
      return data;
    } catch (err: any) {
      setError(err.message || 'Erro ao atualizar anotação');
      return null;
    }
  }, []);

  const deleteNote = useCallback(async (conversationId: string, noteId: string): Promise<boolean> => {
    try {
      await api(`/api/chat/conversations/${conversationId}/notes/${noteId}`, {
        method: 'DELETE',
      });
      return true;
    } catch (err: any) {
      setError(err.message || 'Erro ao excluir anotação');
      return false;
    }
  }, []);

  // Typing status
  const getTypingStatus = useCallback(async (conversationId: string): Promise<boolean> => {
    if (!conversationId) return false;
    try {
      const response = await api<{ isTyping: boolean }>(`/api/evolution/typing/${conversationId}`);
      return response.isTyping || false;
    } catch (err: any) {
      // Silently handle 404 errors (conversation doesn't exist yet)
      if (!err.message?.includes('não encontrada')) {
        console.error('Error getting typing status:', err);
      }
      return false;
    }
  }, []);

  // Scheduled Messages
  const getScheduledMessages = useCallback(async (conversationId: string): Promise<ScheduledMessage[]> => {
    const data = await api<ScheduledMessage[]>(`/api/chat/conversations/${conversationId}/scheduled`);
    return data;
  }, []);

  const scheduleMessage = useCallback(async (conversationId: string, message: {
    content?: string;
    message_type?: string;
    media_url?: string;
    scheduled_at: string;
    timezone?: string;
  }): Promise<ScheduledMessage> => {
    const data = await api<ScheduledMessage>(`/api/chat/conversations/${conversationId}/schedule`, {
      method: 'POST',
      body: message,
    });
    return data;
  }, []);

  const cancelScheduledMessage = useCallback(async (messageId: string): Promise<void> => {
    await api(`/api/chat/scheduled/${messageId}`, { method: 'DELETE' });
  }, []);

  const getScheduledCount = useCallback(async (): Promise<number> => {
    const data = await api<{ count: number }>(`/api/chat/scheduled/count`);
    return data.count;
  }, []);

  // Sync group name from W-API
  const syncGroupName = useCallback(async (connectionId: string, conversationId: string): Promise<{ success: boolean; group_name?: string }> => {
    try {
      const data = await api<{ success: boolean; group_name?: string }>(`/api/wapi/${connectionId}/sync-group-name/${conversationId}`, {
        method: 'POST',
      });
      return data;
    } catch (err) {
      console.error('Error syncing group name:', err);
      return { success: false };
    }
  }, []);

  // Sync all group names from W-API for a connection
  const syncAllGroupNames = useCallback(async (connectionId: string): Promise<{ success: boolean; updated?: number; total?: number; message?: string }> => {
    try {
      const data = await api<{ success: boolean; updated?: number; total?: number; message?: string }>(`/api/wapi/${connectionId}/sync-all-groups`, {
        method: 'POST',
      });
      return data;
    } catch (err) {
      console.error('Error syncing all group names:', err);
      return { success: false };
    }
  }, []);

  // Get attendance counts for tabs
  const getAttendanceCounts = useCallback(async (isGroup: boolean): Promise<{ waiting: number; attending: number }> => {
    try {
      const data = await api<{ waiting: number; attending: number }>(`/api/chat/conversations/attendance-counts?is_group=${isGroup}`);
      return data;
    } catch (err) {
      console.error('Error fetching attendance counts:', err);
      return { waiting: 0, attending: 0 };
    }
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
    pinConversation,
    acceptConversation,
    releaseConversation,
    // Connections
    getConnections,
    // Stats
    getChatStats,
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
    // Notes
    getNotes,
    createNote,
    updateNote,
    deleteNote,
    // Typing
    getTypingStatus,
    // Scheduled Messages
    getScheduledMessages,
    scheduleMessage,
    cancelScheduledMessage,
    getScheduledCount,
    // Groups
    syncGroupName,
    syncAllGroupNames,
    // Alerts
    getAlerts,
    markAlertsRead,
    startAlertsPolling,
    stopAlertsPolling,
    // Attendance counts
    getAttendanceCounts,
  };
};
