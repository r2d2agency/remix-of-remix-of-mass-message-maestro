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
import { Search, Send, Loader2, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { getContactDirectory, type ContactDirectoryItem } from "@/lib/contact-directory";

type SavedContact = ContactDirectoryItem;

interface ShareContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onShare: (contactName: string, contactPhone: string) => Promise<void>;
}

export function ShareContactDialog({
  open,
  onOpenChange,
  onShare,
}: ShareContactDialogProps) {
  const [search, setSearch] = useState("");
  const [selectedContact, setSelectedContact] = useState<SavedContact | null>(null);
  const [sharing, setSharing] = useState(false);
  const [contacts, setContacts] = useState<SavedContact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);

  useEffect(() => {
    if (!open) return;

    setSearch("");
    setSelectedContact(null);
    setLoadingContacts(true);

    let cancelled = false;

    const loadContacts = async () => {
      try {
        const allContacts = await getContactDirectory(true);
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
  }, [open]);

  const filtered = useMemo(() => {
    if (!search) return contacts;
    const term = search.toLowerCase();
    return contacts.filter((c) =>
      c.name.toLowerCase().includes(term) || c.phone.includes(term)
    );
  }, [contacts, search]);

  const handleShare = async () => {
    if (!selectedContact) return;
    setSharing(true);
    try {
      await onShare(selectedContact.name, selectedContact.phone);
      onOpenChange(false);
    } finally {
      setSharing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5" />
            Compartilhar contato
          </DialogTitle>
          <DialogDescription>
            Selecione um contato salvo para enviar
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar contato..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

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
              const isSelected = selectedContact?.id === contact.id;

              return (
                <button
                  key={contact.id}
                  className={cn(
                    "w-full flex items-center gap-3 p-2.5 rounded-lg text-left transition-colors",
                    isSelected
                      ? "bg-primary/10 border border-primary/30"
                      : "hover:bg-muted"
                  )}
                  onClick={() => setSelectedContact(contact)}
                >
                  <Avatar className="h-9 w-9 flex-shrink-0">
                    <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium truncate block">{contact.name}</span>
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
            onClick={handleShare}
            disabled={!selectedContact || sharing}
          >
            {sharing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Enviar contato
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
