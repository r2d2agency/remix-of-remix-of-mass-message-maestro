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
import { Search, Send, Loader2, Forward } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatMessage } from "@/hooks/use-chat";
import { getConnectionContactDirectory, type ContactDirectoryItem } from "@/lib/contact-directory";

type ForwardContact = ContactDirectoryItem;

interface ForwardMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectionId?: string;
  messages: ChatMessage[];
  onForward: (targetPhone: string, targetName: string) => Promise<void>;
  loading?: boolean;
}

export function ForwardMessageDialog({
  open,
  onOpenChange,
  connectionId,
  messages,
  onForward,
  loading = false,
}: ForwardMessageDialogProps) {
  const [search, setSearch] = useState("");
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string>("");
  const [forwarding, setForwarding] = useState(false);
  const [contacts, setContacts] = useState<ForwardContact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);

  // Load contacts from all lists + active conversations when dialog opens
  useEffect(() => {
    if (!open) return;

    setSearch("");
    setSelectedPhone(null);
    setSelectedName("");
    setLoadingContacts(true);

    let cancelled = false;

    const loadContacts = async () => {
      try {
        const allContacts = await getConnectionContactDirectory(connectionId || "", true);
        if (!cancelled) {
          setContacts(allContacts);
        }
      } catch {
        if (!cancelled) {
          setContacts([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingContacts(false);
        }
      }
    };

    loadContacts();

    return () => {
      cancelled = true;
    };
  }, [open, connectionId]);

  const filtered = useMemo(() => {
    if (!search) return contacts;
    const term = search.toLowerCase();
    return contacts.filter((c) => 
      c.name.toLowerCase().includes(term) || c.phone.includes(term)
    );
  }, [contacts, search]);

  const handleForward = async () => {
    if (!selectedPhone) return;
    setForwarding(true);
    try {
      await onForward(selectedPhone, selectedName);
      onOpenChange(false);
    } finally {
      setForwarding(false);
    }
  };

  const getMessagePreview = (msg: ChatMessage) => {
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
          <DialogTitle className="flex items-center gap-2">
            <Forward className="h-5 w-5" />
            Encaminhar {messages.length > 1 ? `${messages.length} mensagens` : 'mensagem'}
          </DialogTitle>
          <DialogDescription>
            Selecione um contato da lista para encaminhar
          </DialogDescription>
        </DialogHeader>

        {/* Messages preview */}
        {messages.length > 0 && (
          <div className="p-3 rounded-lg bg-muted border text-sm space-y-1 max-h-[80px] overflow-y-auto">
            {messages.map((msg, i) => (
              <p key={msg.id} className="line-clamp-1 text-muted-foreground text-xs">
                {i + 1}. {getMessagePreview(msg)}
              </p>
            ))}
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar contato por nome ou telefone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Contact list */}
        <ScrollArea className="h-[300px] -mx-2">
          <div className="space-y-0.5 px-2">
            {loadingContacts && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {!loadingContacts && filtered.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhum contato encontrado
              </p>
            )}
            {filtered.map((contact) => {
              const initials = contact.name.slice(0, 2).toUpperCase();
              const isSelected = selectedPhone === contact.phone;

              return (
                <button
                  key={contact.id}
                  className={cn(
                    "w-full flex items-center gap-3 p-2.5 rounded-lg text-left transition-colors",
                    isSelected
                      ? "bg-primary/10 border border-primary/30"
                      : "hover:bg-muted"
                  )}
                  onClick={() => {
                    setSelectedPhone(contact.phone);
                    setSelectedName(contact.name);
                  }}
                >
                  <Avatar className="h-9 w-9 flex-shrink-0">
                    <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{contact.name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {contact.phone}
                      {contact.list_name && ` · ${contact.list_name}`}
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
            disabled={!selectedPhone || forwarding}
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
