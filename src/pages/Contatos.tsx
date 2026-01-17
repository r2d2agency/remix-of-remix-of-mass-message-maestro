import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Upload,
  Search,
  Users,
  FileSpreadsheet,
  Trash2,
  Loader2,
  Plus,
  Edit,
  Check,
  X,
  Phone,
} from "lucide-react";
import { useContacts, ContactList, Contact } from "@/hooks/use-contacts";
import { ExcelImportDialog } from "@/components/contatos/ExcelImportDialog";
import { evolutionApi } from "@/lib/evolution-api";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const Contatos = () => {
  const {
    loading,
    getLists,
    createList,
    deleteList,
    getContacts,
    importContacts,
    deleteContact,
    updateContact,
  } = useContacts();

  const [lists, setLists] = useState<ContactList[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedList, setSelectedList] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateListOpen, setIsCreateListOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [editingContact, setEditingContact] = useState<string | null>(null);
  const [validatingContact, setValidatingContact] = useState<string | null>(null);

  // Load lists on mount
  useEffect(() => {
    loadLists();
  }, []);

  // Load contacts when list changes
  useEffect(() => {
    if (selectedList) {
      loadContacts(selectedList);
    } else {
      setContacts([]);
    }
  }, [selectedList]);

  const loadLists = async () => {
    try {
      const data = await getLists();
      setLists(data);
    } catch (err) {
      toast.error("Erro ao carregar listas");
    }
  };

  const loadContacts = async (listId: string) => {
    setIsLoadingContacts(true);
    try {
      const data = await getContacts(listId);
      setContacts(data);
    } catch (err) {
      toast.error("Erro ao carregar contatos");
    } finally {
      setIsLoadingContacts(false);
    }
  };

  const handleCreateList = async () => {
    if (!newListName.trim()) {
      toast.error("Digite um nome para a lista");
      return;
    }
    try {
      await createList(newListName);
      toast.success("Lista criada com sucesso!");
      setNewListName("");
      setIsCreateListOpen(false);
      loadLists();
    } catch (err) {
      toast.error("Erro ao criar lista");
    }
  };

  const handleDeleteList = async (id: string) => {
    try {
      await deleteList(id);
      toast.success("Lista deletada com sucesso!");
      if (selectedList === id) setSelectedList(null);
      loadLists();
    } catch (err) {
      toast.error("Erro ao deletar lista");
    }
  };

  const handleDeleteContact = async (id: string) => {
    try {
      await deleteContact(id);
      toast.success("Contato removido!");
      if (selectedList) loadContacts(selectedList);
    } catch (err) {
      toast.error("Erro ao remover contato");
    }
  };

  const handleUpdateContact = async (id: string, name: string, phone: string) => {
    try {
      await updateContact(id, { name, phone });
      toast.success("Contato atualizado!");
      setEditingContact(null);
      if (selectedList) loadContacts(selectedList);
    } catch (err) {
      toast.error("Erro ao atualizar contato");
    }
  };

  const handleValidateWhatsApp = async (contactId: string, phone: string) => {
    const config = evolutionApi.getConfig();
    if (!config) {
      toast.error("Configure a conexão Evolution API primeiro");
      return;
    }

    setValidatingContact(contactId);
    try {
      const isValid = await evolutionApi.checkWhatsAppNumber(config, phone);
      if (isValid) {
        toast.success("Número é WhatsApp válido!");
        await updateContact(contactId, { is_whatsapp: true });
      } else {
        toast.error("Número não é WhatsApp válido");
        await updateContact(contactId, { is_whatsapp: false });
      }
      if (selectedList) loadContacts(selectedList);
    } catch (err) {
      toast.error("Erro ao validar número");
    } finally {
      setValidatingContact(null);
    }
  };

  const handleImportContacts = async (
    contactsToImport: { name: string; phone: string; customFields?: Record<string, string> }[]
  ) => {
    if (!selectedList) {
      toast.error("Selecione uma lista primeiro");
      return;
    }

    try {
      const count = await importContacts(
        selectedList,
        contactsToImport.map((c) => ({ name: c.name, phone: c.phone }))
      );
      toast.success(`${count} contatos importados com sucesso!`);
      loadContacts(selectedList);
      loadLists();
    } catch (err) {
      toast.error("Erro ao importar contatos");
      throw err;
    }
  };

  const validateWhatsAppNumber = async (phone: string): Promise<boolean> => {
    const config = evolutionApi.getConfig();
    if (!config) {
      throw new Error("Evolution API não configurada");
    }
    return evolutionApi.checkWhatsAppNumber(config, phone);
  };

  const filteredContacts = contacts.filter(
    (contact) =>
      contact.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      contact.phone.includes(searchTerm)
  );

  const totalContacts = lists.reduce((sum, list) => sum + Number(list.contact_count || 0), 0);

  return (
    <MainLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between animate-slide-up">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Contatos</h1>
            <p className="mt-1 text-muted-foreground">
              Gerencie suas listas de contatos
            </p>
          </div>
          <Dialog open={isCreateListOpen} onOpenChange={setIsCreateListOpen}>
            <DialogTrigger asChild>
              <Button variant="gradient">
                <Plus className="h-4 w-4" />
                Nova Lista
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Criar Nova Lista</DialogTitle>
                <DialogDescription>
                  Crie uma lista para organizar seus contatos
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="listName">Nome da Lista</Label>
                  <Input
                    id="listName"
                    placeholder="Ex: Clientes Janeiro"
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsCreateListOpen(false)}>
                  Cancelar
                </Button>
                <Button variant="gradient" onClick={handleCreateList} disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar Lista"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Lists Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card
            className={`cursor-pointer transition-all duration-200 hover:shadow-elevated animate-fade-in ${
              selectedList === null ? "ring-2 ring-primary" : ""
            }`}
            onClick={() => setSelectedList(null)}
          >
            <CardContent className="flex items-center gap-4 p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Todas as Listas</p>
                <p className="text-sm text-muted-foreground">
                  {totalContacts} contatos em {lists.length} listas
                </p>
              </div>
            </CardContent>
          </Card>

          {loading && lists.length === 0 ? (
            <div className="col-span-2 flex items-center justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            lists.map((list, index) => (
              <Card
                key={list.id}
                className={`cursor-pointer transition-all duration-200 hover:shadow-elevated animate-fade-in ${
                  selectedList === list.id ? "ring-2 ring-primary" : ""
                }`}
                style={{ animationDelay: `${index * 100}ms` }}
                onClick={() => setSelectedList(list.id)}
              >
                <CardContent className="flex items-center justify-between p-6">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent">
                      <FileSpreadsheet className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{list.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {list.contact_count || 0} contatos
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      {format(new Date(list.created_at), "dd/MM/yy", { locale: ptBR })}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteList(list.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Contacts Table */}
        {selectedList && (
          <Card className="animate-fade-in shadow-card">
            <CardHeader>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle>{lists.find((l) => l.id === selectedList)?.name || "Contatos"}</CardTitle>
                  <CardDescription>{filteredContacts.length} contatos</CardDescription>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Buscar contatos..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Button variant="outline" onClick={() => setIsImportOpen(true)}>
                    <Upload className="h-4 w-4" />
                    Importar Excel
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingContacts ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : filteredContacts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhum contato nesta lista</p>
                  <p className="text-sm mb-4">Importe um arquivo Excel para adicionar contatos</p>
                  <Button variant="outline" onClick={() => setIsImportOpen(true)}>
                    <Upload className="h-4 w-4" />
                    Importar do Excel
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead>WhatsApp</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredContacts.map((contact) => (
                      <TableRow key={contact.id}>
                        <TableCell>
                          {editingContact === contact.id ? (
                            <Input
                              defaultValue={contact.name}
                              onBlur={(e) => handleUpdateContact(contact.id, e.target.value, contact.phone)}
                              autoFocus
                            />
                          ) : (
                            <span className="font-medium">{contact.name}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {editingContact === contact.id ? (
                            <Input defaultValue={contact.phone} id={`phone-${contact.id}`} />
                          ) : (
                            <span className="font-mono text-sm">{contact.phone}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {contact.is_whatsapp === true ? (
                            <Badge className="bg-green-500/10 text-green-500 border-0">
                              <Check className="h-3 w-3 mr-1" />
                              Válido
                            </Badge>
                          ) : contact.is_whatsapp === false ? (
                            <Badge className="bg-destructive/10 text-destructive border-0">
                              <X className="h-3 w-3 mr-1" />
                              Inválido
                            </Badge>
                          ) : (
                            <Badge variant="outline">Não verificado</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleValidateWhatsApp(contact.id, contact.phone)}
                              disabled={validatingContact === contact.id}
                            >
                              {validatingContact === contact.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Phone className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setEditingContact(editingContact === contact.id ? null : contact.id)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDeleteContact(contact.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        {/* Excel Import Dialog */}
        <ExcelImportDialog
          open={isImportOpen}
          onOpenChange={setIsImportOpen}
          onImport={handleImportContacts}
          validateWhatsApp={validateWhatsAppNumber}
        />
      </div>
    </MainLayout>
  );
};

export default Contatos;
