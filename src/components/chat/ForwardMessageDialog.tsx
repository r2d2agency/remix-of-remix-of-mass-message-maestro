import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Search, Send, Loader2, Image, FileText, Video, Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import { Conversation, ChatMessage } from "@/hooks/use-chat";

interface ForwardMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: ChatMessage | null;
  conversations: Conversation[];
  currentConversationId?: string;
  onForward: (targetConversationId: string) => Promise<void>;
  loading?: boolean;
}

export function ForwardMessageDialog({
  open,
  onOpenChange,
  message,
  conversations,
  currentConversationId,
  onForward,
  loading = false,
}: ForwardMessageDialogProps) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [forwarding, setForwarding] = useState(false);

  useEffect(() => {
    if (open) {
      setSearch("");
      setSelectedId(null);
    }
  }, [open]);

  const filtered = useMemo(() => {
    return conversations
      .filter((c) => c.id !== currentConversationId)
      .filter((c) => {
        if (!search) return true;
        const term = search.toLowerCase();
        const name = (c.contact_name || c.group_name || c.contact_phone || "").toLowerCase();
        return name.includes(term);
      });
  }, [conversations, currentConversationId, search]);

  const handleForward = async () => {
    if (!selectedId) return;
    setForwarding(true);
    try {
      await onForward(selectedId);
      onOpenChange(false);
    } finally {
      setForwarding(false);
    }
  };

  const getMessagePreview = (msg: ChatMessage | null) => {
    if (!msg) return "";
    if (msg.message_type === "image") return "📷 Imagem";
    if (msg.message_type === "video") return "🎥 Vídeo";
    if (msg.message_type === "audio") return "🎤 Áudio";
    if (msg.message_type === "document") return `📄 ${msg.content || "Documento"}`;
    return msg.content || "";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Encaminhar mensagem</DialogTitle>
          <DialogDescription>
            Selecione a conversa de destino
          </DialogDescription>
        </DialogHeader>

        {/* Message preview */}
        {message && (
          <div className="p-3 rounded-lg bg-muted border text-sm">
            <p className="line-clamp-3 text-muted-foreground">
              {getMessagePreview(message)}
            </p>
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar conversa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Conversation list */}
        <ScrollArea className="h-[300px] -mx-2">
          <div className="space-y-0.5 px-2">
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhuma conversa encontrada
              </p>
            )}
            {filtered.map((conv) => {
              const name = conv.contact_name || conv.group_name || conv.contact_phone || "Desconhecido";
              const initials = name.slice(0, 2).toUpperCase();
              const isSelected = selectedId === conv.id;

              return (
                <button
                  key={conv.id}
                  className={cn(
                    "w-full flex items-center gap-3 p-2.5 rounded-lg text-left transition-colors",
                    isSelected
                      ? "bg-primary/10 border border-primary/30"
                      : "hover:bg-muted"
                  )}
                  onClick={() => setSelectedId(conv.id)}
                >
                  <Avatar className="h-9 w-9 flex-shrink-0">
                    <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{name}</span>
                      {conv.is_group && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1">
                          Grupo
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {conv.connection_name}
                      {conv.last_message && ` · ${conv.last_message}`}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleForward}
            disabled={!selectedId || forwarding}
          >
            {forwarding ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Encaminhar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
