import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useFlows, Flow } from '@/hooks/use-flows';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { 
  GitBranch, Plus, Pencil, Trash2, Copy, 
  Tag, Loader2, Clock, Layers, Play, Search, 
  CheckCircle, Hash
} from 'lucide-react';
import { FlowEditorFullscreen } from '@/components/flows/FlowEditorFullscreen';

export default function Fluxos() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loadingFlows, setLoadingFlows] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Dialogs
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedFlow, setSelectedFlow] = useState<Flow | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    trigger_enabled: false,
    trigger_keywords: '',
    trigger_match_mode: 'exact' as 'exact' | 'contains' | 'starts_with'
  });

  const { user } = useAuth();
  const { loading, error, getFlows, createFlow, updateFlow, deleteFlow, toggleFlow, duplicateFlow } = useFlows();

  const isAdmin = user?.role && ['owner', 'admin', 'manager'].includes(user.role);

  useEffect(() => {
    loadFlows();
  }, []);

  const loadFlows = async () => {
    setLoadingFlows(true);
    const data = await getFlows();
    setFlows(data);
    setLoadingFlows(false);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      trigger_enabled: false,
      trigger_keywords: '',
      trigger_match_mode: 'exact'
    });
  };

  const handleCreate = async () => {
    if (!formData.name.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }

    const keywords = formData.trigger_keywords
      .split(',')
      .map(k => k.trim().toLowerCase())
      .filter(k => k);

    const result = await createFlow({
      name: formData.name,
      description: formData.description || null,
      trigger_enabled: formData.trigger_enabled,
      trigger_keywords: keywords,
      trigger_match_mode: formData.trigger_match_mode
    });

    if (result) {
      toast.success('Fluxo criado! Clique em "Editar" para construir o fluxo.');
      setCreateDialogOpen(false);
      resetForm();
      loadFlows();
    } else if (error) {
      toast.error(error);
    }
  };

  const handleEdit = async () => {
    if (!selectedFlow) return;

    const keywords = formData.trigger_keywords
      .split(',')
      .map(k => k.trim().toLowerCase())
      .filter(k => k);

    const result = await updateFlow(selectedFlow.id, {
      name: formData.name,
      description: formData.description || null,
      trigger_enabled: formData.trigger_enabled,
      trigger_keywords: keywords,
      trigger_match_mode: formData.trigger_match_mode
    });

    if (result) {
      toast.success('Fluxo atualizado!');
      setEditDialogOpen(false);
      loadFlows();
    } else if (error) {
      toast.error(error);
    }
  };

  const handleOpenEdit = (flow: Flow) => {
    setSelectedFlow(flow);
    setFormData({
      name: flow.name,
      description: flow.description || '',
      trigger_enabled: flow.trigger_enabled,
      trigger_keywords: flow.trigger_keywords?.join(', ') || '',
      trigger_match_mode: flow.trigger_match_mode
    });
    setEditDialogOpen(true);
  };

  const handleOpenEditor = (flow: Flow) => {
    setSelectedFlow(flow);
    setEditorOpen(true);
  };

  const handleToggle = async (flow: Flow) => {
    const result = await toggleFlow(flow.id);
    if (result) {
      setFlows(prev => prev.map(f => f.id === flow.id ? result : f));
      toast.success(result.is_active ? 'Fluxo ativado' : 'Fluxo desativado');
    }
  };

  const handleDuplicate = async (flow: Flow) => {
    const result = await duplicateFlow(flow.id);
    if (result) {
      toast.success('Fluxo duplicado!');
      loadFlows();
    } else if (error) {
      toast.error(error);
    }
  };

  const handleDelete = async (flow: Flow) => {
    const success = await deleteFlow(flow.id);
    if (success) {
      toast.success('Fluxo deletado');
      loadFlows();
    } else if (error) {
      toast.error(error);
    }
  };

  const filteredFlows = flows.filter(flow =>
    flow.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    flow.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    flow.trigger_keywords?.some(k => k.includes(searchQuery.toLowerCase()))
  );

  const matchModeLabels = {
    exact: 'Exato',
    contains: 'Contém',
    starts_with: 'Começa com'
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <GitBranch className="h-8 w-8 text-primary" />
              Fluxos
            </h1>
            <p className="text-muted-foreground">
              Crie fluxos visuais de automação para seus chatbots
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar fluxos..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-64"
              />
            </div>
            
            {isAdmin && (
              <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Novo Fluxo
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Criar Novo Fluxo</DialogTitle>
                    <DialogDescription>
                      Configure as informações básicas do fluxo
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Nome *</Label>
                      <Input
                        placeholder="Ex: Atendimento inicial"
                        value={formData.name}
                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Descrição</Label>
                      <Textarea
                        placeholder="Descreva o objetivo do fluxo..."
                        value={formData.description}
                        onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                        rows={3}
                      />
                    </div>

                    <div className="border rounded-lg p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label className="flex items-center gap-2">
                            <Tag className="h-4 w-4" />
                            Ativar por Palavra-chave
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            Inicia o fluxo quando o cliente digitar uma palavra
                          </p>
                        </div>
                        <Switch
                          checked={formData.trigger_enabled}
                          onCheckedChange={(checked) => setFormData(prev => ({ ...prev, trigger_enabled: checked }))}
                        />
                      </div>

                      {formData.trigger_enabled && (
                        <>
                          <div className="space-y-2">
                            <Label>Palavras-chave (separadas por vírgula)</Label>
                            <Input
                              placeholder="oi, olá, menu, ajuda"
                              value={formData.trigger_keywords}
                              onChange={(e) => setFormData(prev => ({ ...prev, trigger_keywords: e.target.value }))}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Tipo de correspondência</Label>
                            <Select 
                              value={formData.trigger_match_mode} 
                              onValueChange={(v: any) => setFormData(prev => ({ ...prev, trigger_match_mode: v }))}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="exact">Exato - mensagem igual à palavra</SelectItem>
                                <SelectItem value="contains">Contém - mensagem contém a palavra</SelectItem>
                                <SelectItem value="starts_with">Começa com - mensagem inicia com a palavra</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => { setCreateDialogOpen(false); resetForm(); }}>
                      Cancelar
                    </Button>
                    <Button onClick={handleCreate} disabled={loading}>
                      {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Criar Fluxo
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-primary/10">
                  <Layers className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{flows.length}</p>
                  <p className="text-sm text-muted-foreground">Total de Fluxos</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-green-500/10">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{flows.filter(f => f.is_active).length}</p>
                  <p className="text-sm text-muted-foreground">Ativos</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-purple-500/10">
                  <Tag className="h-5 w-5 text-purple-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{flows.filter(f => f.trigger_enabled).length}</p>
                  <p className="text-sm text-muted-foreground">Com Gatilho</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-orange-500/10">
                  <Clock className="h-5 w-5 text-orange-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{flows.filter(f => f.is_draft).length}</p>
                  <p className="text-sm text-muted-foreground">Rascunhos</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Flows List */}
        {loadingFlows ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredFlows.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <GitBranch className="h-16 w-16 text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-medium mb-2">
                {searchQuery ? 'Nenhum fluxo encontrado' : 'Nenhum fluxo criado'}
              </h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery 
                  ? 'Tente buscar com outros termos' 
                  : 'Crie seu primeiro fluxo visual para automatizar atendimentos'}
              </p>
              {!searchQuery && isAdmin && (
                <Button onClick={() => setCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Criar Primeiro Fluxo
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredFlows.map((flow) => (
              <Card key={flow.id} className="group hover:border-primary/50 transition-colors">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${flow.is_active ? 'bg-green-500/10' : 'bg-muted'}`}>
                        <GitBranch className={`h-5 w-5 ${flow.is_active ? 'text-green-500' : 'text-muted-foreground'}`} />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{flow.name}</CardTitle>
                        {flow.description && (
                          <CardDescription className="line-clamp-1">
                            {flow.description}
                          </CardDescription>
                        )}
                      </div>
                    </div>
                    <Switch
                      checked={flow.is_active}
                      onCheckedChange={() => handleToggle(flow)}
                      disabled={!isAdmin}
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Status badges */}
                  <div className="flex flex-wrap gap-2">
                    {flow.is_draft && (
                      <Badge variant="secondary" className="text-xs">
                        Rascunho
                      </Badge>
                    )}
                    {flow.trigger_enabled && (
                      <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-600 border-purple-500/30">
                        <Tag className="h-3 w-3 mr-1" />
                        Gatilho
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-xs">
                      <Hash className="h-3 w-3 mr-1" />
                      {flow.node_count || 0} nós
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      v{flow.version}
                    </Badge>
                  </div>

                  {/* Keywords */}
                  {flow.trigger_enabled && flow.trigger_keywords?.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">
                        Palavras-chave ({matchModeLabels[flow.trigger_match_mode]}):
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {flow.trigger_keywords.slice(0, 5).map((keyword, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {keyword}
                          </Badge>
                        ))}
                        {flow.trigger_keywords.length > 5 && (
                          <Badge variant="secondary" className="text-xs">
                            +{flow.trigger_keywords.length - 5}
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  {isAdmin && (
                    <div className="flex items-center gap-2 pt-2">
                      <Button 
                        className="flex-1" 
                        onClick={() => handleOpenEditor(flow)}
                      >
                        <Play className="h-4 w-4 mr-2" />
                        Editar Fluxo
                      </Button>
                      <Button 
                        variant="outline" 
                        size="icon"
                        onClick={() => handleOpenEdit(flow)}
                        title="Configurações"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="outline" 
                        size="icon"
                        onClick={() => handleDuplicate(flow)}
                        title="Duplicar"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="icon" className="text-destructive hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Deletar fluxo?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta ação não pode ser desfeita. O fluxo "{flow.name}" será permanentemente removido.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction 
                              onClick={() => handleDelete(flow)}
                              className="bg-destructive hover:bg-destructive/90"
                            >
                              Deletar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  )}

                  {/* Last updated */}
                  <p className="text-xs text-muted-foreground">
                    Atualizado em {new Date(flow.updated_at).toLocaleDateString('pt-BR')}
                    {flow.last_edited_by_name && ` por ${flow.last_edited_by_name}`}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Fluxo</DialogTitle>
            <DialogDescription>
              Atualize as configurações do fluxo
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
              />
            </div>

            <div className="border rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="flex items-center gap-2">
                    <Tag className="h-4 w-4" />
                    Ativar por Palavra-chave
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Inicia o fluxo quando o cliente digitar uma palavra
                  </p>
                </div>
                <Switch
                  checked={formData.trigger_enabled}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, trigger_enabled: checked }))}
                />
              </div>

              {formData.trigger_enabled && (
                <>
                  <div className="space-y-2">
                    <Label>Palavras-chave (separadas por vírgula)</Label>
                    <Input
                      placeholder="oi, olá, menu, ajuda"
                      value={formData.trigger_keywords}
                      onChange={(e) => setFormData(prev => ({ ...prev, trigger_keywords: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tipo de correspondência</Label>
                    <Select 
                      value={formData.trigger_match_mode} 
                      onValueChange={(v: any) => setFormData(prev => ({ ...prev, trigger_match_mode: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="exact">Exato</SelectItem>
                        <SelectItem value="contains">Contém</SelectItem>
                        <SelectItem value="starts_with">Começa com</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleEdit} disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Flow Editor Fullscreen */}
      {selectedFlow && (
        <FlowEditorFullscreen
          open={editorOpen}
          flow={selectedFlow}
          onClose={() => {
            setEditorOpen(false);
            setSelectedFlow(null);
            loadFlows();
          }}
        />
      )}
    </MainLayout>
  );
}
