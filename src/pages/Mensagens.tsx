import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  MessageSquare,
  Plus,
  Image,
  Video,
  Mic,
  FileText,
  Eye,
  Trash2,
  Edit,
  Loader2,
} from "lucide-react";
import { MessageItemEditor, MessageItem, MessageItemType } from "@/components/mensagens/MessageItemEditor";
import { AddMessageButton } from "@/components/mensagens/AddMessageButton";
import { MessagePreview } from "@/components/mensagens/MessagePreview";
import { useMessages, MessageTemplate } from "@/hooks/use-messages";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const Mensagens = () => {
  const { loading, getMessages, createMessage, updateMessage, deleteMessage } = useMessages();
  
  const [messages, setMessages] = useState<MessageTemplate[]>([]);
  const [activeTab, setActiveTab] = useState("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [messageName, setMessageName] = useState("");
  const [messageItems, setMessageItems] = useState<MessageItem[]>([
    { id: crypto.randomUUID(), type: "text", content: "" },
  ]);
  const [previewName, setPreviewName] = useState("João");

  useEffect(() => {
    loadMessages();
  }, []);

  const loadMessages = async () => {
    try {
      const data = await getMessages();
      setMessages(data);
    } catch (err) {
      toast.error("Erro ao carregar mensagens");
    }
  };

  const resetForm = () => {
    setMessageName("");
    setMessageItems([{ id: crypto.randomUUID(), type: "text", content: "" }]);
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!messageName.trim()) {
      toast.error("Digite um nome para a mensagem");
      return;
    }

    if (messageItems.every(item => !item.content && !item.mediaUrl)) {
      toast.error("Adicione pelo menos um conteúdo à mensagem");
      return;
    }

    try {
      if (editingId) {
        await updateMessage(editingId, { name: messageName, items: messageItems });
        toast.success("Mensagem atualizada!");
      } else {
        await createMessage(messageName, messageItems);
        toast.success("Mensagem criada!");
      }
      resetForm();
      setActiveTab("list");
      loadMessages();
    } catch (err) {
      toast.error("Erro ao salvar mensagem");
    }
  };

  const handleEdit = (message: MessageTemplate) => {
    setEditingId(message.id);
    setMessageName(message.name);
    setMessageItems(message.items);
    setActiveTab("create");
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMessage(id);
      toast.success("Mensagem deletada!");
      loadMessages();
    } catch (err) {
      toast.error("Erro ao deletar mensagem");
    }
  };

  const addMessageItem = (type: MessageItemType) => {
    const newItem: MessageItem = {
      id: crypto.randomUUID(),
      type,
      content: "",
      mediaUrl: type !== "text" ? "" : undefined,
      caption: type !== "text" ? "" : undefined,
    };
    setMessageItems((prev) => [...prev, newItem]);
  };

  const updateMessageItem = (id: string, updates: Partial<MessageItem>) => {
    setMessageItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  };

  const deleteMessageItem = (id: string) => {
    if (messageItems.length <= 1) return;
    setMessageItems((prev) => prev.filter((item) => item.id !== id));
  };

  const insertVariable = (id: string, variable: string) => {
    setMessageItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        if (item.type === "text") {
          return { ...item, content: item.content + `{{${variable}}}` };
        }
        return { ...item, caption: (item.caption || "") + `{{${variable}}}` };
      })
    );
  };

  const getItemsCount = (items: MessageItem[]) => {
    const counts = items.reduce(
      (acc, item) => {
        acc[item.type] = (acc[item.type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
    return counts;
  };

  return (
    <MainLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between animate-slide-up">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Mensagens</h1>
            <p className="mt-1 text-muted-foreground">
              Crie e gerencie seus templates de mensagem
            </p>
          </div>
          <Button variant="gradient" onClick={() => { resetForm(); setActiveTab("create"); }}>
            <Plus className="h-4 w-4" />
            Nova Mensagem
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="list">Mensagens Salvas</TabsTrigger>
            <TabsTrigger value="create">{editingId ? "Editar" : "Criar"} Mensagem</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-4 mt-6">
            {loading && messages.length === 0 ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhuma mensagem criada</p>
                <p className="text-sm">Clique em "Nova Mensagem" para começar</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {messages.map((message, index) => {
                  const counts = getItemsCount(message.items);
                  return (
                    <Card
                      key={message.id}
                      className="transition-all duration-200 hover:shadow-elevated animate-fade-in"
                      style={{ animationDelay: `${index * 100}ms` }}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-base">{message.name}</CardTitle>
                            <CardDescription>
                              {format(new Date(message.created_at), "dd/MM/yyyy", { locale: ptBR })}
                            </CardDescription>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {counts.text && (
                            <Badge variant="secondary" className="text-xs">
                              <MessageSquare className="h-3 w-3 mr-1" />
                              {counts.text} texto{counts.text > 1 ? "s" : ""}
                            </Badge>
                          )}
                          {counts.image && (
                            <Badge variant="secondary" className="text-xs">
                              <Image className="h-3 w-3 mr-1" />
                              {counts.image} imagem{counts.image > 1 ? "s" : ""}
                            </Badge>
                          )}
                          {counts.video && (
                            <Badge variant="secondary" className="text-xs">
                              <Video className="h-3 w-3 mr-1" />
                              {counts.video} vídeo{counts.video > 1 ? "s" : ""}
                            </Badge>
                          )}
                          {counts.audio && (
                            <Badge variant="secondary" className="text-xs">
                              <Mic className="h-3 w-3 mr-1" />
                              {counts.audio} áudio{counts.audio > 1 ? "s" : ""}
                            </Badge>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {message.items[0]?.type === "text"
                            ? message.items[0].content
                            : message.items[0]?.caption || "Mídia sem legenda"}
                        </p>
                        <div className="mt-4 flex gap-2">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="flex-1"
                            onClick={() => handleEdit(message)}
                          >
                            <Edit className="h-3 w-3" />
                            Editar
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => handleDelete(message.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="create" className="mt-6">
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Editor */}
              <Card className="animate-fade-in shadow-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5 text-primary" />
                    {editingId ? "Editar Mensagem" : "Nova Mensagem"}
                  </CardTitle>
                  <CardDescription>
                    Crie sua mensagem com múltiplos blocos (texto, imagem, vídeo, áudio)
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="messageName">Nome da Mensagem</Label>
                    <Input
                      id="messageName"
                      placeholder="Ex: Boas-vindas"
                      value={messageName}
                      onChange={(e) => setMessageName(e.target.value)}
                    />
                  </div>

                  {/* Message Items List */}
                  <div className="space-y-3">
                    <Label>Blocos da Mensagem</Label>
                    <div className="space-y-3">
                      {messageItems.map((item, index) => (
                        <MessageItemEditor
                          key={item.id}
                          item={item}
                          index={index}
                          onUpdate={updateMessageItem}
                          onDelete={deleteMessageItem}
                          insertVariable={insertVariable}
                        />
                      ))}
                    </div>

                    <AddMessageButton onAdd={addMessageItem} />
                  </div>

                  <Button 
                    variant="gradient" 
                    className="w-full" 
                    onClick={handleSave}
                    disabled={loading}
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <FileText className="h-4 w-4" />
                        {editingId ? "Atualizar" : "Salvar"} Mensagem
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>

              {/* Preview */}
              <Card className="animate-fade-in shadow-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Eye className="h-5 w-5 text-primary" />
                    Preview da Mensagem
                  </CardTitle>
                  <CardDescription>
                    Veja como suas mensagens vão aparecer no WhatsApp
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="previewName">Nome para preview</Label>
                      <Input
                        id="previewName"
                        value={previewName}
                        onChange={(e) => setPreviewName(e.target.value)}
                        placeholder="Nome do contato"
                      />
                    </div>

                    {/* WhatsApp-style preview */}
                    <div className="rounded-xl bg-[#e5ddd5] p-4 min-h-[200px]">
                      <MessagePreview items={messageItems} previewName={previewName} />
                    </div>

                    <div className="rounded-lg bg-accent/50 p-3">
                      <p className="text-xs text-muted-foreground">
                        <strong>Dica:</strong> Cada bloco será enviado como uma mensagem
                        separada, na ordem que você definiu.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
};

export default Mensagens;
