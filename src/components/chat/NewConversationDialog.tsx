import { useState, useEffect } from "react";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, MessageSquarePlus, Phone, User } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface Connection {
  id: string;
  name: string;
  phone_number: string | null;
  status: string;
}

interface Conversation {
  id: string;
  connection_id: string;
  remote_jid: string;
  contact_name: string | null;
  contact_phone: string | null;
  last_message_at: string | null;
  unread_count: number;
  is_archived: boolean;
  is_pinned: boolean;
  assigned_to: string | null;
  assigned_name: string | null;
  connection_name: string;
  connection_phone: string | null;
  tags: { id: string; name: string; color: string }[];
  last_message: string | null;
  last_message_type: string | null;
  created_at: string;
}

interface NewConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connections: Connection[];
  onConversationCreated: (conversation: Conversation) => void;
}

export function NewConversationDialog({
  open,
  onOpenChange,
  connections,
  onConversationCreated,
}: NewConversationDialogProps) {
  const [contactPhone, setContactPhone] = useState("");
  const [contactName, setContactName] = useState("");
  const [connectionId, setConnectionId] = useState("");
  const [creating, setCreating] = useState(false);
  const { toast } = useToast();

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setContactPhone("");
      setContactName("");
      // Pre-select first connected connection
      const connectedConnection = connections.find(c => c.status === 'connected');
      setConnectionId(connectedConnection?.id || connections[0]?.id || "");
    }
  }, [open, connections]);

  const handleCreate = async () => {
    if (!contactPhone.trim()) {
      toast({ title: "Digite o número de telefone", variant: "destructive" });
      return;
    }

    if (!connectionId) {
      toast({ title: "Selecione uma conexão", variant: "destructive" });
      return;
    }

    setCreating(true);
    try {
      const conversation = await api<Conversation>('/api/chat/conversations', {
        method: 'POST',
        body: JSON.stringify({
          contact_phone: contactPhone.trim(),
          contact_name: contactName.trim() || undefined,
          connection_id: connectionId,
        }),
      });

      toast({ title: "Conversa criada com sucesso" });
      onConversationCreated(conversation);
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Erro ao criar conversa",
        description: error.message || "Não foi possível criar a conversa",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const activeConnections = connections.filter(c => c.status === 'connected');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquarePlus className="h-5 w-5 text-primary" />
            Nova Conversa
          </DialogTitle>
          <DialogDescription>
            Inicie uma nova conversa com um contato do WhatsApp
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Connection selector */}
          <div className="grid gap-2">
            <Label htmlFor="connection">Conexão WhatsApp</Label>
            <Select value={connectionId} onValueChange={setConnectionId}>
              <SelectTrigger id="connection">
                <SelectValue placeholder="Selecione a conexão" />
              </SelectTrigger>
              <SelectContent>
                {activeConnections.length === 0 ? (
                  <SelectItem value="none" disabled>
                    Nenhuma conexão ativa
                  </SelectItem>
                ) : (
                  activeConnections.map((conn) => (
                    <SelectItem key={conn.id} value={conn.id}>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-500" />
                        {conn.name}
                        {conn.phone_number && (
                          <span className="text-muted-foreground text-xs">
                            ({conn.phone_number})
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Phone number */}
          <div className="grid gap-2">
            <Label htmlFor="phone">Número do Telefone *</Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="phone"
                placeholder="11999999999"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                className="pl-9"
                autoComplete="off"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Digite apenas números, com DDD. Ex: 11999999999
            </p>
          </div>

          {/* Contact name (optional) */}
          <div className="grid gap-2">
            <Label htmlFor="name">Nome do Contato (opcional)</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="name"
                placeholder="Nome do contato"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                className="pl-9"
                autoComplete="off"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
            Cancelar
          </Button>
          <Button onClick={handleCreate} disabled={creating || !connectionId || activeConnections.length === 0}>
            {creating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Criando...
              </>
            ) : (
              <>
                <MessageSquarePlus className="h-4 w-4 mr-2" />
                Iniciar Conversa
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
