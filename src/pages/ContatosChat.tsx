import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Edit2,
  Loader2,
  MessageSquare,
  Phone,
  RefreshCw,
  Search,
  User,
  Users,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ChatContact {
  id: string;
  conversation_id: string;
  contact_name: string | null;
  contact_phone: string;
  connection_id: string;
  connection_name: string;
  last_message_at: string | null;
  unread_count: number;
}

interface Connection {
  id: string;
  name: string;
  status: string;
}

const ContatosChat = () => {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<ChatContact[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [connectionFilter, setConnectionFilter] = useState("all");
  
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<ChatContact | null>(null);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [contactsData, connectionsData] = await Promise.all([
        api<ChatContact[]>("/api/chat/contacts"),
        api<Connection[]>("/api/connections"),
      ]);
      setContacts(contactsData);
      setConnections(connectionsData);
    } catch (error) {
      console.error("Error loading data:", error);
      toast.error("Erro ao carregar contatos");
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (contact: ChatContact) => {
    setSelectedContact(contact);
    setEditName(contact.contact_name || "");
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedContact) return;

    setSaving(true);
    try {
      await api(`/api/chat/conversations/${selectedContact.conversation_id}/contact`, {
        method: "PATCH",
        body: { contact_name: editName.trim() || null },
      });
      toast.success("Contato atualizado");
      setEditDialogOpen(false);
      loadData();
    } catch (error: any) {
      toast.error(error.message || "Erro ao atualizar contato");
    } finally {
      setSaving(false);
    }
  };

  const handleOpenConversation = (contact: ChatContact) => {
    // Navigate to chat and select the conversation
    navigate(`/chat?conversation=${contact.conversation_id}`);
  };

  const getInitials = (name: string | null, phone: string) => {
    if (name) {
      return name.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase();
    }
    return phone.slice(-2);
  };

  const filteredContacts = contacts.filter(contact => {
    const matchesSearch = !search || 
      contact.contact_name?.toLowerCase().includes(search.toLowerCase()) ||
      contact.contact_phone.includes(search);
    const matchesConnection = connectionFilter === "all" || contact.connection_id === connectionFilter;
    return matchesSearch && matchesConnection;
  });

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users className="h-6 w-6 text-primary" />
              Contatos do Chat
            </h1>
            <p className="text-muted-foreground">
              Veja e edite os contatos de suas conversas
            </p>
          </div>
          <Button onClick={loadData} disabled={loading} variant="outline">
            <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
            Atualizar
          </Button>
        </div>

        {/* Stats */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total de Contatos</p>
                <p className="text-2xl font-bold">{contacts.length}</p>
              </div>
              <Users className="h-8 w-8 text-primary/30" />
            </div>
          </CardContent>
        </Card>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome ou telefone..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={connectionFilter} onValueChange={setConnectionFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Conexão" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas conexões</SelectItem>
                  {connections.map(conn => (
                    <SelectItem key={conn.id} value={conn.id}>
                      {conn.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Contacts List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Contatos ({filteredContacts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredContacts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Users className="h-12 w-12 mb-2 opacity-50" />
                <p>Nenhum contato encontrado</p>
              </div>
            ) : (
              <ScrollArea className="h-[500px]">
                <div className="space-y-2">
                  {filteredContacts.map((contact) => (
                    <div
                      key={contact.id}
                      className="flex items-center gap-4 p-4 rounded-lg border bg-card hover:bg-accent/30 transition-colors group"
                    >
                      <Avatar className="h-12 w-12">
                        <AvatarFallback className="bg-primary/10 text-primary">
                          {getInitials(contact.contact_name, contact.contact_phone)}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">
                          {contact.contact_name || "Sem nome"}
                        </p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          <span>{contact.contact_phone}</span>
                        </div>
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                          {contact.connection_name}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(contact)}
                          title="Editar nome"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenConversation(contact)}
                          title="Abrir conversa"
                        >
                          <MessageSquare className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Contato</DialogTitle>
            <DialogDescription>
              Altere o nome do contato. O número de telefone não pode ser alterado.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Telefone</label>
              <p className="text-sm mt-1">{selectedContact?.contact_phone}</p>
            </div>
            <div>
              <label className="text-sm font-medium">Nome</label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Digite o nome do contato"
                className="mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
};

export default ContatosChat;
