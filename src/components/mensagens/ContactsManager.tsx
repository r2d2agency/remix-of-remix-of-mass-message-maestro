import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Users,
  Plus,
  Trash2,
  Upload,
  Phone,
  Loader2,
  FolderPlus,
  Link2,
  User,
  FileSpreadsheet,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Connection } from "@/hooks/use-chat";

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

export function ContactsManager() {
  const [loading, setLoading] = useState(false);
  const [lists, setLists] = useState<ContactList[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedList, setSelectedList] = useState<ContactList | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  
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

  // Load connections and lists on mount
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [listsData, connectionsData] = await Promise.all([
        api<ContactList[]>('/api/contacts/lists'),
        api<Connection[]>('/api/chat/connections'),
      ]);
      setLists(listsData);
      setConnections(connectionsData);
    } catch (err) {
      toast.error("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  };

  const loadContacts = async (listId: string) => {
    setLoading(true);
    try {
      const data = await api<Contact[]>(`/api/contacts/lists/${listId}/contacts`);
      setContacts(data);
    } catch (err) {
      toast.error("Erro ao carregar contatos");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectList = (list: ContactList) => {
    setSelectedList(list);
    loadContacts(list.id);
  };

  const handleCreateList = async () => {
    if (!newListName.trim()) {
      toast.error("Digite um nome para a lista");
      return;
    }

    setLoading(true);
    try {
      await api('/api/contacts/lists', {
        method: 'POST',
        body: JSON.stringify({
          name: newListName.trim(),
          connection_id: newListConnectionId || undefined,
        }),
      });
      toast.success("Lista criada com sucesso!");
      setNewListName("");
      setNewListConnectionId("");
      setShowNewListDialog(false);
      loadData();
    } catch (err) {
      toast.error("Erro ao criar lista");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteList = async (listId: string) => {
    if (!confirm("Tem certeza que deseja excluir esta lista e todos os contatos?")) return;

    setLoading(true);
    try {
      await api(`/api/contacts/lists/${listId}`, { method: 'DELETE' });
      toast.success("Lista excluída!");
      if (selectedList?.id === listId) {
        setSelectedList(null);
        setContacts([]);
      }
      loadData();
    } catch (err) {
      toast.error("Erro ao excluir lista");
    } finally {
      setLoading(false);
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

    setLoading(true);
    try {
      await api(`/api/contacts/lists/${selectedList.id}/contacts`, {
        method: 'POST',
        body: JSON.stringify({
          name: newContactName.trim(),
          phone: cleanPhone,
        }),
      });
      toast.success("Contato adicionado!");
      setNewContactName("");
      setNewContactPhone("");
      setShowAddContactDialog(false);
      loadContacts(selectedList.id);
      loadData(); // Update count
    } catch (err) {
      toast.error("Erro ao adicionar contato");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteContact = async (contactId: string) => {
    if (!selectedList) return;

    setLoading(true);
    try {
      await api(`/api/contacts/${contactId}`, { method: 'DELETE' });
      toast.success("Contato excluído!");
      loadContacts(selectedList.id);
      loadData(); // Update count
    } catch (err) {
      toast.error("Erro ao excluir contato");
    } finally {
      setLoading(false);
    }
  };

  const handleImportContacts = async () => {
    if (!selectedList || !importData.trim()) {
      toast.error("Cole os contatos no formato: nome,telefone (um por linha)");
      return;
    }

    // Parse import data
    const lines = importData.trim().split('\n');
    const parsedContacts: { name: string; phone: string }[] = [];

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      // Try comma, semicolon, or tab separation
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

    setLoading(true);
    try {
      const result = await api<{ imported: number; duplicates: number }>(
        `/api/contacts/lists/${selectedList.id}/import`,
        {
          method: 'POST',
          body: JSON.stringify({ contacts: parsedContacts }),
        }
      );
      
      toast.success(`${result.imported} contatos importados!${result.duplicates ? ` (${result.duplicates} duplicados)` : ''}`);
      setImportData("");
      setShowImportDialog(false);
      loadContacts(selectedList.id);
      loadData();
    } catch (err) {
      toast.error("Erro ao importar contatos");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Lists Panel */}
      <Card className="lg:col-span-1">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4 text-primary" />
                Listas de Contatos
              </CardTitle>
              <CardDescription>
                {lists.length} lista{lists.length !== 1 ? 's' : ''} criada{lists.length !== 1 ? 's' : ''}
              </CardDescription>
            </div>
            
            <Dialog open={showNewListDialog} onOpenChange={setShowNewListDialog}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  <FolderPlus className="h-4 w-4" />
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
                      Vincular a uma conexão permite usar esta lista para campanhas naquela linha
                    </p>
                  </div>
                  <Button onClick={handleCreateList} className="w-full" disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Criar Lista
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px] pr-4">
            {loading && lists.length === 0 ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : lists.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
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
                {selectedList ? `${contacts.length} contato${contacts.length !== 1 ? 's' : ''}` : 'Clique em uma lista para ver os contatos'}
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
                      <Button onClick={handleAddContact} className="w-full" disabled={loading}>
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
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
                      <div className="rounded-lg bg-accent/50 p-3 text-xs text-muted-foreground">
                        <p className="font-medium mb-1">Formato aceito:</p>
                        <p>nome,telefone (separado por vírgula, ponto-e-vírgula ou tab)</p>
                        <p className="mt-1">Telefone deve ter pelo menos 10 dígitos (DDD + número)</p>
                      </div>
                      <Button onClick={handleImportContacts} className="w-full" disabled={loading}>
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        Importar Contatos
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
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Selecione uma lista para gerenciar os contatos</p>
            </div>
          ) : loading && contacts.length === 0 ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : contacts.length === 0 ? (
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
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contacts.map((contact) => (
                    <TableRow key={contact.id}>
                      <TableCell className="font-medium">{contact.name}</TableCell>
                      <TableCell className="text-muted-foreground">{contact.phone}</TableCell>
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
  );
}
