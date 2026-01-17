import { useState, useEffect, useCallback } from "react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BookUser, Loader2, MessageSquarePlus, Phone, Plus, Search, User } from "lucide-react";
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

interface ChatContact {
  id: string;
  name: string;
  phone: string;
  jid: string | null;
  connection_id: string;
  connection_name: string;
  has_conversation: boolean;
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
  const [activeTab, setActiveTab] = useState("agenda");
  
  // Manual entry state
  const [contactPhone, setContactPhone] = useState("");
  const [contactName, setContactName] = useState("");
  const [connectionId, setConnectionId] = useState("");
  const [creating, setCreating] = useState(false);
  
  // Agenda search state
  const [agendaSearch, setAgendaSearch] = useState("");
  const [agendaContacts, setAgendaContacts] = useState<ChatContact[]>([]);
  const [loadingAgenda, setLoadingAgenda] = useState(false);
  const [agendaConnectionFilter, setAgendaConnectionFilter] = useState("all");
  
  const { toast } = useToast();

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setContactPhone("");
      setContactName("");
      setAgendaSearch("");
      setActiveTab("agenda");
      // Pre-select first connected connection
      const connectedConnection = connections.find(c => c.status === 'connected');
      setConnectionId(connectedConnection?.id || connections[0]?.id || "");
      setAgendaConnectionFilter("all");
      loadAgendaContacts();
    }
  }, [open, connections]);

  const loadAgendaContacts = useCallback(async (search?: string, connection?: string) => {
    setLoadingAgenda(true);
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (connection && connection !== 'all') params.append('connection', connection);
      
      const data = await api<ChatContact[]>(`/api/chat/contacts?${params.toString()}`);
      setAgendaContacts(data);
    } catch (error) {
      console.error('Error loading agenda contacts:', error);
    } finally {
      setLoadingAgenda(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    
    const timer = setTimeout(() => {
      loadAgendaContacts(agendaSearch, agendaConnectionFilter);
    }, 300);
    
    return () => clearTimeout(timer);
  }, [agendaSearch, agendaConnectionFilter, open, loadAgendaContacts]);

  const handleSelectFromAgenda = async (contact: ChatContact) => {
    setCreating(true);
    try {
      const conversation = await api<Conversation & { existed?: boolean }>('/api/chat/conversations', {
        method: 'POST',
        body: {
          contact_phone: contact.phone,
          contact_name: contact.name,
          connection_id: contact.connection_id,
        },
      });

      if (conversation.existed) {
        toast({ title: "Conversa existente encontrada", description: "Abrindo conversa com este contato" });
      } else {
        toast({ title: "Conversa iniciada com sucesso" });
      }
      
      onConversationCreated(conversation);
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error creating conversation:', error);
      toast({
        title: "Erro ao iniciar conversa",
        description: error.message || "Não foi possível iniciar a conversa",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleCreateManual = async () => {
    if (!contactPhone.trim()) {
      toast({ title: "Digite o número de telefone", variant: "destructive" });
      return;
    }

    if (!connectionId) {
      toast({ title: "Selecione uma conexão", variant: "destructive" });
      return;
    }

    // Validate connection is active
    const selectedConnection = connections.find(c => c.id === connectionId);
    if (!selectedConnection || selectedConnection.status !== 'connected') {
      toast({ title: "Conexão não está ativa", description: "Selecione uma conexão conectada", variant: "destructive" });
      return;
    }

    // Validate phone - at least 10 digits (DDD + number)
    const cleanPhone = contactPhone.trim().replace(/\D/g, '');
    if (cleanPhone.length < 10 || cleanPhone.length > 15) {
      toast({ title: "Número de telefone inválido", description: "Digite um número com DDD (ex: 11999999999)", variant: "destructive" });
      return;
    }

    setCreating(true);
    try {
      const conversation = await api<Conversation & { existed?: boolean }>('/api/chat/conversations', {
        method: 'POST',
        body: {
          contact_phone: cleanPhone,
          contact_name: contactName.trim() || undefined,
          connection_id: connectionId,
        },
      });

      if (conversation.existed) {
        toast({ title: "Conversa existente encontrada", description: "Abrindo conversa com este contato" });
      } else {
        toast({ title: "Conversa criada com sucesso" });
      }
      
      onConversationCreated(conversation);
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error creating conversation:', error);
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

  const getInitials = (name: string | null | undefined, phone: string | null | undefined) => {
    if (name) {
      return name.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase();
    }
    if (phone) {
      return phone.slice(-2);
    }
    return "??";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquarePlus className="h-5 w-5 text-primary" />
            Nova Conversa
          </DialogTitle>
          <DialogDescription>
            Selecione um contato da agenda ou adicione um novo número
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="agenda" className="flex items-center gap-2">
              <BookUser className="h-4 w-4" />
              Buscar na Agenda
            </TabsTrigger>
            <TabsTrigger value="manual" className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Novo Número
            </TabsTrigger>
          </TabsList>

          {/* Agenda Tab */}
          <TabsContent value="agenda" className="space-y-4 mt-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome ou telefone..."
                  value={agendaSearch}
                  onChange={(e) => setAgendaSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={agendaConnectionFilter} onValueChange={setAgendaConnectionFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Conexão" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {activeConnections.map(conn => (
                    <SelectItem key={conn.id} value={conn.id}>
                      {conn.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <ScrollArea className="h-[250px] border rounded-md">
              {loadingAgenda ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : agendaContacts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <BookUser className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">
                    {agendaSearch ? "Nenhum contato encontrado" : "Agenda vazia"}
                  </p>
                  <p className="text-xs mt-1">
                    {agendaSearch ? "Tente outro termo" : "Importe contatos em Atendimento > Contatos"}
                  </p>
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {agendaContacts.map((contact) => (
                    <button
                      key={contact.id}
                      onClick={() => handleSelectFromAgenda(contact)}
                      disabled={creating}
                      className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors text-left disabled:opacity-50"
                    >
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-primary/10 text-primary text-sm">
                          {getInitials(contact.name, contact.phone)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{contact.name}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          <span>{contact.phone}</span>
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                        {contact.connection_name}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {/* Manual Entry Tab */}
          <TabsContent value="manual" className="space-y-4 mt-4">
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

            <DialogFooter className="pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
                Cancelar
              </Button>
              <Button onClick={handleCreateManual} disabled={creating || !connectionId || activeConnections.length === 0}>
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
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
