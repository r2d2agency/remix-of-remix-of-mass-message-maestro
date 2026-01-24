import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { 
  Bot, Plus, Settings, BarChart3, Trash2, Edit, 
  Clock, MessageSquare, Zap, Users, ArrowRight,
  Sparkles
} from "lucide-react";
import { toast } from "sonner";
import { useChatbots, Chatbot } from "@/hooks/use-chatbots";
import { ChatbotEditorDialog } from "@/components/chatbots/ChatbotEditorDialog";
import { ChatbotStatsDialog } from "@/components/chatbots/ChatbotStatsDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const Chatbots = () => {
  const { getChatbots, toggleChatbot, deleteChatbot, loading } = useChatbots();
  const [chatbots, setChatbots] = useState<Chatbot[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedChatbot, setSelectedChatbot] = useState<Chatbot | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const [statsChatbot, setStatsChatbot] = useState<Chatbot | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [chatbotToDelete, setChatbotToDelete] = useState<Chatbot | null>(null);

  const loadChatbots = async () => {
    const data = await getChatbots();
    setChatbots(data);
  };

  useEffect(() => {
    loadChatbots();
  }, []);

  const handleToggle = async (chatbot: Chatbot) => {
    const result = await toggleChatbot(chatbot.id);
    if (result) {
      setChatbots(prev => 
        prev.map(c => c.id === chatbot.id ? { ...c, is_active: result.is_active } : c)
      );
      toast.success(result.is_active ? 'Chatbot ativado!' : 'Chatbot desativado');
    }
  };

  const handleEdit = (chatbot: Chatbot) => {
    setSelectedChatbot(chatbot);
    setEditorOpen(true);
  };

  const handleCreate = () => {
    setSelectedChatbot(null);
    setEditorOpen(true);
  };

  const handleStats = (chatbot: Chatbot) => {
    setStatsChatbot(chatbot);
    setStatsOpen(true);
  };

  const handleDeleteClick = (chatbot: Chatbot) => {
    setChatbotToDelete(chatbot);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!chatbotToDelete) return;
    
    const success = await deleteChatbot(chatbotToDelete.id);
    if (success) {
      setChatbots(prev => prev.filter(c => c.id !== chatbotToDelete.id));
      toast.success('Chatbot excluído com sucesso');
    }
    setDeleteDialogOpen(false);
    setChatbotToDelete(null);
  };

  const handleEditorClose = (saved: boolean) => {
    setEditorOpen(false);
    setSelectedChatbot(null);
    if (saved) {
      loadChatbots();
    }
  };

  const getModeLabel = (mode: string) => {
    switch (mode) {
      case 'always': return 'Sempre ativo';
      case 'business_hours': return 'Horário comercial';
      case 'outside_hours': return 'Fora do horário';
      case 'pre_service': return 'Pré-atendimento';
      default: return mode;
    }
  };

  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case 'gemini':
        return <Sparkles className="h-4 w-4 text-blue-500" />;
      case 'openai':
        return <Zap className="h-4 w-4 text-green-500" />;
      default:
        return <MessageSquare className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
              <Bot className="h-8 w-8 text-primary" />
              Chatbots
            </h1>
            <p className="mt-1 text-muted-foreground">
              Gerencie seus chatbots inteligentes com IA e fluxos de decisão
            </p>
          </div>
          <Button onClick={handleCreate} variant="gradient">
            <Plus className="h-4 w-4 mr-2" />
            Novo Chatbot
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-primary/10">
                  <Bot className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{chatbots.length}</p>
                  <p className="text-sm text-muted-foreground">Total de Bots</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-green-500/10">
                  <Zap className="h-6 w-6 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{chatbots.filter(c => c.is_active).length}</p>
                  <p className="text-sm text-muted-foreground">Ativos</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-blue-500/10">
                  <Users className="h-6 w-6 text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {chatbots.reduce((acc, c) => acc + (c.active_sessions || 0), 0)}
                  </p>
                  <p className="text-sm text-muted-foreground">Sessões Ativas</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-purple-500/10">
                  <Sparkles className="h-6 w-6 text-purple-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {chatbots.filter(c => c.ai_provider !== 'none').length}
                  </p>
                  <p className="text-sm text-muted-foreground">Com IA</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Chatbots List */}
        {chatbots.length === 0 && !loading ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Bot className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhum chatbot criado</h3>
              <p className="text-muted-foreground text-center mb-4">
                Crie seu primeiro chatbot para automatizar o atendimento
              </p>
              <Button onClick={handleCreate} variant="gradient">
                <Plus className="h-4 w-4 mr-2" />
                Criar Chatbot
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {chatbots.map((chatbot) => (
              <Card key={chatbot.id} className={`transition-all hover:shadow-lg ${!chatbot.is_active ? 'opacity-60' : ''}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full ${chatbot.is_active ? 'bg-primary/10' : 'bg-muted'}`}>
                        <Bot className={`h-5 w-5 ${chatbot.is_active ? 'text-primary' : 'text-muted-foreground'}`} />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{chatbot.name}</CardTitle>
                        {chatbot.connection_name && (
                          <p className="text-xs text-muted-foreground">{chatbot.connection_name}</p>
                        )}
                      </div>
                    </div>
                    <Switch
                      checked={chatbot.is_active}
                      onCheckedChange={() => handleToggle(chatbot)}
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {chatbot.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {chatbot.description}
                    </p>
                  )}
                  
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {getModeLabel(chatbot.mode)}
                    </Badge>
                    <Badge variant="outline" className="flex items-center gap-1">
                      {getProviderIcon(chatbot.ai_provider)}
                      {chatbot.ai_provider === 'none' ? 'Sem IA' : chatbot.ai_provider.toUpperCase()}
                    </Badge>
                    {chatbot.ai_model && (
                      <Badge variant="secondary" className="text-xs">
                        {chatbot.ai_model}
                      </Badge>
                    )}
                  </div>

                  {chatbot.active_sessions && chatbot.active_sessions > 0 ? (
                    <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                      {chatbot.active_sessions} sessão(ões) ativa(s)
                    </div>
                  ) : null}

                  <div className="flex items-center gap-2 pt-2 border-t">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex-1"
                      onClick={() => handleEdit(chatbot)}
                    >
                      <Edit className="h-4 w-4 mr-1" />
                      Editar
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleStats(chatbot)}
                    >
                      <BarChart3 className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDeleteClick(chatbot)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Empty Features Info */}
        <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Recursos dos Chatbots
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <MessageSquare className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-medium">Fluxos de Decisão</h4>
                  <p className="text-sm text-muted-foreground">
                    Crie menus interativos e árvores de decisão para guiar o usuário
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-medium">IA Conversacional</h4>
                  <p className="text-sm text-muted-foreground">
                    Integre com Gemini ou OpenAI para respostas inteligentes
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Clock className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-medium">Horário Comercial</h4>
                  <p className="text-sm text-muted-foreground">
                    Configure quando o bot deve responder automaticamente
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Editor Dialog */}
      <ChatbotEditorDialog
        open={editorOpen}
        chatbot={selectedChatbot}
        onClose={handleEditorClose}
      />

      {/* Stats Dialog */}
      <ChatbotStatsDialog
        open={statsOpen}
        chatbot={statsChatbot}
        onClose={() => {
          setStatsOpen(false);
          setStatsChatbot(null);
        }}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Chatbot</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o chatbot "{chatbotToDelete?.name}"?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
};

export default Chatbots;
