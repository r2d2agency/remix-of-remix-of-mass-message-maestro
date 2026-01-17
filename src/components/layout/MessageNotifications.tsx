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
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface UnreadConversation {
  id: string;
  contact_name: string | null;
  contact_phone: string | null;
  unread_count: number;
  last_message: string | null;
  last_message_type: string | null;
  last_message_at: string | null;
  connection_name: string;
}

export function MessageNotifications() {
  const [unreadConversations, setUnreadConversations] = useState<UnreadConversation[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const saved = localStorage.getItem("notification-sound-enabled");
    return saved !== "false"; // Default to true
  });
  const [isOpen, setIsOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previousUnreadRef = useRef<number>(0);

  // Initialize audio
  useEffect(() => {
    // Create audio element for notification sound
    audioRef.current = new Audio();
    // Use a simple beep sound (base64 encoded short beep)
    audioRef.current.src = "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2Onpehk35wc3Z9g46dmqOah3JiaXqHmKOmoZuQgXJoaXqInpmkoZiPgXVqanqInZelpZePgXZranmHm5ykpZePg3dta3mGmpqjopiQhHlwbXiEmZiioZiRhXtycXeClpagoJeRhnx0c3aAlZSen5aRh3x1dXWAlJKdnZWQhn12dnaAk5GcnJSQhn52d3Z/kpCbm5OPhn93eHZ+kI+amZKOhn94eXd+j46ZmJGNhX94end9jo2Xl5CMhX95e3h9jYyWlpCLhX96fHl8jIuVlI+Kgn97fXp8i4qUk46KgX97fnt7ioiTko2JgX97f3x7iYeSkYyIgH57gH17iIaRkIuHf356gX57h4WQj4qGfn57gn56hoSPjoqFfX18g397hYOOjYmEfX19hH97hIKNjIiDfH1+hX96g4GMi4eCe31/hn96goGLioaCe32Ah396gYCKiYWBen6BiH95gH+JiIWAen6Cinn5f36IhoR/eX6EjHr4fn2HhYN+eH6Fjnv3fXyGhIJ9d36Hj3z2fHuFg4F8dn6Ikn31e3qEgn97dn6Jk372enmDgX56dX6LlX/1eHiCgH15dH6Ml4D0d3eBf3x4c32NmYHzdXaAfnx4cnuPnILyc3V/fnx4cHqRnoPwcnR+fnx4b3mTn4Tub3N9fnx4bniVoYXta3J8fnx4a3eXo4bsanF7fXx4a3WZpYfqaHB6fXx4anObpojpZm95fHx4aXGdqInmZG54fHx4aG+fqorjYm13fHx4Z22hq4vhYGx2e3x4Zmuja4zeXmt1e3x4ZWmlbYvcXGp0e3x4ZGenborfWml0e3x4Y2apboveWGhze3x4Ymanb43cV2dze3x4YWWpb47aVmZyenx4YGOqcI/YVWVyenx4X2GscpDWVGRxeXx4XmCuc5HSU2NxeXx4XV6vc5PQUmJweHx4XF2wdZTOUWFweHx4W1uxdpXMUGBvd3x4Wlqyd5bKT19vd3x4WVi0eJjIT15udnx4WFe1eZnGTl1tdn14V1a3epvETlxsdn14Vla3e5zCTVtsdX14VVS5fJ3ATFprdX14VFO6fZ++S1lqdX14U1K8fp+8SlhpdHx4UlG9gKC6SFdoc3x4UVC+gKG4R1ZncnxUQQAA";
    audioRef.current.volume = 0.5;
    
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Save sound preference
  useEffect(() => {
    localStorage.setItem("notification-sound-enabled", soundEnabled.toString());
  }, [soundEnabled]);

  // Fetch unread conversations
  const fetchUnreadConversations = useCallback(async () => {
    try {
      const data = await api<UnreadConversation[]>("/api/chat/conversations/unread");
      setUnreadConversations(data);
      
      const newTotal = data.reduce((sum, c) => sum + c.unread_count, 0);
      
      // Play sound if there are new unread messages
      if (soundEnabled && newTotal > previousUnreadRef.current && previousUnreadRef.current > 0) {
        playNotificationSound();
      }
      
      previousUnreadRef.current = newTotal;
      setTotalUnread(newTotal);
    } catch (error) {
      console.error("Error fetching unread conversations:", error);
    }
  }, [soundEnabled]);

  // Play notification sound
  const playNotificationSound = useCallback(() => {
    if (audioRef.current && soundEnabled) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {
        // Ignore autoplay errors (browser policy)
      });
    }
  }, [soundEnabled]);

  // Poll for unread messages
  useEffect(() => {
    fetchUnreadConversations();
    
    const interval = setInterval(fetchUnreadConversations, 10000); // Every 10 seconds
    
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
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between p-3 border-b">
          <h4 className="font-semibold text-sm flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Mensagens não lidas
          </h4>
          <div className="flex items-center gap-2">
            <Label htmlFor="sound-toggle" className="sr-only">
              Som de notificação
            </Label>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
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

        <ScrollArea className="max-h-[300px]">
          {unreadConversations.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              <BellOff className="h-8 w-8 mx-auto mb-2 opacity-50" />
              Nenhuma mensagem não lida
            </div>
          ) : (
            <div className="divide-y">
              {unreadConversations.map((conv) => (
                <div
                  key={conv.id}
                  className="p-3 hover:bg-muted/50 cursor-pointer transition-colors group"
                  onClick={() => handleGoToConversation(conv.id)}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
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
                      <p className="text-xs text-muted-foreground truncate">
                        {formatMessagePreview(conv)}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-muted-foreground">
                          {conv.connection_name}
                        </span>
                        {conv.last_message_at && (
                          <>
                            <span className="text-[10px] text-muted-foreground">•</span>
                            <span className="text-[10px] text-muted-foreground">
                              {format(new Date(conv.last_message_at), "HH:mm", { locale: ptBR })}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 flex-shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleClearNotification(conv.id);
                      }}
                      title="Marcar como lida"
                    >
                      <X className="h-3 w-3" />
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
              className="w-full text-xs"
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
