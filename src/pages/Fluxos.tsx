import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  GitBranch, Plus, Edit, Trash2, Play, Pause, Bot, Lock
} from "lucide-react";
import { toast } from "sonner";
import { useChatbots, Chatbot } from "@/hooks/use-chatbots";
import { useAuth } from "@/contexts/AuthContext";
import { FlowEditorDialog } from "@/components/chatbots/FlowEditorDialog";
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

const Fluxos = () => {
  const { getChatbots, toggleChatbot, deleteChatbot, loading } = useChatbots();
  const { user } = useAuth();
  const [chatbots, setChatbots] = useState<Chatbot[]>([]);
  const [flowEditorOpen, setFlowEditorOpen] = useState(false);
  const [flowChatbot, setFlowChatbot] = useState<Chatbot | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [chatbotToDelete, setChatbotToDelete] = useState<Chatbot | null>(null);

  const isAdmin = user?.role === 'owner' || user?.role === 'admin' || user?.role === 'manager';

  const loadChatbots = async () => {
    const data = await getChatbots();
    // Filter only flow-type chatbots
    setChatbots(data.filter(c => c.chatbot_type === 'flow' || c.chatbot_type === 'hybrid'));
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
      toast.success(result.is_active ? 'Fluxo ativado!' : 'Fluxo desativado');
    }
  };

  const handleFlowEditor = (chatbot: Chatbot) => {
    setFlowChatbot(chatbot);
    setFlowEditorOpen(true);
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
      toast.success('Fluxo excluído com sucesso');
    }
    setDeleteDialogOpen(false);
    setChatbotToDelete(null);
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
              <GitBranch className="h-8 w-8 text-primary" />
              Fluxos de Atendimento
            </h1>
            <p className="mt-1 text-muted-foreground">
              Gerencie os fluxos visuais de decisão dos seus chatbots
            </p>
          </div>
          {!isAdmin && (
            <Badge variant="secondary" className="flex items-center gap-2 px-3 py-2">
              <Lock className="h-4 w-4" />
              Somente visualização
            </Badge>
          )}
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-primary/10">
                  <GitBranch className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{chatbots.length}</p>
                  <p className="text-sm text-muted-foreground">Total de Fluxos</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-green-500/10">
                  <Play className="h-6 w-6 text-green-500" />
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
                <div className="p-3 rounded-full bg-orange-500/10">
                  <Pause className="h-6 w-6 text-orange-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{chatbots.filter(c => !c.is_active).length}</p>
                  <p className="text-sm text-muted-foreground">Inativos</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Flows List */}
        {chatbots.length === 0 && !loading ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <GitBranch className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhum fluxo encontrado</h3>
              <p className="text-muted-foreground text-center mb-4">
                Crie chatbots do tipo "Fluxo" ou "Híbrido" na página de Chatbots para gerenciá-los aqui
              </p>
              <Button variant="outline" onClick={() => window.location.href = '/chatbots'}>
                <Bot className="h-4 w-4 mr-2" />
                Ir para Chatbots
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
                        <GitBranch className={`h-5 w-5 ${chatbot.is_active ? 'text-primary' : 'text-muted-foreground'}`} />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{chatbot.name}</CardTitle>
                        {chatbot.connection_name && (
                          <p className="text-xs text-muted-foreground">{chatbot.connection_name}</p>
                        )}
                      </div>
                    </div>
                    <Badge variant={chatbot.is_active ? "default" : "secondary"}>
                      {chatbot.is_active ? "Ativo" : "Inativo"}
                    </Badge>
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
                      <GitBranch className="h-3 w-3" />
                      {chatbot.chatbot_type === 'hybrid' ? 'Híbrido' : 'Fluxo'}
                    </Badge>
                    {chatbot.ai_provider !== 'none' && (
                      <Badge variant="secondary" className="text-xs">
                        IA: {chatbot.ai_provider.toUpperCase()}
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t">
                    {isAdmin && (
                      <Button 
                        variant="default" 
                        size="sm" 
                        className="flex-1"
                        onClick={() => handleFlowEditor(chatbot)}
                      >
                        <Edit className="h-4 w-4 mr-1" />
                        Editar Fluxo
                      </Button>
                    )}
                    {isAdmin && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleToggle(chatbot)}
                        title={chatbot.is_active ? "Desativar" : "Ativar"}
                      >
                        {chatbot.is_active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </Button>
                    )}
                    {isAdmin && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDeleteClick(chatbot)}
                        title="Excluir"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Info Card */}
        <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GitBranch className="h-5 w-5 text-primary" />
              Sobre os Fluxos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Os fluxos de atendimento permitem criar árvores de decisão visuais para guiar seus clientes. 
              Use o editor de fluxos para criar menus, condições, transferências para departamentos e muito mais.
              Para criar um novo fluxo, acesse a página de <strong>Chatbots</strong> e crie um chatbot do tipo "Fluxo" ou "Híbrido".
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Flow Editor Dialog */}
      <FlowEditorDialog
        open={flowEditorOpen}
        chatbot={flowChatbot}
        onClose={() => {
          setFlowEditorOpen(false);
          setFlowChatbot(null);
          loadChatbots();
        }}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Fluxo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O fluxo "{chatbotToDelete?.name}" será excluído permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteConfirm}
              className="bg-destructive hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
};

export default Fluxos;
