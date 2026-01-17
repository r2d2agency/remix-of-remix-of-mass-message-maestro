import { useState, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { ConversationList } from "@/components/chat/ConversationList";
import { ChatArea } from "@/components/chat/ChatArea";
import { NewConversationDialog } from "@/components/chat/NewConversationDialog";
import { useChat, Conversation, ChatMessage, ConversationTag, TeamMember } from "@/hooks/use-chat";
import { toast } from "sonner";
import { api } from "@/lib/api";

interface UserProfile {
  user?: {
    role?: string;
  };
}

const Chat = () => {
  const location = useLocation();

  const {
    loading,
    getConversations,
    getConversation,
    updateConversation,
    markAsRead,
    transferConversation,
    pinConversation,
    getConnections,
    getMessages,
    sendMessage,
    getTags,
    createTag,
    addTagToConversation,
    removeTagFromConversation,
    getTeam,
    syncChatHistory,
    startAlertsPolling,
    stopAlertsPolling,
  } = useChat();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [tags, setTags] = useState<ConversationTag[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [connections, setConnections] = useState<{ id: string; name: string; phone_number: string | null; status: string }[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [syncingHistory, setSyncingHistory] = useState(false);
  const [newConversationOpen, setNewConversationOpen] = useState(false);
  const [filters, setFilters] = useState({
    search: '',
    tag: 'all',
    assigned: 'all',
    archived: false,
    connection: 'all',
  });

  // Load initial data and start alerts polling
  useEffect(() => {
    loadConversations();
    loadTags();
    loadTeam();
    loadConnections();
    checkUserRole();
    startAlertsPolling();

    return () => {
      stopAlertsPolling();
    };
  }, []);

  const checkUserRole = async () => {
    try {
      const profile = await api<UserProfile>('/api/auth/me');
      const role = profile.user?.role || '';
      setIsAdmin(['owner', 'admin'].includes(role));
    } catch (error) {
      console.error('Error checking user role:', error);
    }
  };

  // Reload when filters change
  useEffect(() => {
    loadConversations();
  }, [filters]);

  // Auto-refresh conversations every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      loadConversations();
    }, 15000);
    return () => clearInterval(interval);
  }, [filters]);

  // Auto-refresh messages every 5 seconds when conversation is selected
  useEffect(() => {
    if (!selectedConversation) return;

    const interval = setInterval(async () => {
      try {
        const msgs = await getMessages(selectedConversation.id);
        setMessages(msgs);
        
        // Also refresh conversation list to update unread counts
        loadConversations();
      } catch (error) {
        console.error('Error refreshing messages:', error);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [selectedConversation?.id, getMessages]);

  const loadConnections = async () => {
    try {
      const data = await getConnections();
      setConnections(data);
    } catch (error) {
      console.error('Error loading connections:', error);
    }
  };

  const loadConversations = useCallback(async () => {
    try {
      const filterParams: any = {};
      if (filters.search) filterParams.search = filters.search;
      if (filters.tag !== 'all') filterParams.tag = filters.tag;
      if (filters.assigned !== 'all') filterParams.assigned = filters.assigned;
      if (filters.connection !== 'all') filterParams.connection = filters.connection;
      filterParams.archived = filters.archived;

      const data = await getConversations(filterParams);

      // Keep the currently selected conversation visible if it's still "empty" (no messages yet).
      // The backend hides empty conversations by default to keep the list clean.
      const keepEmptySelected = !!selectedConversation && !selectedConversation.last_message_at;
      const merged = keepEmptySelected && !data.some(c => c.id === selectedConversation!.id)
        ? [selectedConversation!, ...data]
        : data;

      setConversations(merged);

      // Update selected conversation if it exists
      if (selectedConversation) {
        const updated = merged.find(c => c.id === selectedConversation.id);
        if (updated) {
          setSelectedConversation(updated);
        }
      }
    } catch (error) {
      console.error('Error loading conversations:', error);
    }
  }, [getConversations, filters, selectedConversation]);

  const loadTags = async () => {
    try {
      const data = await getTags();
      setTags(data);
    } catch (error) {
      console.error('Error loading tags:', error);
    }
  };

  const loadTeam = async () => {
    try {
      const data = await getTeam();
      setTeam(data);
    } catch (error) {
      console.error('Error loading team:', error);
    }
  };

  const handleSelectConversation = useCallback(async (conversation: Conversation) => {
    setSelectedConversation(conversation);
    setMessages([]);
    setLoadingMessages(true);

    try {
      const msgs = await getMessages(conversation.id);
      setMessages(msgs);
      setHasMoreMessages(msgs.length >= 50);

      // Mark as read
      if (conversation.unread_count > 0) {
        await markAsRead(conversation.id);
        loadConversations();
      }
    } catch (error) {
      console.error('Error loading messages:', error);
      toast.error('Erro ao carregar mensagens');
    } finally {
      setLoadingMessages(false);
    }
  }, [getMessages, markAsRead, loadConversations]);

  // If we arrive from the Agenda (or any deep link): /chat?conversation=<id>
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const conversationId = params.get('conversation');
    if (!conversationId) return;

    (async () => {
      try {
        const conv = await getConversation(conversationId);
        await handleSelectConversation(conv);
      } catch (error) {
        console.error('Error opening conversation from URL:', error);
        toast.error('Não foi possível abrir a conversa');
      }
    })();
  }, [location.search, getConversation, handleSelectConversation]);

  const handleLoadMoreMessages = async () => {
    if (!selectedConversation || messages.length === 0) return;

    setLoadingMessages(true);
    try {
      const oldestMessage = messages[0];
      const olderMsgs = await getMessages(selectedConversation.id, {
        before: oldestMessage.timestamp,
        limit: 50,
      });
      
      setMessages([...olderMsgs, ...messages]);
      setHasMoreMessages(olderMsgs.length >= 50);
    } catch (error) {
      console.error('Error loading more messages:', error);
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleSendMessage = async (
    content: string,
    type: string = 'text',
    mediaUrl?: string,
    quotedMessageId?: string,
    mediaMimetype?: string
  ) => {
    if (!selectedConversation) return;

    setSendingMessage(true);
    try {
      const newMessage = await sendMessage(selectedConversation.id, {
        content,
        message_type: type,
        media_url: mediaUrl,
        media_mimetype: mediaMimetype,
        quoted_message_id: quotedMessageId,
      });
      
      setMessages(prev => [...prev, newMessage]);
      loadConversations(); // Refresh to update last_message
    } catch (error: any) {
      toast.error(error.message || 'Erro ao enviar mensagem');
      throw error;
    } finally {
      setSendingMessage(false);
    }
  };

  const handleAddTag = async (tagId: string) => {
    if (!selectedConversation) return;
    try {
      await addTagToConversation(selectedConversation.id, tagId);
      loadConversations();
      toast.success('Tag adicionada');
    } catch (error) {
      toast.error('Erro ao adicionar tag');
    }
  };

  const handleRemoveTag = async (tagId: string) => {
    if (!selectedConversation) return;
    try {
      await removeTagFromConversation(selectedConversation.id, tagId);
      loadConversations();
      toast.success('Tag removida');
    } catch (error) {
      toast.error('Erro ao remover tag');
    }
  };

  const handleAssign = async (userId: string | null) => {
    if (!selectedConversation) return;
    try {
      await updateConversation(selectedConversation.id, { assigned_to: userId });
      loadConversations();
      toast.success(userId ? 'Atendente atribuído' : 'Atendente removido');
    } catch (error) {
      toast.error('Erro ao atribuir atendente');
    }
  };

  const handleArchive = async () => {
    if (!selectedConversation) return;
    try {
      const newArchived = !selectedConversation.is_archived;
      await updateConversation(selectedConversation.id, { is_archived: newArchived });
      loadConversations();
      setSelectedConversation(null);
      setMessages([]);
      toast.success(newArchived ? 'Conversa arquivada' : 'Conversa desarquivada');
    } catch (error) {
      toast.error('Erro ao arquivar conversa');
    }
  };

  const handleTransfer = async (userId: string | null, note?: string) => {
    if (!selectedConversation) return;
    try {
      await transferConversation(selectedConversation.id, userId, note);
      loadConversations();
      
      // Reload messages to show transfer system message
      const msgs = await getMessages(selectedConversation.id);
      setMessages(msgs);
    } catch (error) {
      toast.error('Erro ao transferir conversa');
    }
  };

  const handleCreateTag = async (name: string, color: string) => {
    try {
      const newTag = await createTag(name, color);
      setTags(prev => [...prev, newTag]);
      toast.success('Tag criada');

      // Also add to current conversation
      if (selectedConversation) {
        await addTagToConversation(selectedConversation.id, newTag.id);
        loadConversations();
      }
    } catch (error) {
      toast.error('Erro ao criar tag');
    }
  };

  const handleSyncHistory = async (days: number) => {
    if (!selectedConversation) return;
    setSyncingHistory(true);
    try {
      const result = await syncChatHistory({
        connectionId: selectedConversation.connection_id,
        remoteJid: selectedConversation.remote_jid,
        days,
      });

      // Refresh messages and conversations
      const msgs = await getMessages(selectedConversation.id);
      setMessages(msgs);
      loadConversations();

      toast.success(result.message || `Sincronizado (${result.imported} mensagens)`);
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao sincronizar histórico');
    } finally {
      setSyncingHistory(false);
    }
  };

  const handleNewConversationCreated = async (conversation: Conversation) => {
    // Add to list
    setConversations(prev => {
      // Remove if already exists (in case of duplicate)
      const filtered = prev.filter(c => c.id !== conversation.id);
      return [conversation, ...filtered];
    });
    
    // Load full conversation data and select it properly
    try {
      const fullConversation = await getConversation(conversation.id);
      if (fullConversation) {
        await handleSelectConversation(fullConversation);
      } else {
        // Fallback to provided conversation
        await handleSelectConversation(conversation);
      }
    } catch (error) {
      console.error('Error loading new conversation:', error);
      // Still select the conversation even if there's an error
      setSelectedConversation(conversation);
      setMessages([]);
    }
    
    loadConversations();
  };

  return (
    <MainLayout>
      <div className="h-[calc(100vh-120px)] flex rounded-lg border overflow-hidden bg-background shadow-lg">
        {/* Conversation List - Left Panel */}
        <div className="w-[350px] flex-shrink-0">
          <ConversationList
            conversations={conversations}
            selectedId={selectedConversation?.id || null}
            onSelect={handleSelectConversation}
            tags={tags}
            team={team}
            loading={loading}
            onRefresh={loadConversations}
            filters={filters}
            onFiltersChange={setFilters}
            isAdmin={isAdmin}
            connections={connections}
            onNewConversation={() => setNewConversationOpen(true)}
          />
        </div>

        {/* Chat Area - Right Panel */}
        <ChatArea
          conversation={selectedConversation}
          messages={messages}
          loading={loadingMessages}
          sending={sendingMessage}
          tags={tags}
          team={team}
          syncingHistory={syncingHistory}
          isAdmin={isAdmin}
          onSyncHistory={handleSyncHistory}
          onSendMessage={handleSendMessage}
          onLoadMore={handleLoadMoreMessages}
          hasMore={hasMoreMessages}
          onAddTag={handleAddTag}
          onRemoveTag={handleRemoveTag}
          onAssign={handleAssign}
          onArchive={handleArchive}
          onTransfer={handleTransfer}
          onCreateTag={handleCreateTag}
          onDeleteConversation={async () => {
            if (!selectedConversation) return;
            try {
              await api(`/api/chat/conversations/${selectedConversation.id}`, { method: 'DELETE' });
              toast.success('Conversa excluída');
              setSelectedConversation(null);
              setMessages([]);
              loadConversations();
            } catch (error: any) {
              toast.error(error.message || 'Erro ao excluir conversa');
            }
          }}
        />
      </div>

      {/* New Conversation Dialog */}
      <NewConversationDialog
        open={newConversationOpen}
        onOpenChange={setNewConversationOpen}
        connections={connections}
        onConversationCreated={handleNewConversationCreated}
      />
    </MainLayout>
  );
};

export default Chat;
