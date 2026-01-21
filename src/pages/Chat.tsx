import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { ConversationList } from "@/components/chat/ConversationList";
import { ChatArea } from "@/components/chat/ChatArea";
import { NewConversationDialog } from "@/components/chat/NewConversationDialog";
import { useChat, Conversation, ChatMessage, ConversationTag, TeamMember } from "@/hooks/use-chat";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { chatEvents } from "@/lib/chat-events";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageSquare, Users } from "lucide-react";

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
    is_group: false, // false = individual chats, true = group chats
  });
  const [activeTab, setActiveTab] = useState<'chats' | 'groups'>('chats');

  // Keep latest loader for intervals / effects without stale closures
  const loadConversationsRef = useRef<() => void>(() => {});
  // Keep a just-created "empty" conversation visible until it has messages
  const stickyConversationRef = useRef<Conversation | null>(null);

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

  // Reload when filters or activeTab change
  useEffect(() => {
    loadConversationsRef.current();
  }, [filters, activeTab]);

  // Auto-refresh conversations every 8 seconds (backup - events handle immediate updates)
  useEffect(() => {
    const interval = setInterval(() => {
      loadConversationsRef.current();
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  // Subscribe to chat events for immediate updates
  useEffect(() => {
    const unsubscribe = chatEvents.subscribe('new_message', () => {
      // Immediate refresh when notification detects new message
      loadConversationsRef.current();
      
      // Also refresh messages if a conversation is selected
      if (selectedConversation) {
        getMessages(selectedConversation.id).then(setMessages).catch(console.error);
      }
    });

    return unsubscribe;
  }, [selectedConversation, getMessages]);

  // Listen for refresh-conversations event (from contact edit, etc.)
  useEffect(() => {
    const handleRefresh = () => {
      loadConversationsRef.current();
    };
    
    window.addEventListener('refresh-conversations', handleRefresh);
    return () => window.removeEventListener('refresh-conversations', handleRefresh);
  }, []);

  // Auto-refresh messages every 3 seconds when conversation is selected
  useEffect(() => {
    if (!selectedConversation) return;

    const interval = setInterval(async () => {
      try {
        const msgs = await getMessages(selectedConversation.id);
        setMessages(msgs);
      } catch (error) {
        console.error('Error refreshing messages:', error);
      }
    }, 3000);

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
      filterParams.is_group = activeTab === 'groups' ? 'true' : 'false';

      const data = await getConversations(filterParams);

      const sticky = stickyConversationRef.current;
      const keepEmptySelected = !!selectedConversation && !selectedConversation.last_message_at;
      const keepSticky = !!sticky && !sticky.last_message_at;

      // Merge in "empty" conversations we want to keep visible
      let merged = data;
      if (keepEmptySelected && !merged.some(c => c.id === selectedConversation!.id)) {
        merged = [selectedConversation!, ...merged];
      }
      if (keepSticky && !merged.some(c => c.id === sticky!.id)) {
        merged = [sticky!, ...merged];
      }

      setConversations(merged);

      // Clear sticky once it is naturally returned by the backend (or has messages)
      if (sticky && (sticky.last_message_at || data.some(c => c.id === sticky.id))) {
        stickyConversationRef.current = null;
      }

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
  }, [getConversations, filters, selectedConversation, activeTab]);

  // Keep ref pointing to the latest loadConversations (used by intervals above)
  useEffect(() => {
    loadConversationsRef.current = loadConversations;
  }, [loadConversations]);

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
    // Keep it visible even if it has no messages yet
    stickyConversationRef.current = conversation;

    // Add to list immediately
    setConversations(prev => {
      const filtered = prev.filter(c => c.id !== conversation.id);
      return [conversation, ...filtered];
    });

    // Load full conversation data and select it properly
    try {
      const fullConversation = await getConversation(conversation.id);
      if (fullConversation) {
        stickyConversationRef.current = fullConversation;
        await handleSelectConversation(fullConversation);
      } else {
        await handleSelectConversation(conversation);
      }
    } catch (error) {
      console.error('Error loading new conversation:', error);
      setSelectedConversation(conversation);
      setMessages([]);
    }

    // Refresh list (will keep sticky if backend still hides empties)
    loadConversationsRef.current();
  };

  return (
    <MainLayout>
      <div className="h-[calc(100vh-120px)] flex flex-col rounded-lg border overflow-hidden bg-background shadow-lg">
        {/* Tab Header */}
        <div className="border-b px-4 py-2 bg-muted/30 flex-shrink-0">
           <Tabs value={activeTab} onValueChange={(v) => {
             setActiveTab(v as 'chats' | 'groups');
             setSelectedConversation(null);
             setMessages([]);

             // Force immediate reload on tab switch (otherwise user waits for interval)
             setTimeout(() => {
               loadConversationsRef.current();
             }, 0);
           }}>
            <TabsList className="grid w-[260px] grid-cols-2">
              <TabsTrigger value="chats" className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Conversas
              </TabsTrigger>
              <TabsTrigger value="groups" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Grupos
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex flex-1 overflow-hidden">
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
              onNewConversation={activeTab === 'chats' ? () => setNewConversationOpen(true) : undefined}
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
