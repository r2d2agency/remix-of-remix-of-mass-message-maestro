import { useState, useEffect, useRef, useCallback } from "react";
import { Bell, BellOff, Volume2, VolumeX, X, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/lib/api";
import { chatEvents } from "@/lib/chat-events";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNotificationSound } from "@/hooks/use-notification-sound";

interface UnreadConversation {
  id: string;
  contact_name: string | null;
  contact_phone: string | null;
  unread_count: number;
  last_message: string | null;
  last_message_type: string | null;
  last_message_at: string | null;
  connection_name: string;
  attendance_status?: string | null;
  created_at?: string | null;
}

function formatMessagePreviewStatic(conv: UnreadConversation): string {
  if (!conv.last_message && !conv.last_message_type) return "Nova mensagem";
  if (conv.last_message_type === "audio") return "🎤 Áudio";
  if (conv.last_message_type === "image") return "📷 Imagem";
  if (conv.last_message_type === "video") return "🎥 Vídeo";
  if (conv.last_message_type === "document") return "📄 Documento";
  return conv.last_message?.slice(0, 50) || "Nova mensagem";
}

export function MessageNotifications() {
  const [unreadConversations, setUnreadConversations] = useState<UnreadConversation[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const saved = localStorage.getItem("notification-sound-enabled");
    return saved !== "false"; // Default to true
  });
  const [isOpen, setIsOpen] = useState(false);
  const previousUnreadRef = useRef<number>(0);
  const previousConversationIdsRef = useRef<Set<string>>(new Set());
  
  const { playSound, playNewConversationSound, showPushNotification, settings } = useNotificationSound();

  // Save sound preference
  useEffect(() => {
    localStorage.setItem("notification-sound-enabled", soundEnabled.toString());
  }, [soundEnabled]);

  // Fetch unread conversations
  const fetchUnreadConversations = useCallback(async (emitEvent = false) => {
    try {
      const data = await api<UnreadConversation[]>("/api/chat/conversations/unread");
      setUnreadConversations(data);
      
      const newTotal = data.reduce((sum, c) => sum + c.unread_count, 0);
      const currentIds = new Set(data.map(c => c.id));
      
      // Check for brand new conversations (IDs that weren't in previous list)
      const newConversationIds = [...currentIds].filter(id => !previousConversationIdsRef.current.has(id));
      const hasNewConversations = newConversationIds.length > 0 && previousConversationIdsRef.current.size > 0;
      
      // Check for new messages in existing conversations
      const hasNewMessagesInExisting = newTotal > previousUnreadRef.current && !hasNewConversations;
      
      // Play appropriate sound
      if (soundEnabled && settings.soundEnabled && previousUnreadRef.current >= 0) {
        if (hasNewConversations) {
          // New conversation entering the queue - play special double sound
          console.log('[Notifications] New conversation detected:', newConversationIds);
          playNewConversationSound();

          // Push notification for new conversations
          const newConvs = data.filter(c => newConversationIds.includes(c.id));
          newConvs.forEach(conv => {
            const name = conv.contact_name || conv.contact_phone || 'Novo contato';
            showPushNotification(`💬 Nova conversa: ${name}`, {
              body: formatMessagePreviewStatic(conv) || 'Nova mensagem recebida',
              tag: `new-conv-${conv.id}`,
            });
          });
        } else if (hasNewMessagesInExisting && previousUnreadRef.current > 0) {
          // New message in existing conversation - play regular sound
          playSound();

          // Push notification for new messages (only when app not focused)
          if (document.hidden || !document.hasFocus()) {
            const updatedConvs = data.filter(c => {
              const prev = [...previousConversationIdsRef.current];
              return prev.includes(c.id);
            });
            // Show push for the conversation with latest message
            if (updatedConvs.length > 0) {
              const latest = updatedConvs.sort((a, b) => 
                new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime()
              )[0];
              const name = latest.contact_name || latest.contact_phone || 'Contato';
              showPushNotification(`📩 ${name}`, {
                body: formatMessagePreviewStatic(latest) || 'Nova mensagem',
                tag: `msg-${latest.id}`,
              });
            }
          }
        }
      }
      
      // Broadcast to other components to refresh immediately
      if (emitEvent && (hasNewConversations || hasNewMessagesInExisting)) {
        chatEvents.emit('new_message');
      }
      
      previousConversationIdsRef.current = currentIds;
      previousUnreadRef.current = newTotal;
      setTotalUnread(newTotal);
    } catch (error) {
      console.error("Error fetching unread conversations:", error);
    }
  }, [soundEnabled, settings.soundEnabled, playSound, playNewConversationSound, showPushNotification]);

  // Poll for unread messages - faster polling (every 3 seconds)
  useEffect(() => {
    fetchUnreadConversations(false); // Initial fetch without event
    
    const interval = setInterval(() => fetchUnreadConversations(true), 3000);
    
    return () => clearInterval(interval);
  }, [fetchUnreadConversations]);

  // Clear notification for a conversation
  const handleClearNotification = async (conversationId: string) => {
    try {
      await api(`/api/chat/conversations/${conversationId}/read`, { method: "POST" });
      setUnreadConversations(prev => prev.filter(c => c.id !== conversationId));
      setTotalUnread(prev => {
        const conv = unreadConversations.find(c => c.id === conversationId);
        return Math.max(0, prev - (conv?.unread_count || 0));
      });
    } catch (error) {
      console.error("Error marking as read:", error);
    }
  };

  // Navigate to conversation
  const handleGoToConversation = (conversationId: string) => {
    setIsOpen(false);
    // Navigate to chat page - the conversation will be selected there
    window.location.href = `/chat?conversation=${conversationId}`;
  };

  const formatMessagePreview = (conv: UnreadConversation) => {
    if (!conv.last_message && !conv.last_message_type) return "Nova mensagem";
    
    if (conv.last_message_type === "audio") return "🎤 Áudio";
    if (conv.last_message_type === "image") return "📷 Imagem";
    if (conv.last_message_type === "video") return "🎥 Vídeo";
    if (conv.last_message_type === "document") return "📄 Documento";
    
    return conv.last_message?.slice(0, 50) || "Nova mensagem";
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9"
        >
          {totalUnread > 0 ? (
            <Bell className="h-5 w-5 text-primary animate-pulse" />
          ) : (
            <Bell className="h-5 w-5 text-muted-foreground" />
          )}
          {totalUnread > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 text-[10px] font-bold"
            >
              {totalUnread > 99 ? "99+" : totalUnread}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-[calc(100vw-1rem)] max-w-80 p-0 mx-2 sm:mx-0 sm:w-80" 
        align="end"
        sideOffset={8}
      >
        <div className="flex items-center justify-between p-3 border-b">
          <h4 className="font-semibold text-sm flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            <span className="truncate">Mensagens não lidas</span>
          </h4>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 sm:h-7 sm:w-7"
              onClick={() => setSoundEnabled(!soundEnabled)}
              title={soundEnabled ? "Desativar som" : "Ativar som"}
            >
              {soundEnabled ? (
                <Volume2 className="h-4 w-4 text-primary" />
              ) : (
                <VolumeX className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>
          </div>
        </div>

        <ScrollArea className="max-h-[60vh] sm:max-h-[300px]">
          {unreadConversations.length === 0 ? (
            <div className="p-6 sm:p-4 text-center text-sm text-muted-foreground">
              <BellOff className="h-10 w-10 sm:h-8 sm:w-8 mx-auto mb-2 opacity-50" />
              Nenhuma mensagem não lida
            </div>
          ) : (
            <div className="divide-y">
              {unreadConversations.map((conv) => (
                <div
                  key={conv.id}
                  className="p-3 sm:p-3 hover:bg-muted/50 active:bg-muted/70 cursor-pointer transition-colors group"
                  onClick={() => handleGoToConversation(conv.id)}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-11 h-11 sm:w-10 sm:h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <MessageSquare className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-sm truncate">
                          {conv.contact_name || conv.contact_phone || "Desconhecido"}
                        </p>
                        <Badge variant="secondary" className="text-[10px] flex-shrink-0">
                          {conv.unread_count}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {formatMessagePreview(conv)}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5 sm:mt-1">
                        <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">
                          {conv.connection_name}
                        </span>
                        {conv.last_message_at && (
                          <>
                            <span className="text-[10px] text-muted-foreground">•</span>
                            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                              {format(new Date(conv.last_message_at), "HH:mm", { locale: ptBR })}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 sm:h-6 sm:w-6 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 flex-shrink-0 -mr-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleClearNotification(conv.id);
                      }}
                      title="Marcar como lida"
                    >
                      <X className="h-4 w-4 sm:h-3 sm:w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {unreadConversations.length > 0 && (
          <div className="p-2 border-t">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-sm sm:text-xs h-10 sm:h-8"
              onClick={() => {
                setIsOpen(false);
                window.location.href = "/chat";
              }}
            >
              Ver todas as conversas
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
