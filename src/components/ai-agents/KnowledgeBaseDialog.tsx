import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { 
  Database, FileText, Globe, Type, Plus, Trash2, 
  RefreshCw, Upload, Loader2, CheckCircle, XCircle, Clock,
  ExternalLink, File, X, Search, Sparkles, Cpu, Layers, Zap
} from 'lucide-react';
import { useAIAgents, AIAgent, KnowledgeSource } from '@/hooks/use-ai-agents';
import { api } from '@/lib/api';
import { useUpload } from '@/hooks/use-upload';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface KnowledgeBaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: AIAgent | null;
}

type AddMode = 'file' | 'url' | 'text';

const ACCEPTED_FILE_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'text/csv',
];

const FILE_EXTENSIONS = '.pdf,.docx,.txt,.md,.csv';

export function KnowledgeBaseDialog({ open, onOpenChange, agent }: KnowledgeBaseDialogProps) {
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [addMode, setAddMode] = useState<AddMode | null>(null);
  const [deleteSource, setDeleteSource] = useState<KnowledgeSource | null>(null);

  // Drag and drop
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Search test panel
  const [showTestPanel, setShowTestPanel] = useState(false);
  const [testQuery, setTestQuery] = useState('');
  const [testResults, setTestResults] = useState<Array<{ chunk_id: string; source_id: string; content: string; similarity: number; metadata?: any }>>([]);
  const [searching, setSearching] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    source_content: '',
    priority: 0,
  });
  const [saving, setSaving] = useState(false);

  const { 
    getKnowledgeSources, 
    addKnowledgeSource, 
    deleteKnowledgeSource, 
    reprocessKnowledgeSource 
  } = useAIAgents();

  const { uploadFile, isUploading, progress, resetProgress } = useUpload();

  useEffect(() => {
    if (open && agent) {
      loadSources();
    }
  }, [open, agent]);

  const loadSources = async () => {
    if (!agent) return;
    setLoading(true);
    const data = await getKnowledgeSources(agent.id);
    setSources(data);
    setLoading(false);
  };

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (ACCEPTED_FILE_TYPES.includes(file.type) || file.name.match(/\.(pdf|docx|txt|md|csv)$/i)) {
        setSelectedFile(file);
        setAddMode('file');
        setFormData(prev => ({
          ...prev,
          name: file.name.replace(/\.[^/.]+$/, ''), // Remove extension
        }));
      } else {
        toast.error('Formato não suportado. Use PDF, DOCX, TXT, MD ou CSV.');
      }
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setFormData(prev => ({
        ...prev,
        name: file.name.replace(/\.[^/.]+$/, ''),
      }));
    }
  }, []);

  const handleAdd = async () => {
    if (!agent || !addMode) return;

    if (!formData.name.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }

    // For file mode, we need to upload first
    if (addMode === 'file') {
      if (!selectedFile) {
        toast.error('Selecione um arquivo');
        return;
      }

      setSaving(true);
      try {
        const fileUrl = await uploadFile(selectedFile);
        if (!fileUrl) {
          toast.error('Erro ao fazer upload do arquivo');
          return;
        }

        const result = await addKnowledgeSource(agent.id, {
          source_type: 'file',
          name: formData.name,
          description: formData.description,
          source_content: fileUrl,
          priority: formData.priority,
          file_type: selectedFile.type,
          file_size: selectedFile.size,
          original_filename: selectedFile.name,
        });

        if (result) {
          setSources(prev => [result, ...prev]);
          toast.success('Arquivo adicionado com sucesso');
          resetForm();
        }
      } catch (err) {
        toast.error('Erro ao fazer upload do arquivo');
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!formData.source_content.trim()) {
      toast.error('Conteúdo é obrigatório');
      return;
    }

    setSaving(true);
    try {
      const result = await addKnowledgeSource(agent.id, {
        source_type: addMode,
        name: formData.name,
        description: formData.description,
        source_content: formData.source_content,
        priority: formData.priority,
      });

      if (result) {
        setSources(prev => [result, ...prev]);
        toast.success('Fonte adicionada');
        resetForm();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!agent || !deleteSource) return;

    const success = await deleteKnowledgeSource(agent.id, deleteSource.id);
    if (success) {
      setSources(prev => prev.filter(s => s.id !== deleteSource.id));
      toast.success('Fonte removida');
    }
    setDeleteSource(null);
  };

  const handleReprocess = async (source: KnowledgeSource) => {
    if (!agent) return;

    const success = await reprocessKnowledgeSource(agent.id, source.id);
    if (success) {
      setSources(prev => prev.map(s => 
        s.id === source.id ? { ...s, status: 'pending' } : s
      ));
      toast.success('Reprocessamento iniciado');
    }
  };

  const resetForm = () => {
    setAddMode(null);
    setSelectedFile(null);
    resetProgress();
    setFormData({
      name: '',
      description: '',
      source_content: '',
      priority: 0,
    });
  };

  const handleTestSearch = async () => {
    if (!agent || !testQuery.trim()) return;
    setSearching(true);
    setTestResults([]);
    try {
      const data = await api<{ results: typeof testResults }>(`/api/ai-agents/${agent.id}/knowledge/search`, {
        method: 'POST',
        body: { query: testQuery, top_k: 5 },
        auth: true,
      });
      setTestResults(data.results || []);
      if (!data.results?.length) {
        toast.info('Nenhum chunk encontrado para essa busca');
      }
    } catch (err) {
      toast.error('Erro ao buscar na base de conhecimento');
    } finally {
      setSearching(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <Badge variant="default" className="bg-green-500">
            <CheckCircle className="h-3 w-3 mr-1" />
            Processado
          </Badge>
        );
      case 'processing':
        return (
          <Badge variant="secondary">
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            Processando
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />
            Erro
          </Badge>
        );
      default:
        return (
          <Badge variant="outline">
            <Clock className="h-3 w-3 mr-1" />
            Pendente
          </Badge>
        );
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'file':
        return <FileText className="h-4 w-4" />;
      case 'url':
        return <Globe className="h-4 w-4" />;
      case 'text':
        return <Type className="h-4 w-4" />;
      default:
        return <Database className="h-4 w-4" />;
    }
  };

  const formatBytes = (bytes: number) => {
    if (!bytes) return '-';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  if (!agent) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] p-0">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              Base de Conhecimento
            </DialogTitle>
            <DialogDescription>
              Gerencie as fontes de informação do agente "{agent.name}"
            </DialogDescription>
          </DialogHeader>

          <div className="p-6 pt-4">
            {/* Drag and Drop Zone when no mode selected */}
            {!addMode && (
              <>
                <div
                  className={`border-2 border-dashed rounded-lg p-8 mb-6 transition-colors ${
                    isDragOver 
                      ? 'border-primary bg-primary/5' 
                      : 'border-muted-foreground/25 hover:border-muted-foreground/50'
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <div className="flex flex-col items-center justify-center text-center">
                    <Upload className={`h-10 w-10 mb-3 ${isDragOver ? 'text-primary' : 'text-muted-foreground'}`} />
                    <h3 className="font-medium mb-1">Arraste arquivos aqui</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      ou clique nos botões abaixo para adicionar fontes
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Formatos suportados: PDF, DOCX, TXT, MD, CSV
                    </p>
                  </div>
                </div>

                {/* Add Buttons */}
                <div className="grid grid-cols-3 gap-3 mb-6">
                  <Button
                    variant="outline"
                    className="h-16 flex-col gap-1"
                    onClick={() => setAddMode('file')}
                  >
                    <FileText className="h-5 w-5" />
                    <span className="text-xs">Arquivo</span>
                  </Button>
                  <Button
                    variant="outline"
                    className="h-16 flex-col gap-1"
                    onClick={() => setAddMode('url')}
                  >
                    <Globe className="h-5 w-5" />
                    <span className="text-xs">URL/Site</span>
                  </Button>
                  <Button
                    variant="outline"
                    className="h-16 flex-col gap-1"
                    onClick={() => setAddMode('text')}
                  >
                    <Type className="h-5 w-5" />
                    <span className="text-xs">Texto</span>
                  </Button>
                </div>
              </>
            )}

            {/* Add Form */}
            {addMode && (
              <div className="border rounded-lg p-4 mb-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium flex items-center gap-2">
                    {getTypeIcon(addMode)}
                    {addMode === 'file' && 'Adicionar Arquivo'}
                    {addMode === 'url' && 'Adicionar URL'}
                    {addMode === 'text' && 'Adicionar Texto'}
                  </h3>
                  <Button variant="ghost" size="sm" onClick={resetForm}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid gap-4">
                  {addMode === 'file' && (
                    <>
                      {/* File Upload Area */}
                      {!selectedFile ? (
                        <div
                          className={`border-2 border-dashed rounded-lg p-6 transition-colors cursor-pointer ${
                            isDragOver 
                              ? 'border-primary bg-primary/5' 
                              : 'border-muted-foreground/25 hover:border-primary/50'
                          }`}
                          onDragOver={handleDragOver}
                          onDragLeave={handleDragLeave}
                          onDrop={handleDrop}
                          onClick={() => document.getElementById('file-input')?.click()}
                        >
                          <div className="flex flex-col items-center justify-center text-center">
                            <Upload className="h-8 w-8 mb-2 text-muted-foreground" />
                            <p className="text-sm font-medium">Clique ou arraste um arquivo</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              PDF, DOCX, TXT, MD ou CSV (máx. 20MB)
                            </p>
                          </div>
                          <input
                            id="file-input"
                            type="file"
                            className="hidden"
                            accept={FILE_EXTENSIONS}
                            onChange={handleFileSelect}
                          />
                        </div>
                      ) : (
                        <div className="border rounded-lg p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div className="p-2 rounded-lg bg-primary/10">
                                <File className="h-5 w-5 text-primary" />
                              </div>
                              <div>
                                <p className="font-medium text-sm truncate max-w-[200px]">
                                  {selectedFile.name}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {formatBytes(selectedFile.size)}
                                </p>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setSelectedFile(null);
                                resetProgress();
                              }}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>

                          {/* Upload Progress */}
                          {(isUploading || progress > 0) && (
                            <div className="space-y-2">
                              <div className="flex justify-between text-xs">
                                <span>{isUploading ? 'Fazendo upload...' : 'Pronto'}</span>
                                <span>{progress}%</span>
                              </div>
                              <Progress value={progress} className="h-2" />
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  <div className="grid gap-2">
                    <Label>Nome *</Label>
                    <Input
                      placeholder="Ex: Manual do Produto"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label>Descrição</Label>
                    <Input
                      placeholder="Descrição opcional..."
                      value={formData.description}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    />
                  </div>

                  {addMode === 'url' && (
                    <div className="grid gap-2">
                      <Label>URL da Página *</Label>
                      <Input
                        placeholder="https://exemplo.com/pagina"
                        value={formData.source_content}
                        onChange={(e) => setFormData(prev => ({ ...prev, source_content: e.target.value }))}
                      />
                      <p className="text-xs text-muted-foreground">
                        O conteúdo da página será extraído e processado automaticamente.
                      </p>
                    </div>
                  )}

                  {addMode === 'text' && (
                    <div className="grid gap-2">
                      <Label>Conteúdo *</Label>
                      <Textarea
                        placeholder="Cole aqui o texto que o agente deve conhecer..."
                        value={formData.source_content}
                        onChange={(e) => setFormData(prev => ({ ...prev, source_content: e.target.value }))}
                        rows={6}
                      />
                    </div>
                  )}

                  <Button onClick={handleAdd} disabled={saving || isUploading}>
                    {saving || isUploading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        {isUploading ? 'Enviando arquivo...' : 'Adicionando...'}
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4 mr-2" />
                        Adicionar Fonte
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Test Search Panel */}
            {showTestPanel && (
              <div className="border rounded-lg p-4 mb-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium flex items-center gap-2">
                    <Search className="h-4 w-4 text-primary" />
                    Teste de Busca RAG
                  </h3>
                  <Button variant="ghost" size="sm" onClick={() => { setShowTestPanel(false); setTestResults([]); setTestQuery(''); }}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Digite uma pergunta para testar a busca..."
                    value={testQuery}
                    onChange={(e) => setTestQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && testQuery.trim()) handleTestSearch();
                    }}
                  />
                  <Button
                    onClick={handleTestSearch}
                    disabled={searching || !testQuery.trim()}
                    size="sm"
                    className="shrink-0"
                  >
                    {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>

                {testResults.length > 0 && (
                  <ScrollArea className="h-[250px]">
                    <div className="space-y-3">
                      {testResults.map((result, idx) => {
                        const sourceName = sources.find(s => s.id === result.source_id)?.name || 'Fonte desconhecida';
                        const simPercent = (result.similarity * 100).toFixed(1);
                        const barColor = result.similarity >= 0.7 ? 'bg-green-500' : result.similarity >= 0.5 ? 'bg-yellow-500' : 'bg-orange-500';
                        return (
                          <div key={result.chunk_id || idx} className="border rounded-lg p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs font-mono">#{idx + 1}</Badge>
                                <span className="text-xs text-muted-foreground truncate max-w-[180px]">{sourceName}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="w-16 h-2 rounded-full bg-muted overflow-hidden">
                                  <div className={`h-full rounded-full ${barColor}`} style={{ width: `${simPercent}%` }} />
                                </div>
                                <Badge variant="secondary" className="text-xs font-mono">{simPercent}%</Badge>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap line-clamp-4">
                              {result.content}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}

                {testResults.length === 0 && !searching && testQuery && (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    Nenhum resultado. Verifique se as fontes foram processadas.
                  </p>
                )}
              </div>
            )}

            {/* Sources List */}
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-muted-foreground">
                {sources.length} fonte{sources.length !== 1 ? 's' : ''}
              </h3>
              {sources.length > 0 && !showTestPanel && (
                <Button variant="outline" size="sm" onClick={() => setShowTestPanel(true)} className="gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" />
                  Testar Busca
                </Button>
              )}
            </div>
            <ScrollArea className="h-[300px]">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : sources.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Database className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="font-medium mb-1">Nenhuma fonte adicionada</h3>
                  <p className="text-sm text-muted-foreground">
                    Adicione arquivos, URLs ou textos para o agente usar como referência
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {sources.map((source) => {
                    const isProcessing = source.status === 'processing';
                    const isCompleted = source.status === 'completed';
                    const isPending = source.status === 'pending';
                    return (
                    <div
                      key={source.id}
                      className="flex items-start gap-4 p-4 border rounded-lg"
                    >
                      <div className="p-2 rounded-lg bg-muted">
                        {getTypeIcon(source.source_type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium truncate">{source.name}</h4>
                          {getStatusBadge(source.status)}
                        </div>
                        {source.description && (
                          <p className="text-sm text-muted-foreground mb-2">
                            {source.description}
                          </p>
                        )}

                        {/* Processing progress bar */}
                        {(isProcessing || isPending) && (
                          <div className="mb-2 space-y-1">
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>{isProcessing ? 'Processando...' : 'Aguardando processamento'}</span>
                              {isProcessing && <span className="animate-pulse">Extraindo e gerando embeddings</span>}
                            </div>
                            <Progress value={isProcessing ? 50 : 0} className="h-1.5" />
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          {source.source_type === 'file' && source.file_size && (
                            <span>{formatBytes(source.file_size)}</span>
                          )}
                          {source.source_type === 'url' && (
                            <a
                              href={source.source_content}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 hover:text-primary"
                            >
                              <ExternalLink className="h-3 w-3" />
                              Abrir URL
                            </a>
                          )}
                          {source.chunk_count > 0 && (
                            <span className="flex items-center gap-1">
                              <Layers className="h-3 w-3" />
                              {source.chunk_count} chunks
                            </span>
                          )}
                          {source.total_tokens > 0 && (
                            <span className="flex items-center gap-1">
                              <Zap className="h-3 w-3" />
                              {source.total_tokens.toLocaleString()} tokens
                            </span>
                          )}
                          {isCompleted && source.embedding_model && (
                            <span className="flex items-center gap-1">
                              <Cpu className="h-3 w-3" />
                              {source.embedding_model}
                              {source.embedding_dimensions ? ` (${source.embedding_dimensions}d)` : ''}
                            </span>
                          )}
                          {source.processed_at && (
                            <span>
                              Processado em {new Date(source.processed_at).toLocaleDateString('pt-BR')}
                            </span>
                          )}
                        </div>
                        {source.error_message && (
                          <p className="text-xs text-destructive mt-2">
                            {source.error_message}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleReprocess(source)}
                          disabled={source.status === 'processing'}
                        >
                          <RefreshCw className={`h-4 w-4 ${source.status === 'processing' ? 'animate-spin' : ''}`} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteSource(source)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteSource} onOpenChange={() => setDeleteSource(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover fonte?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover "{deleteSource?.name}"? 
              O agente não terá mais acesso a essas informações.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
