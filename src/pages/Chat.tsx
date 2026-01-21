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
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface UserProfile {
  user?: {
    role?: string;
  };
}

const Chat = () => {
  const location = useLocation();
  const isMobile = useIsMobile();

  const {
    loading,
    getConversations,
    getConversation,
    updateConversation,
    markAsRead,
    transferConversation,
    pinConversation,
    acceptConversation,
    releaseConversation,
    getConnections,
    getMessages,
    sendMessage,
    getTags,
    createTag,
    addTagToConversation,
    removeTagFromConversation,
    getTeam,
    syncChatHistory,
    syncGroupName,
    startAlertsPolling,
    stopAlertsPolling,
    getAttendanceCounts,
  } = useChat();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [tags, setTags] = useState<ConversationTag[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [connections, setConnections] = useState<{ id: string; name: string; phone_number: string | null; status: string }[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userRole, setUserRole] = useState<string>('');
  
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [syncingHistory, setSyncingHistory] = useState(false);
  const [newConversationOpen, setNewConversationOpen] = useState(false);
  const [attendanceCounts, setAttendanceCounts] = useState<{ waiting: number; attending: number }>({ waiting: 0, attending: 0 });
  const [filters, setFilters] = useState({
    search: '',
    tag: 'all',
    assigned: 'all',
    archived: false,
    connection: 'all',
    is_group: false, // false = individual chats, true = group chats
    attendance_status: 'attending' as 'waiting' | 'attending',
  });
  const [activeTab, setActiveTab] = useState<'chats' | 'groups'>('chats');

  // Keep latest loader for intervals / effects without stale closures
  const loadConversationsRef = useRef<() => void>(() => {});
  // Keep a just-created "empty" conversation visible until it has messages
  const stickyConversationRef = useRef<Conversation | null>(null);
  // Prevent race conditions during conversation loading
  const isLoadingConversationsRef = useRef(false);
  // Track the currently selected conversation ID to prevent stale updates
  const selectedIdRef = useRef<string | null>(null);

  // Load initial data and start alerts polling
  useEffect(() => {
    loadConversations();
    loadTags();
    loadTeam();
    loadConnections();
    loadAttendanceCounts();
    checkUserRole();
    startAlertsPolling();

    return () => {
      stopAlertsPolling();
    };
  }, []);

  // Load attendance counts
  const loadAttendanceCounts = useCallback(async () => {
    const isGroup = activeTab === 'groups';
    const counts = await getAttendanceCounts(isGroup);
    setAttendanceCounts(counts);
  }, [activeTab, getAttendanceCounts]);

  const checkUserRole = async () => {
    try {
      const profile = await api<UserProfile>('/api/auth/me');
      const role = profile.user?.role || '';
      setUserRole(role);
      setIsAdmin(['owner', 'admin'].includes(role));
    } catch (error) {
      console.error('Error checking user role:', error);
    }
  };

  // Auto-refresh conversations every 15 seconds (backup - events handle immediate updates)
  // Increased from 8s to 15s to reduce flickering
  useEffect(() => {
    const interval = setInterval(() => {
      loadConversationsRef.current();
    }, 15000);
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
    // Prevent overlapping loads
    if (isLoadingConversationsRef.current) return;
    isLoadingConversationsRef.current = true;
    
    try {
      const filterParams: any = {};
      if (filters.search) filterParams.search = filters.search;
      if (filters.tag !== 'all') filterParams.tag = filters.tag;
      if (filters.assigned !== 'all') filterParams.assigned = filters.assigned;
      if (filters.connection !== 'all') filterParams.connection = filters.connection;
      filterParams.archived = filters.archived;
      filterParams.is_group = activeTab === 'groups' ? 'true' : 'false';
      filterParams.attendance_status = filters.attendance_status;

      const data = await getConversations(filterParams);

      const sticky = stickyConversationRef.current;

      // Merge in "empty" conversations we want to keep visible
      let merged = data;
      
      // Keep sticky conversation visible if it has no messages yet
      if (sticky && !sticky.last_message_at && !merged.some(c => c.id === sticky.id)) {
        merged = [sticky, ...merged];
      }

      setConversations(merged);

      // Clear sticky once it is naturally returned by the backend (or has messages)
      if (sticky && (sticky.last_message_at || data.some(c => c.id === sticky.id))) {
        stickyConversationRef.current = null;
      }

      // Update selected conversation if it exists (only if ID matches to avoid race conditions)
      const currentSelectedId = selectedIdRef.current;
      if (currentSelectedId) {
        const updated = merged.find(c => c.id === currentSelectedId);
        if (updated) {
          setSelectedConversation(prev => {
            // Only update if it's still the same conversation
            if (prev?.id === currentSelectedId) {
              return updated;
            }
            return prev;
          });
        }
      }

      // Also refresh attendance counts
      loadAttendanceCounts();
    } catch (error) {
      console.error('Error loading conversations:', error);
    } finally {
      isLoadingConversationsRef.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getConversations, filters.search, filters.tag, filters.assigned, filters.connection, filters.archived, filters.attendance_status, activeTab, loadAttendanceCounts]);

  // Keep ref pointing to the latest loadConversations (used by intervals above)
  useEffect(() => {
    loadConversationsRef.current = loadConversations;
  }, [loadConversations]);

  // Reload immediately when filters or activeTab change
  // Note: loadConversations deps are now stable so this only triggers on actual filter changes
  useEffect(() => {
    loadConversations();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.search, filters.tag, filters.assigned, filters.connection, filters.archived, filters.attendance_status, activeTab]);

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
    // Update the ref immediately to prevent race conditions
    selectedIdRef.current = conversation.id;
    
    setSelectedConversation(conversation);
    setMessages([]);
    setLoadingMessages(true);

    try {
      // Check if we're still looking at the same conversation
      if (selectedIdRef.current !== conversation.id) {
        return; // User switched to another conversation
      }
      
      const msgs = await getMessages(conversation.id);
      
      // Verify again after async call
      if (selectedIdRef.current !== conversation.id) {
        return; // User switched to another conversation
      }
      
      setMessages(msgs);
      setHasMoreMessages(msgs.length >= 50);

      // Mark as read
      if (conversation.unread_count > 0) {
        await markAsRead(conversation.id);
        // Don't call loadConversations here to avoid loop - it will be refreshed by interval
      }

      // For groups without a name, try to sync from W-API
      if (conversation.is_group && !conversation.group_name) {
        syncGroupName(conversation.connection_id, conversation.id).then(result => {
          // Verify we're still on the same conversation
          if (selectedIdRef.current !== conversation.id) return;
          
          if (result.success && result.group_name) {
            // Update the conversation locally
            setSelectedConversation(prev => 
              prev?.id === conversation.id 
                ? { ...prev, group_name: result.group_name } 
                : prev
            );
            setConversations(prev => 
              prev.map(c => 
                c.id === conversation.id 
                  ? { ...c, group_name: result.group_name } 
                  : c
              )
            );
          }
        }).catch(console.error);
      }
    } catch (error) {
      // Only show error if we're still on the same conversation
      if (selectedIdRef.current === conversation.id) {
        console.error('Error loading messages:', error);
        toast.error('Erro ao carregar mensagens');
      }
    } finally {
      // Only update loading state if we're still on the same conversation
      if (selectedIdRef.current === conversation.id) {
        setLoadingMessages(false);
      }
    }
  }, [getMessages, markAsRead, syncGroupName]);

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
      selectedIdRef.current = null; // Clear ref when archiving
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

  const handleAcceptConversation = async (conversationId: string) => {
    try {
      await acceptConversation(conversationId);
      loadConversations();
      toast.success('Conversa aceita');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao aceitar conversa');
    }
  };

  const handleReleaseConversation = async () => {
    if (!selectedConversation) return;
    try {
      await releaseConversation(selectedConversation.id);
      selectedIdRef.current = null;
      setSelectedConversation(null);
      setMessages([]);
      loadConversations();
      toast.success('Conversa liberada para aguardando');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao liberar conversa');
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
      selectedIdRef.current = conversation.id;
      setSelectedConversation(conversation);
      setMessages([]);
    }

    // Refresh list (will keep sticky if backend still hides empties)
    loadConversationsRef.current();
  };

  // Mobile: go back to conversation list
  const handleMobileBack = () => {
    selectedIdRef.current = null;
    setSelectedConversation(null);
    setMessages([]);
  };

  // Mobile-aware conversation selection
  const handleMobileSelectConversation = useCallback(async (conversation: Conversation) => {
    await handleSelectConversation(conversation);
  }, [handleSelectConversation]);

  return (
    <MainLayout>
      <div className="h-[calc(100vh-120px)] flex flex-col rounded-lg border overflow-hidden bg-background shadow-lg">
        {/* Tab Header - Hide on mobile when chat is open */}
        {(!isMobile || !selectedConversation) && (
          <div className="border-b px-4 py-2 bg-muted/30 flex-shrink-0">
             <Tabs value={activeTab} onValueChange={(v) => {
                setActiveTab(v as 'chats' | 'groups');
                selectedIdRef.current = null;
                setSelectedConversation(null);
                setMessages([]);
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
        )}

        <div className="flex flex-1 overflow-hidden">
          {/* Conversation List - Hide on mobile when chat is open */}
          {(!isMobile || !selectedConversation) && (
            <div className={cn(
              "flex-shrink-0",
              isMobile ? "w-full" : "w-[350px]"
            )}>
              <ConversationList
                conversations={conversations}
                selectedId={selectedConversation?.id || null}
                onSelect={handleMobileSelectConversation}
                tags={tags}
                team={team}
                loading={loading}
                onRefresh={loadConversations}
                filters={filters}
                onFiltersChange={setFilters}
                isAdmin={isAdmin}
                connections={connections}
                onNewConversation={activeTab === 'chats' ? () => setNewConversationOpen(true) : undefined}
                onAcceptConversation={handleAcceptConversation}
                attendanceCounts={attendanceCounts}
              />
            </div>
          )}

          {/* Chat Area - Full width on mobile, show back button */}
          {(!isMobile || selectedConversation) && (
            <ChatArea
              conversation={selectedConversation}
              messages={messages}
              loading={loadingMessages}
              sending={sendingMessage}
              tags={tags}
              team={team}
              syncingHistory={syncingHistory}
              isAdmin={isAdmin}
              userRole={userRole}
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
              onReleaseConversation={handleReleaseConversation}
              isMobile={isMobile}
              onMobileBack={handleMobileBack}
            />
          )}
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
