import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle,
  Edit2,
  FileSpreadsheet,
  FolderPlus,
  Link2,
  Loader2,
  MessageSquare,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  User,
  Users,
  XCircle,
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
  phone_number: string | null;
  status: string;
}

interface ContactList {
  id: string;
  name: string;
  connection_id: string | null;
  connection_name: string | null;
  contact_count: number;
  created_at: string;
}

interface Contact {
  id: string;
  list_id: string;
  name: string;
  phone: string;
  is_whatsapp?: boolean | null;
  created_at: string;
}

const ContatosChat = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("chat");
  
  // Chat contacts state
  const [chatContacts, setChatContacts] = useState<ChatContact[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [connectionFilter, setConnectionFilter] = useState("all");
  
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<ChatContact | null>(null);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);

  // Contact lists state
  const [lists, setLists] = useState<ContactList[]>([]);
  const [selectedList, setSelectedList] = useState<ContactList | null>(null);
  const [listContacts, setListContacts] = useState<Contact[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);
  
  // New list dialog
  const [showNewListDialog, setShowNewListDialog] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListConnectionId, setNewListConnectionId] = useState("");
  
  // Add contact dialog
  const [showAddContactDialog, setShowAddContactDialog] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  
  // Import dialog
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importData, setImportData] = useState("");
  const [validateWhatsApp, setValidateWhatsApp] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (activeTab === "lists") {
      loadLists();
    }
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [contactsData, connectionsData] = await Promise.all([
        api<ChatContact[]>("/api/chat/contacts"),
        api<Connection[]>("/api/chat/connections"),
      ]);
      setChatContacts(contactsData);
      setConnections(connectionsData);
    } catch (error) {
      console.error("Error loading data:", error);
      toast.error("Erro ao carregar contatos");
    } finally {
      setLoading(false);
    }
  };

  const loadLists = async () => {
    setLoadingLists(true);
    try {
      const data = await api<ContactList[]>('/api/contacts/lists');
      setLists(data);
    } catch (err) {
      toast.error("Erro ao carregar listas");
    } finally {
      setLoadingLists(false);
    }
  };

  const loadListContacts = async (listId: string) => {
    setLoadingLists(true);
    try {
      const data = await api<Contact[]>(`/api/contacts/lists/${listId}/contacts`);
      setListContacts(data);
    } catch (err) {
      toast.error("Erro ao carregar contatos");
    } finally {
      setLoadingLists(false);
    }
  };

  const handleSelectList = (list: ContactList) => {
    setSelectedList(list);
    loadListContacts(list.id);
  };

  // Chat contact handlers
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
    navigate(`/chat?conversation=${contact.conversation_id}`);
  };

  // List handlers
  const handleCreateList = async () => {
    if (!newListName.trim()) {
      toast.error("Digite um nome para a lista");
      return;
    }

    setLoadingLists(true);
    try {
      await api('/api/contacts/lists', {
        method: 'POST',
        body: {
          name: newListName.trim(),
          connection_id: newListConnectionId || undefined,
        },
      });
      toast.success("Lista criada com sucesso!");
      setNewListName("");
      setNewListConnectionId("");
      setShowNewListDialog(false);
      loadLists();
    } catch (err) {
      toast.error("Erro ao criar lista");
    } finally {
      setLoadingLists(false);
    }
  };

  const handleDeleteList = async (listId: string) => {
    if (!confirm("Tem certeza que deseja excluir esta lista e todos os contatos?")) return;

    setLoadingLists(true);
    try {
      await api(`/api/contacts/lists/${listId}`, { method: 'DELETE' });
      toast.success("Lista excluída!");
      if (selectedList?.id === listId) {
        setSelectedList(null);
        setListContacts([]);
      }
      loadLists();
    } catch (err) {
      toast.error("Erro ao excluir lista");
    } finally {
      setLoadingLists(false);
    }
  };

  const handleAddContact = async () => {
    if (!selectedList) return;
    if (!newContactName.trim() || !newContactPhone.trim()) {
      toast.error("Preencha nome e telefone");
      return;
    }

    const cleanPhone = newContactPhone.replace(/\D/g, '');
    if (cleanPhone.length < 10 || cleanPhone.length > 15) {
      toast.error("Número de telefone inválido");
      return;
    }

    setLoadingLists(true);
    try {
      await api(`/api/contacts/lists/${selectedList.id}/contacts`, {
        method: 'POST',
        body: {
          name: newContactName.trim(),
          phone: cleanPhone,
        },
      });
      toast.success("Contato adicionado!");
      setNewContactName("");
      setNewContactPhone("");
      setShowAddContactDialog(false);
      loadListContacts(selectedList.id);
      loadLists();
    } catch (err) {
      toast.error("Erro ao adicionar contato");
    } finally {
      setLoadingLists(false);
    }
  };

  const handleDeleteContact = async (contactId: string) => {
    if (!selectedList) return;

    setLoadingLists(true);
    try {
      await api(`/api/contacts/${contactId}`, { method: 'DELETE' });
      toast.success("Contato excluído!");
      loadListContacts(selectedList.id);
      loadLists();
    } catch (err) {
      toast.error("Erro ao excluir contato");
    } finally {
      setLoadingLists(false);
    }
  };

  const handleImportContacts = async () => {
    if (!selectedList || !importData.trim()) {
      toast.error("Cole os contatos no formato: nome,telefone (um por linha)");
      return;
    }

    const lines = importData.trim().split('\n');
    const parsedContacts: { name: string; phone: string }[] = [];

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      let parts = trimmedLine.split(',');
      if (parts.length < 2) parts = trimmedLine.split(';');
      if (parts.length < 2) parts = trimmedLine.split('\t');

      if (parts.length >= 2) {
        const name = parts[0].trim();
        const phone = parts[1].trim().replace(/\D/g, '');
        
        if (name && phone.length >= 10) {
          parsedContacts.push({ name, phone });
        }
      }
    }

    if (parsedContacts.length === 0) {
      toast.error("Nenhum contato válido encontrado. Use o formato: nome,telefone");
      return;
    }

    setLoadingLists(true);
    try {
      const result = await api<{ imported: number; duplicates: number; invalid_whatsapp?: number }>(
        `/api/contacts/lists/${selectedList.id}/import`,
        {
          method: 'POST',
          body: { 
            contacts: parsedContacts,
            validate_whatsapp: validateWhatsApp && !!selectedList.connection_id
          },
        }
      );
      
      let description = `${result.imported} contatos importados`;
      if (result.duplicates) description += `, ${result.duplicates} duplicados`;
      if (result.invalid_whatsapp) description += `, ${result.invalid_whatsapp} números inválidos`;
      
      toast.success("Importação concluída!", { description });
      setImportData("");
      setShowImportDialog(false);
      loadListContacts(selectedList.id);
      loadLists();
    } catch (err) {
      toast.error("Erro ao importar contatos");
    } finally {
      setLoadingLists(false);
    }
  };

  const getInitials = (name: string | null, phone: string) => {
    if (name) {
      return name.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase();
    }
    return phone.slice(-2);
  };

  const filteredChatContacts = chatContacts.filter(contact => {
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
              Contatos
            </h1>
            <p className="text-muted-foreground">
              Gerencie contatos do chat e listas para campanhas
            </p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="chat" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Contatos do Chat
            </TabsTrigger>
            <TabsTrigger value="lists" className="flex items-center gap-2">
              <FolderPlus className="h-4 w-4" />
              Listas de Contatos
            </TabsTrigger>
          </TabsList>

          {/* Chat Contacts Tab */}
          <TabsContent value="chat" className="space-y-4 mt-6">
            {/* Stats */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total de Contatos</p>
                    <p className="text-2xl font-bold">{chatContacts.length}</p>
                  </div>
                  <Button onClick={loadData} disabled={loading} variant="outline" size="sm">
                    <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
                    Atualizar
                  </Button>
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
                  Contatos ({filteredChatContacts.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredChatContacts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Users className="h-12 w-12 mb-2 opacity-50" />
                    <p>Nenhum contato encontrado</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-2">
                      {filteredChatContacts.map((contact) => (
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
          </TabsContent>

          {/* Contact Lists Tab */}
          <TabsContent value="lists" className="mt-6">
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Lists Panel */}
              <Card className="lg:col-span-1">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <FolderPlus className="h-4 w-4 text-primary" />
                        Listas de Contatos
                      </CardTitle>
                      <CardDescription>
                        {lists.length} lista{lists.length !== 1 ? 's' : ''} criada{lists.length !== 1 ? 's' : ''}
                      </CardDescription>
                    </div>
                    
                    <Dialog open={showNewListDialog} onOpenChange={setShowNewListDialog}>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline">
                          <Plus className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Nova Lista de Contatos</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="space-y-2">
                            <Label>Nome da Lista</Label>
                            <Input
                              value={newListName}
                              onChange={(e) => setNewListName(e.target.value)}
                              placeholder="Ex: Clientes VIP"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Conexão (opcional)</Label>
                            <Select value={newListConnectionId} onValueChange={setNewListConnectionId}>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione uma conexão" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="">Nenhuma conexão</SelectItem>
                                {connections.map((conn) => (
                                  <SelectItem key={conn.id} value={conn.id}>
                                    {conn.name} {conn.phone_number ? `(${conn.phone_number})` : ''}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                              Vincular a uma conexão permite validar números e usar para campanhas
                            </p>
                          </div>
                          <Button onClick={handleCreateList} className="w-full" disabled={loadingLists}>
                            {loadingLists ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                            Criar Lista
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px] pr-4">
                    {loadingLists && lists.length === 0 ? (
                      <div className="flex items-center justify-center p-8">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      </div>
                    ) : lists.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <FolderPlus className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">Nenhuma lista criada</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {lists.map((list) => (
                          <div
                            key={list.id}
                            className={`p-3 rounded-lg border cursor-pointer transition-all ${
                              selectedList?.id === list.id
                                ? 'bg-primary/10 border-primary'
                                : 'hover:bg-accent'
                            }`}
                            onClick={() => handleSelectList(list)}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">{list.name}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <Badge variant="secondary" className="text-xs">
                                    <User className="h-3 w-3 mr-1" />
                                    {list.contact_count}
                                  </Badge>
                                  {list.connection_name && (
                                    <Badge variant="outline" className="text-xs">
                                      <Link2 className="h-3 w-3 mr-1" />
                                      {list.connection_name}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteList(list.id);
                                }}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Contacts Panel */}
              <Card className="lg:col-span-2">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Phone className="h-4 w-4 text-primary" />
                        {selectedList ? selectedList.name : 'Selecione uma lista'}
                      </CardTitle>
                      <CardDescription>
                        {selectedList ? `${listContacts.length} contato${listContacts.length !== 1 ? 's' : ''}` : 'Clique em uma lista para ver os contatos'}
                      </CardDescription>
                    </div>
                    
                    {selectedList && (
                      <div className="flex gap-2">
                        {/* Add Contact Dialog */}
                        <Dialog open={showAddContactDialog} onOpenChange={setShowAddContactDialog}>
                          <DialogTrigger asChild>
                            <Button size="sm" variant="outline">
                              <Plus className="h-4 w-4 mr-1" />
                              Adicionar
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Adicionar Contato</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                              <div className="space-y-2">
                                <Label>Nome</Label>
                                <Input
                                  value={newContactName}
                                  onChange={(e) => setNewContactName(e.target.value)}
                                  placeholder="Nome do contato"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Telefone</Label>
                                <Input
                                  value={newContactPhone}
                                  onChange={(e) => setNewContactPhone(e.target.value)}
                                  placeholder="Ex: 11999999999"
                                />
                              </div>
                              <Button onClick={handleAddContact} className="w-full" disabled={loadingLists}>
                                {loadingLists ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                Adicionar Contato
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>

                        {/* Import Dialog */}
                        <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
                          <DialogTrigger asChild>
                            <Button size="sm" variant="outline">
                              <Upload className="h-4 w-4 mr-1" />
                              Importar
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-lg">
                            <DialogHeader>
                              <DialogTitle className="flex items-center gap-2">
                                <FileSpreadsheet className="h-5 w-5" />
                                Importar Contatos
                              </DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                              <div className="space-y-2">
                                <Label>Cole os contatos (um por linha)</Label>
                                <Textarea
                                  value={importData}
                                  onChange={(e) => setImportData(e.target.value)}
                                  placeholder="João Silva,11999999999&#10;Maria Santos,11888888888&#10;Pedro Costa,11777777777"
                                  className="min-h-[200px] font-mono text-sm"
                                />
                              </div>
                              
                              {/* WhatsApp validation option */}
                              {selectedList?.connection_id && (
                                <div className="flex items-center gap-3 p-3 rounded-lg bg-accent/50 border">
                                  <Checkbox
                                    id="validateWhatsApp"
                                    checked={validateWhatsApp}
                                    onCheckedChange={(checked) => setValidateWhatsApp(checked === true)}
                                  />
                                  <label htmlFor="validateWhatsApp" className="text-sm cursor-pointer flex-1">
                                    <span className="font-medium flex items-center gap-1">
                                      <CheckCircle className="h-4 w-4 text-green-500" />
                                      Validar números no WhatsApp
                                    </span>
                                    <br />
                                    <span className="text-xs text-muted-foreground">
                                      Importa apenas números que existem no WhatsApp (mais lento)
                                    </span>
                                  </label>
                                </div>
                              )}

                              <div className="rounded-lg bg-accent/50 p-3 text-xs text-muted-foreground">
                                <p className="font-medium mb-1">Formato aceito:</p>
                                <p>nome,telefone (separado por vírgula, ponto-e-vírgula ou tab)</p>
                                <p className="mt-1">Telefone deve ter pelo menos 10 dígitos (DDD + número)</p>
                              </div>
                              <Button onClick={handleImportContacts} className="w-full" disabled={loadingLists}>
                                {loadingLists ? (
                                  <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    {validateWhatsApp && selectedList?.connection_id ? 'Validando...' : 'Importando...'}
                                  </>
                                ) : (
                                  <>
                                    <Upload className="h-4 w-4" />
                                    Importar Contatos
                                  </>
                                )}
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {!selectedList ? (
                    <div className="text-center py-16 text-muted-foreground">
                      <FolderPlus className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>Selecione uma lista para gerenciar os contatos</p>
                    </div>
                  ) : loadingLists && listContacts.length === 0 ? (
                    <div className="flex items-center justify-center p-8">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  ) : listContacts.length === 0 ? (
                    <div className="text-center py-16 text-muted-foreground">
                      <Phone className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>Nenhum contato nesta lista</p>
                      <p className="text-sm mt-1">Adicione contatos manualmente ou importe em massa</p>
                    </div>
                  ) : (
                    <ScrollArea className="h-[400px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Nome</TableHead>
                            <TableHead>Telefone</TableHead>
                            <TableHead className="w-20">WhatsApp</TableHead>
                            <TableHead className="w-12"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {listContacts.map((contact) => (
                            <TableRow key={contact.id}>
                              <TableCell className="font-medium">{contact.name}</TableCell>
                              <TableCell className="text-muted-foreground">{contact.phone}</TableCell>
                              <TableCell>
                                {contact.is_whatsapp === true && (
                                  <CheckCircle className="h-4 w-4 text-green-500" />
                                )}
                                {contact.is_whatsapp === false && (
                                  <XCircle className="h-4 w-4 text-red-500" />
                                )}
                                {contact.is_whatsapp === null && (
                                  <span className="text-xs text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => handleDeleteContact(contact.id)}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit Chat Contact Dialog */}
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
