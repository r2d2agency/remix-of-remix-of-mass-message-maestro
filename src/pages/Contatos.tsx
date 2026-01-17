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
import { Upload, Search, Users, FileSpreadsheet, Trash2, Loader2 } from "lucide-react";
import { useContacts, ContactList, Contact } from "@/hooks/use-contacts";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const Contatos = () => {
  const { loading, getLists, createList, deleteList, getContacts, importContacts, deleteContact } = useContacts();
  
  const [lists, setLists] = useState<ContactList[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedList, setSelectedList] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);

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
      setIsUploadOpen(false);
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedList) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim());
      
      // Skip header if exists
      const startIndex = lines[0]?.toLowerCase().includes('nome') ? 1 : 0;
      
      const contactsToImport = lines.slice(startIndex).map(line => {
        const [name, phone] = line.split(/[,;]/).map(s => s.trim());
        return { name: name || 'Sem nome', phone: phone || '' };
      }).filter(c => c.phone);

      if (contactsToImport.length === 0) {
        toast.error("Nenhum contato válido encontrado no arquivo");
        return;
      }

      try {
        const count = await importContacts(selectedList, contactsToImport);
        toast.success(`${count} contatos importados com sucesso!`);
        loadContacts(selectedList);
        loadLists();
      } catch (err) {
        toast.error("Erro ao importar contatos");
      }
    };
    reader.readAsText(file);
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
          <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
            <DialogTrigger asChild>
              <Button variant="gradient">
                <Upload className="h-4 w-4" />
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
                <Button variant="outline" onClick={() => setIsUploadOpen(false)}>
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
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>
                    {lists.find((l) => l.id === selectedList)?.name || "Contatos"}
                  </CardTitle>
                  <CardDescription>
                    {filteredContacts.length} contatos
                  </CardDescription>
                </div>
                <div className="flex items-center gap-4">
                  <div className="relative w-64">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Buscar contatos..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <div>
                    <Input
                      type="file"
                      accept=".csv,.txt"
                      onChange={handleFileUpload}
                      className="max-w-[200px]"
                    />
                  </div>
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
                  <p className="text-sm">Importe um arquivo CSV para adicionar contatos</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredContacts.map((contact) => (
                      <TableRow key={contact.id}>
                        <TableCell className="font-medium">{contact.name}</TableCell>
                        <TableCell>{contact.phone}</TableCell>
                        <TableCell className="text-right">
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => handleDeleteContact(contact.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  );
};

export default Contatos;
