import { useState, useEffect, useRef } from 'react';
import { Node } from 'reactflow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { 
  X, Plus, Trash2, GripVertical, MessageSquare, List, 
  FormInput, GitBranch, Zap, ArrowRightLeft, Sparkles, 
  Clock, Webhook, Image, Images, FileText, Video, Mic, Upload, Loader2
} from 'lucide-react';
import { FlowNodeData } from '@/components/chatbots/FlowNodes';
import { useUpload } from '@/hooks/use-upload';
import { toast } from 'sonner';

interface NodeEditorPanelProps {
  node: Node<FlowNodeData>;
  onSave: (content: Record<string, any>) => void;
  onClose: () => void;
}

interface MenuOption {
  id: string;
  label: string;
  value: string;
}

interface ConditionRule {
  id: string;
  variable: string;
  operator: string;
  value: string;
}

interface WebhookHeader {
  id: string;
  key: string;
  value: string;
}

export function NodeEditorPanel({ node, onSave, onClose }: NodeEditorPanelProps) {
  const [content, setContent] = useState<Record<string, any>>(node.data.content || {});
  const [label, setLabel] = useState(node.data.label || '');

  useEffect(() => {
    setContent(node.data.content || {});
    setLabel(node.data.label || '');
  }, [node.id]);

  const handleSave = () => {
    onSave({ ...content, label });
  };

  const getNodeIcon = () => {
    const icons: Record<string, React.ReactNode> = {
      message: <MessageSquare className="h-5 w-5" />,
      menu: <List className="h-5 w-5" />,
      input: <FormInput className="h-5 w-5" />,
      condition: <GitBranch className="h-5 w-5" />,
      action: <Zap className="h-5 w-5" />,
      transfer: <ArrowRightLeft className="h-5 w-5" />,
      ai_response: <Sparkles className="h-5 w-5" />,
      delay: <Clock className="h-5 w-5" />,
      webhook: <Webhook className="h-5 w-5" />,
    };
    return icons[node.type || ''] || <MessageSquare className="h-5 w-5" />;
  };

  const getNodeTitle = () => {
    const titles: Record<string, string> = {
      message: 'Mensagem',
      menu: 'Menu de Opções',
      input: 'Coleta de Dados',
      condition: 'Condição',
      action: 'Ação',
      transfer: 'Transferência',
      ai_response: 'Resposta IA',
      delay: 'Delay',
      webhook: 'Webhook',
    };
    return titles[node.type || ''] || 'Editar Nó';
  };

  return (
    <div className="w-96 border-l bg-card flex flex-col h-full">
      <div className="p-4 border-b flex items-center justify-between bg-muted/50">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            {getNodeIcon()}
          </div>
          <div>
            <h3 className="font-semibold">{getNodeTitle()}</h3>
            <p className="text-xs text-muted-foreground">ID: {node.id}</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Nome do nó - comum a todos */}
          <div className="space-y-2">
            <Label>Nome do Nó</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Nome identificador"
            />
          </div>

          {/* Editor específico por tipo */}
          {node.type === 'message' && (
            <MessageNodeEditor content={content} onChange={setContent} />
          )}
          {node.type === 'menu' && (
            <MenuNodeEditor content={content} onChange={setContent} />
          )}
          {node.type === 'input' && (
            <InputNodeEditor content={content} onChange={setContent} />
          )}
          {node.type === 'condition' && (
            <ConditionNodeEditor content={content} onChange={setContent} />
          )}
          {node.type === 'action' && (
            <ActionNodeEditor content={content} onChange={setContent} />
          )}
          {node.type === 'transfer' && (
            <TransferNodeEditor content={content} onChange={setContent} />
          )}
          {node.type === 'ai_response' && (
            <AIResponseNodeEditor content={content} onChange={setContent} />
          )}
          {node.type === 'delay' && (
            <DelayNodeEditor content={content} onChange={setContent} />
          )}
          {node.type === 'webhook' && (
            <WebhookNodeEditor content={content} onChange={setContent} />
          )}
        </div>
      </ScrollArea>

      <div className="p-4 border-t bg-muted/30">
        <Button onClick={handleSave} className="w-full">
          Aplicar Alterações
        </Button>
      </div>
    </div>
  );
}

// ============ Message Node Editor ============
function MessageNodeEditor({ content, onChange }: { content: Record<string, any>; onChange: (c: Record<string, any>) => void }) {
  const { uploadFile, isUploading } = useUpload();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [uploadingGallery, setUploadingGallery] = useState(0);

  const MAX_GALLERY_IMAGES = 10;
  const galleryImages: { url: string; fileName?: string }[] = content.gallery_images || [];

  const handleFileUpload = async (file: File, mediaType: 'image' | 'video' | 'audio') => {
    try {
      const url = await uploadFile(file);
      if (url) {
        onChange({ ...content, media_url: url, media_type: mediaType });
        toast.success('Arquivo enviado com sucesso!');
      }
    } catch (error) {
      toast.error('Erro ao enviar arquivo');
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file, 'image');
    e.target.value = '';
  };

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file, 'video');
    e.target.value = '';
  };

  const handleAudioSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file, 'audio');
    e.target.value = '';
  };

  const handleGallerySelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const availableSlots = MAX_GALLERY_IMAGES - galleryImages.length;
    const filesToUpload = Array.from(files).slice(0, availableSlots);

    if (files.length > availableSlots) {
      toast.warning(`Limite de ${MAX_GALLERY_IMAGES} imagens. ${files.length - availableSlots} ignorado(s).`);
    }

    setUploadingGallery(filesToUpload.length);
    const newImages: { url: string; fileName: string }[] = [];

    for (const file of filesToUpload) {
      try {
        const url = await uploadFile(file);
        if (url) {
          newImages.push({ url, fileName: file.name });
        }
      } catch (error) {
        toast.error(`Erro ao enviar ${file.name}`);
      }
    }

    if (newImages.length > 0) {
      onChange({ 
        ...content, 
        gallery_images: [...galleryImages, ...newImages],
        media_type: 'gallery'
      });
      toast.success(`${newImages.length} imagem(ns) adicionada(s)!`);
    }

    setUploadingGallery(0);
    e.target.value = '';
  };

  const removeGalleryImage = (index: number) => {
    const updated = galleryImages.filter((_, i) => i !== index);
    onChange({ 
      ...content, 
      gallery_images: updated,
      media_type: updated.length > 0 ? 'gallery' : 'text'
    });
  };

  return (
    <Tabs defaultValue={content.media_type === 'gallery' ? 'gallery' : 'text'} className="w-full">
      <TabsList className="grid w-full grid-cols-5">
        <TabsTrigger value="text" className="text-xs"><FileText className="h-3 w-3" /></TabsTrigger>
        <TabsTrigger value="image" className="text-xs"><Image className="h-3 w-3" /></TabsTrigger>
        <TabsTrigger value="gallery" className="text-xs relative">
          <Images className="h-3 w-3" />
          {galleryImages.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[8px] rounded-full w-3 h-3 flex items-center justify-center">
              {galleryImages.length}
            </span>
          )}
        </TabsTrigger>
        <TabsTrigger value="video" className="text-xs"><Video className="h-3 w-3" /></TabsTrigger>
        <TabsTrigger value="audio" className="text-xs"><Mic className="h-3 w-3" /></TabsTrigger>
      </TabsList>

      <TabsContent value="text" className="space-y-3 mt-3">
        <div className="space-y-2">
          <Label>Mensagem de Texto</Label>
          <Textarea
            value={content.text || ''}
            onChange={(e) => onChange({ ...content, text: e.target.value, media_type: 'text' })}
            placeholder="Digite a mensagem..."
            rows={5}
            className="resize-none"
          />
          <p className="text-xs text-muted-foreground">
            Use {'{variavel}'} para inserir variáveis coletadas
          </p>
        </div>
        <div className="flex items-center justify-between">
          <Label className="text-sm">Simular digitação</Label>
          <Switch
            checked={content.typing || false}
            onCheckedChange={(v) => onChange({ ...content, typing: v })}
          />
        </div>
      </TabsContent>

      <TabsContent value="image" className="space-y-3 mt-3">
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageSelect}
        />
        <div className="space-y-2">
          <Label>Imagem</Label>
          <div className="flex gap-2">
            <Input
              value={content.media_url || ''}
              onChange={(e) => onChange({ ...content, media_url: e.target.value, media_type: 'image' })}
              placeholder="https://... ou faça upload"
              className="flex-1"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => imageInputRef.current?.click()}
              disabled={isUploading}
            >
              {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            </Button>
          </div>
          {content.media_url && content.media_type === 'image' && (
            <div className="relative mt-2 rounded-lg overflow-hidden border">
              <img src={content.media_url} alt="Preview" className="w-full h-32 object-cover" />
              <Button
                variant="destructive"
                size="icon"
                className="absolute top-2 right-2 h-6 w-6"
                onClick={() => onChange({ ...content, media_url: '', media_type: 'text' })}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
        <div className="space-y-2">
          <Label>Legenda (opcional)</Label>
          <Textarea
            value={content.caption || ''}
            onChange={(e) => onChange({ ...content, caption: e.target.value })}
            placeholder="Descrição da imagem..."
            rows={2}
          />
        </div>
      </TabsContent>

      <TabsContent value="gallery" className="space-y-3 mt-3">
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          multiple
          className="hidden"
          onChange={handleGallerySelect}
        />
        
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2">
              <Images className="h-4 w-4 text-teal-500" />
              Galeria de Imagens
            </Label>
            <span className="text-xs text-muted-foreground">
              {galleryImages.length}/{MAX_GALLERY_IMAGES}
            </span>
          </div>
          
          <p className="text-xs text-muted-foreground">
            Envie até {MAX_GALLERY_IMAGES} imagens em sequência (delay de 1.5s entre cada)
          </p>
        </div>

        {/* Gallery Grid */}
        {galleryImages.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {galleryImages.map((img, idx) => (
              <div 
                key={idx} 
                className="relative aspect-square rounded-lg overflow-hidden bg-muted group"
              >
                <img
                  src={img.url}
                  alt={img.fileName || `Imagem ${idx + 1}`}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.src = "/placeholder.svg";
                  }}
                />
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-1 right-1 h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => removeGalleryImage(idx)}
                >
                  <X className="h-3 w-3" />
                </Button>
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] px-1 py-0.5 truncate">
                  {idx + 1}. {img.fileName || 'Imagem'}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Upload Button */}
        {galleryImages.length < MAX_GALLERY_IMAGES && (
          <Button 
            variant="outline" 
            className="w-full border-dashed h-16 flex flex-col gap-1"
            onClick={() => galleryInputRef.current?.click()}
            disabled={isUploading || uploadingGallery > 0}
          >
            {uploadingGallery > 0 ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-xs">Enviando {uploadingGallery} imagem(ns)...</span>
              </>
            ) : (
              <>
                <Upload className="h-5 w-5" />
                <span className="text-xs">
                  {galleryImages.length === 0 
                    ? `Selecione até ${MAX_GALLERY_IMAGES} imagens` 
                    : `Adicionar mais (${MAX_GALLERY_IMAGES - galleryImages.length} restantes)`
                  }
                </span>
              </>
            )}
          </Button>
        )}

        {/* Caption */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">
            Legenda (enviada com a primeira imagem)
          </Label>
          <Textarea
            value={content.caption || ''}
            onChange={(e) => onChange({ ...content, caption: e.target.value })}
            placeholder="Adicione uma legenda..."
            rows={2}
          />
        </div>
      </TabsContent>

      <TabsContent value="video" className="space-y-3 mt-3">
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={handleVideoSelect}
        />
        <div className="space-y-2">
          <Label>Vídeo</Label>
          <div className="flex gap-2">
            <Input
              value={content.media_url || ''}
              onChange={(e) => onChange({ ...content, media_url: e.target.value, media_type: 'video' })}
              placeholder="https://... ou faça upload"
              className="flex-1"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => videoInputRef.current?.click()}
              disabled={isUploading}
            >
              {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            </Button>
          </div>
          {content.media_url && content.media_type === 'video' && (
            <div className="relative mt-2 rounded-lg overflow-hidden border bg-muted p-3 flex items-center gap-2">
              <Video className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm truncate flex-1">{content.media_url}</span>
              <Button
                variant="destructive"
                size="icon"
                className="h-6 w-6"
                onClick={() => onChange({ ...content, media_url: '', media_type: 'text' })}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
        <div className="space-y-2">
          <Label>Legenda (opcional)</Label>
          <Textarea
            value={content.caption || ''}
            onChange={(e) => onChange({ ...content, caption: e.target.value })}
            rows={2}
          />
        </div>
      </TabsContent>

      <TabsContent value="audio" className="space-y-3 mt-3">
        <input
          ref={audioInputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={handleAudioSelect}
        />
        <div className="space-y-2">
          <Label>Áudio</Label>
          <div className="flex gap-2">
            <Input
              value={content.media_url || ''}
              onChange={(e) => onChange({ ...content, media_url: e.target.value, media_type: 'audio' })}
              placeholder="https://... ou faça upload"
              className="flex-1"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => audioInputRef.current?.click()}
              disabled={isUploading}
            >
              {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            </Button>
          </div>
          {content.media_url && content.media_type === 'audio' && (
            <div className="relative mt-2 rounded-lg overflow-hidden border bg-muted p-3 flex items-center gap-2">
              <Mic className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm truncate flex-1">{content.media_url}</span>
              <Button
                variant="destructive"
                size="icon"
                className="h-6 w-6"
                onClick={() => onChange({ ...content, media_url: '', media_type: 'text' })}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      </TabsContent>
    </Tabs>
  );
}

// ============ Menu Node Editor ============
function MenuNodeEditor({ content, onChange }: { content: Record<string, any>; onChange: (c: Record<string, any>) => void }) {
  const options: MenuOption[] = content.options || [];

  const addOption = () => {
    const newOption: MenuOption = {
      id: `opt_${Date.now()}`,
      label: '',
      value: String(options.length + 1),
    };
    onChange({ ...content, options: [...options, newOption] });
  };

  const updateOption = (id: string, field: string, value: string) => {
    const updated = options.map(opt => 
      opt.id === id ? { ...opt, [field]: value } : opt
    );
    onChange({ ...content, options: updated });
  };

  const removeOption = (id: string) => {
    onChange({ ...content, options: options.filter(opt => opt.id !== id) });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Mensagem do Menu</Label>
        <Textarea
          value={content.text || ''}
          onChange={(e) => onChange({ ...content, text: e.target.value })}
          placeholder="Olá! Escolha uma opção..."
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Opções do Menu</Label>
          <Button variant="outline" size="sm" onClick={addOption}>
            <Plus className="h-3 w-3 mr-1" />
            Adicionar
          </Button>
        </div>

        <div className="space-y-2">
          {options.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4 border-2 border-dashed rounded-lg">
              Nenhuma opção adicionada
            </p>
          ) : (
            options.map((opt, index) => (
              <Card key={opt.id} className="overflow-hidden">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="shrink-0">
                      {index + 1}
                    </Badge>
                    <Input
                      value={opt.label}
                      onChange={(e) => updateOption(opt.id, 'label', e.target.value)}
                      placeholder="Texto da opção"
                      className="flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-destructive hover:text-destructive"
                      onClick={() => removeOption(opt.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-20">Valor:</span>
                    <Input
                      value={opt.value}
                      onChange={(e) => updateOption(opt.id, 'value', e.target.value)}
                      placeholder="Valor/número"
                      className="flex-1 h-8 text-sm"
                    />
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Mensagem para opção inválida</Label>
        <Textarea
          value={content.invalid_message || ''}
          onChange={(e) => onChange({ ...content, invalid_message: e.target.value })}
          placeholder="Opção inválida. Tente novamente."
          rows={2}
        />
      </div>

      <div className="space-y-2">
        <Label>Tentativas máximas</Label>
        <Input
          type="number"
          min={1}
          max={10}
          value={content.max_attempts || 3}
          onChange={(e) => onChange({ ...content, max_attempts: parseInt(e.target.value) || 3 })}
        />
      </div>
    </div>
  );
}

// ============ Input Node Editor ============
function InputNodeEditor({ content, onChange }: { content: Record<string, any>; onChange: (c: Record<string, any>) => void }) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Pergunta ao usuário</Label>
        <Textarea
          value={content.text || ''}
          onChange={(e) => onChange({ ...content, text: e.target.value })}
          placeholder="Por favor, informe seu nome..."
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <Label>Salvar em variável</Label>
        <Input
          value={content.variable || ''}
          onChange={(e) => onChange({ ...content, variable: e.target.value })}
          placeholder="nome_cliente"
        />
        <p className="text-xs text-muted-foreground">
          Nome da variável para armazenar a resposta
        </p>
      </div>

      <div className="space-y-2">
        <Label>Tipo de validação</Label>
        <Select
          value={content.validation || 'text'}
          onValueChange={(v) => onChange({ ...content, validation: v })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="text">Texto livre</SelectItem>
            <SelectItem value="email">E-mail</SelectItem>
            <SelectItem value="phone">Telefone</SelectItem>
            <SelectItem value="number">Número</SelectItem>
            <SelectItem value="cpf">CPF</SelectItem>
            <SelectItem value="date">Data</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Mensagem de erro de validação</Label>
        <Textarea
          value={content.error_message || ''}
          onChange={(e) => onChange({ ...content, error_message: e.target.value })}
          placeholder="Formato inválido. Tente novamente."
          rows={2}
        />
      </div>

      <div className="flex items-center justify-between">
        <Label className="text-sm">Campo obrigatório</Label>
        <Switch
          checked={content.required !== false}
          onCheckedChange={(v) => onChange({ ...content, required: v })}
        />
      </div>
    </div>
  );
}

// ============ Condition Node Editor ============
function ConditionNodeEditor({ content, onChange }: { content: Record<string, any>; onChange: (c: Record<string, any>) => void }) {
  const rules: ConditionRule[] = content.rules || [{ id: 'rule_1', variable: '', operator: 'equals', value: '' }];

  const updateRule = (id: string, field: string, value: string) => {
    const updated = rules.map(r => r.id === id ? { ...r, [field]: value } : r);
    onChange({ ...content, rules: updated });
  };

  const addRule = () => {
    const newRule: ConditionRule = {
      id: `rule_${Date.now()}`,
      variable: '',
      operator: 'equals',
      value: '',
    };
    onChange({ ...content, rules: [...rules, newRule] });
  };

  const removeRule = (id: string) => {
    if (rules.length <= 1) return;
    onChange({ ...content, rules: rules.filter(r => r.id !== id) });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Lógica entre regras</Label>
        <Select
          value={content.logic || 'and'}
          onValueChange={(v) => onChange({ ...content, logic: v })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="and">E (todas devem ser verdadeiras)</SelectItem>
            <SelectItem value="or">OU (pelo menos uma verdadeira)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Regras de Condição</Label>
          <Button variant="outline" size="sm" onClick={addRule}>
            <Plus className="h-3 w-3 mr-1" />
            Regra
          </Button>
        </div>

        <div className="space-y-3">
          {rules.map((rule, index) => (
            <Card key={rule.id}>
              <CardHeader className="p-3 pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Regra {index + 1}</CardTitle>
                  {rules.length > 1 && (
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeRule(rule.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-3 pt-0 space-y-2">
                <Input
                  value={rule.variable}
                  onChange={(e) => updateRule(rule.id, 'variable', e.target.value)}
                  placeholder="Variável (ex: nome_cliente)"
                />
                <Select
                  value={rule.operator}
                  onValueChange={(v) => updateRule(rule.id, 'operator', v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="equals">Igual a</SelectItem>
                    <SelectItem value="not_equals">Diferente de</SelectItem>
                    <SelectItem value="contains">Contém</SelectItem>
                    <SelectItem value="not_contains">Não contém</SelectItem>
                    <SelectItem value="starts_with">Começa com</SelectItem>
                    <SelectItem value="ends_with">Termina com</SelectItem>
                    <SelectItem value="greater_than">Maior que</SelectItem>
                    <SelectItem value="less_than">Menor que</SelectItem>
                    <SelectItem value="is_empty">Está vazio</SelectItem>
                    <SelectItem value="is_not_empty">Não está vazio</SelectItem>
                  </SelectContent>
                </Select>
                {!['is_empty', 'is_not_empty'].includes(rule.operator) && (
                  <Input
                    value={rule.value}
                    onChange={(e) => updateRule(rule.id, 'value', e.target.value)}
                    placeholder="Valor para comparação"
                  />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground bg-muted p-3 rounded-lg">
        💡 Conecte a saída <Badge variant="outline" className="mx-1">Sim</Badge> para quando a condição for verdadeira 
        e <Badge variant="outline" className="mx-1">Não</Badge> para quando for falsa.
      </p>
    </div>
  );
}

// ============ Action Node Editor ============
function ActionNodeEditor({ content, onChange }: { content: Record<string, any>; onChange: (c: Record<string, any>) => void }) {
  const [tags, setTags] = useState<Array<{ id: string; name: string; color: string }>>([]);
  const [loadingTags, setLoadingTags] = useState(false);

  useEffect(() => {
    if (content.action_type === 'add_tag' || content.action_type === 'remove_tag') {
      loadTags();
    }
  }, [content.action_type]);

  const loadTags = async () => {
    setLoadingTags(true);
    try {
      const { api } = await import('@/lib/api');
      const data = await api<Array<{ id: string; name: string; color: string }>>('/api/chat/tags/with-count');
      setTags(data);
    } catch (error) {
      console.error('Error loading tags:', error);
    } finally {
      setLoadingTags(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Tipo de Ação</Label>
        <Select
          value={content.action_type || 'set_variable'}
          onValueChange={(v) => onChange({ ...content, action_type: v })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="set_variable">Definir variável</SelectItem>
            <SelectItem value="add_tag">Adicionar tag</SelectItem>
            <SelectItem value="remove_tag">Remover tag</SelectItem>
            <SelectItem value="send_email">Enviar e-mail</SelectItem>
            <SelectItem value="notify">Notificar equipe</SelectItem>
            <SelectItem value="notify_external">Notificar externa (WhatsApp)</SelectItem>
            <SelectItem value="close_conversation">Encerrar conversa</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {content.action_type === 'set_variable' && (
        <>
          <div className="space-y-2">
            <Label>Nome da variável</Label>
            <Input
              value={content.variable_name || ''}
              onChange={(e) => onChange({ ...content, variable_name: e.target.value })}
              placeholder="minha_variavel"
            />
          </div>
          <div className="space-y-2">
            <Label>Valor</Label>
            <Input
              value={content.variable_value || ''}
              onChange={(e) => onChange({ ...content, variable_value: e.target.value })}
              placeholder="Valor da variável"
            />
          </div>
        </>
      )}

      {(content.action_type === 'add_tag' || content.action_type === 'remove_tag') && (
        <div className="space-y-2">
          <Label>{content.action_type === 'add_tag' ? 'Adicionar Tag' : 'Remover Tag'}</Label>
          {loadingTags ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground p-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando tags...
            </div>
          ) : tags.length === 0 ? (
            <div className="text-sm text-muted-foreground p-3 bg-muted rounded-lg">
              Nenhuma tag encontrada. Crie tags na página de Tags primeiro.
            </div>
          ) : (
            <Select
              value={content.tag_id || ''}
              onValueChange={(v) => {
                const selectedTag = tags.find(t => t.id === v);
                onChange({ 
                  ...content, 
                  tag_id: v, 
                  tag: selectedTag?.name || '' 
                });
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma tag" />
              </SelectTrigger>
              <SelectContent>
                {tags.map((tag) => (
                  <SelectItem key={tag.id} value={tag.id}>
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: tag.color }}
                      />
                      {tag.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {content.action_type === 'send_email' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>E-mail do destinatário</Label>
            <Input
              value={content.email_to || ''}
              onChange={(e) => onChange({ ...content, email_to: e.target.value })}
              placeholder="{email} ou email@exemplo.com"
            />
            <p className="text-xs text-muted-foreground">
              Use {'{email}'} para usar o e-mail coletado no fluxo
            </p>
          </div>
          <div className="space-y-2">
            <Label>Assunto</Label>
            <Input
              value={content.email_subject || ''}
              onChange={(e) => onChange({ ...content, email_subject: e.target.value })}
              placeholder="Assunto do e-mail"
            />
          </div>
          <div className="space-y-2">
            <Label>Corpo do e-mail</Label>
            <Textarea
              value={content.email_body || ''}
              onChange={(e) => onChange({ ...content, email_body: e.target.value })}
              placeholder="Olá {nome},&#10;&#10;Obrigado pelo contato..."
              rows={6}
            />
          </div>
          <div className="p-3 bg-muted rounded-lg space-y-1">
            <p className="text-xs font-medium">Variáveis disponíveis:</p>
            <div className="flex flex-wrap gap-1">
              {['{nome}', '{telefone}', '{email}', '{mensagem}'].map(v => (
                <Badge key={v} variant="secondary" className="text-xs cursor-pointer hover:bg-primary/20"
                  onClick={() => onChange({ ...content, email_body: (content.email_body || '') + ' ' + v })}
                >
                  {v}
                </Badge>
              ))}
            </div>
          </div>
          <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <p className="text-xs text-muted-foreground">
              💡 Configure o SMTP em <strong>Configurações → E-mail</strong> antes de usar esta ação.
            </p>
          </div>
        </div>
      )}

      {content.action_type === 'notify' && (
        <div className="space-y-2">
          <Label>Mensagem de notificação</Label>
          <Textarea
            value={content.notification_message || ''}
            onChange={(e) => onChange({ ...content, notification_message: e.target.value })}
            placeholder="Novo lead qualificado..."
            rows={3}
          />
        </div>
      )}

      {content.action_type === 'notify_external' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Número do WhatsApp</Label>
            <Input
              value={content.phone_number || ''}
              onChange={(e) => onChange({ ...content, phone_number: e.target.value })}
              placeholder="5511999999999"
            />
            <p className="text-xs text-muted-foreground">
              Formato: código do país + DDD + número (ex: 5511999999999)
            </p>
          </div>
          <div className="space-y-2">
            <Label>Mensagem</Label>
            <Textarea
              value={content.external_message || ''}
              onChange={(e) => onChange({ ...content, external_message: e.target.value })}
              placeholder="Novo lead: {nome_cliente}&#10;Telefone: {telefone}&#10;Interesse: {interesse}"
              rows={5}
            />
            <p className="text-xs text-muted-foreground">
              Use {'{variavel}'} para inserir dados coletados no fluxo
            </p>
          </div>
          <div className="p-3 bg-muted rounded-lg space-y-1">
            <p className="text-xs font-medium">Variáveis disponíveis:</p>
            <div className="flex flex-wrap gap-1">
              {['{nome}', '{telefone}', '{email}', '{mensagem}'].map(v => (
                <Badge key={v} variant="secondary" className="text-xs cursor-pointer hover:bg-primary/20"
                  onClick={() => onChange({ ...content, external_message: (content.external_message || '') + ' ' + v })}
                >
                  {v}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============ Transfer Node Editor ============
function TransferNodeEditor({ content, onChange }: { content: Record<string, any>; onChange: (c: Record<string, any>) => void }) {
  const [departments, setDepartments] = useState<Array<{ id: string; name: string; color: string }>>([]);
  const [members, setMembers] = useState<Array<{ id: string; user_id: string; name: string; email: string }>>([]);
  const [loadingDepts, setLoadingDepts] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);

  useEffect(() => {
    loadDepartments();
    loadMembers();
  }, []);

  const loadDepartments = async () => {
    setLoadingDepts(true);
    try {
      const { api } = await import('@/lib/api');
      const data = await api<Array<{ id: string; name: string; color: string }>>('/api/departments');
      setDepartments(data);
    } catch (error) {
      console.error('Error loading departments:', error);
    } finally {
      setLoadingDepts(false);
    }
  };

  const loadMembers = async () => {
    setLoadingMembers(true);
    try {
      const { api, API_URL, getAuthToken } = await import('@/lib/api');
      // Primeiro pegar a organização do usuário
      const orgsResponse = await fetch(`${API_URL}/api/organizations`, {
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken()}` 
        }
      });
      if (orgsResponse.ok) {
        const orgs = await orgsResponse.json();
        if (orgs.length > 0) {
          const membersResponse = await fetch(`${API_URL}/api/organizations/${orgs[0].id}/members`, {
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${getAuthToken()}` 
            }
          });
          if (membersResponse.ok) {
            const membersData = await membersResponse.json();
            setMembers(membersData);
          }
        }
      }
    } catch (error) {
      console.error('Error loading members:', error);
    } finally {
      setLoadingMembers(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Tipo de Transferência</Label>
        <Select
          value={content.transfer_type || 'department'}
          onValueChange={(v) => onChange({ ...content, transfer_type: v })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="department">Para departamento</SelectItem>
            <SelectItem value="agent">Para agente específico</SelectItem>
            <SelectItem value="queue">Para fila geral</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {content.transfer_type === 'department' && (
        <div className="space-y-2">
          <Label>Departamento</Label>
          {loadingDepts ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground p-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando departamentos...
            </div>
          ) : departments.length === 0 ? (
            <div className="text-sm text-muted-foreground p-3 bg-muted rounded-lg">
              Nenhum departamento encontrado. Crie departamentos primeiro.
            </div>
          ) : (
            <Select
              value={content.department_id || ''}
              onValueChange={(v) => {
                const selectedDept = departments.find(d => d.id === v);
                onChange({ 
                  ...content, 
                  department_id: v, 
                  department_name: selectedDept?.name || '' 
                });
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione um departamento" />
              </SelectTrigger>
              <SelectContent>
                {departments.map((dept) => (
                  <SelectItem key={dept.id} value={dept.id}>
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: dept.color }}
                      />
                      {dept.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {content.transfer_type === 'agent' && (
        <div className="space-y-2">
          <Label>Agente</Label>
          {loadingMembers ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground p-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando usuários...
            </div>
          ) : members.length === 0 ? (
            <div className="text-sm text-muted-foreground p-3 bg-muted rounded-lg">
              Nenhum usuário encontrado na organização.
            </div>
          ) : (
            <Select
              value={content.agent_id || ''}
              onValueChange={(v) => {
                const selectedMember = members.find(m => m.user_id === v);
                onChange({ 
                  ...content, 
                  agent_id: v, 
                  agent_name: selectedMember?.name || '' 
                });
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione um usuário" />
              </SelectTrigger>
              <SelectContent>
                {members.map((member) => (
                  <SelectItem key={member.user_id} value={member.user_id}>
                    <div className="flex flex-col">
                      <span>{member.name}</span>
                      <span className="text-xs text-muted-foreground">{member.email}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label>Mensagem de transferência</Label>
        <Textarea
          value={content.transfer_message || ''}
          onChange={(e) => onChange({ ...content, transfer_message: e.target.value })}
          placeholder="Aguarde, vou transferi-lo para um atendente..."
          rows={2}
        />
      </div>

      <div className="flex items-center justify-between">
        <Label className="text-sm">Encerrar fluxo após transferir</Label>
        <Switch
          checked={content.end_flow !== false}
          onCheckedChange={(v) => onChange({ ...content, end_flow: v })}
        />
      </div>
    </div>
  );
}

// ============ AI Response Node Editor ============
function AIResponseNodeEditor({ content, onChange }: { content: Record<string, any>; onChange: (c: Record<string, any>) => void }) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Contexto / Prompt do Sistema</Label>
        <Textarea
          value={content.system_prompt || ''}
          onChange={(e) => onChange({ ...content, system_prompt: e.target.value })}
          placeholder="Você é um assistente de vendas especializado em..."
          rows={4}
        />
        <p className="text-xs text-muted-foreground">
          Instruções para a IA sobre como responder
        </p>
      </div>

      <div className="space-y-2">
        <Label>Modelo de IA</Label>
        <Select
          value={content.model || 'gemini-flash'}
          onValueChange={(v) => onChange({ ...content, model: v })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="gemini-flash">Gemini Flash (Rápido)</SelectItem>
            <SelectItem value="gemini-pro">Gemini Pro (Avançado)</SelectItem>
            <SelectItem value="gpt-4">GPT-4 (Precisão)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Temperatura ({content.temperature || 0.7})</Label>
        <Slider
          value={[content.temperature || 0.7]}
          min={0}
          max={1}
          step={0.1}
          onValueChange={([v]) => onChange({ ...content, temperature: v })}
        />
        <p className="text-xs text-muted-foreground">
          Menor = mais focado | Maior = mais criativo
        </p>
      </div>

      <div className="space-y-2">
        <Label>Salvar resposta em variável</Label>
        <Input
          value={content.save_to_variable || ''}
          onChange={(e) => onChange({ ...content, save_to_variable: e.target.value })}
          placeholder="resposta_ia"
        />
      </div>

      <div className="flex items-center justify-between">
        <Label className="text-sm">Incluir histórico da conversa</Label>
        <Switch
          checked={content.include_history !== false}
          onCheckedChange={(v) => onChange({ ...content, include_history: v })}
        />
      </div>
    </div>
  );
}

// ============ Delay Node Editor ============
function DelayNodeEditor({ content, onChange }: { content: Record<string, any>; onChange: (c: Record<string, any>) => void }) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Tempo de espera</Label>
        <div className="flex gap-2">
          <Input
            type="number"
            min={1}
            value={content.duration || 5}
            onChange={(e) => onChange({ ...content, duration: parseInt(e.target.value) || 1 })}
            className="flex-1"
          />
          <Select
            value={content.unit || 'seconds'}
            onValueChange={(v) => onChange({ ...content, unit: v })}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="seconds">Segundos</SelectItem>
              <SelectItem value="minutes">Minutos</SelectItem>
              <SelectItem value="hours">Horas</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Label className="text-sm">Simular digitação durante delay</Label>
        <Switch
          checked={content.typing || false}
          onCheckedChange={(v) => onChange({ ...content, typing: v })}
        />
      </div>

      <p className="text-xs text-muted-foreground bg-muted p-3 rounded-lg">
        ⏱️ O fluxo pausará pelo tempo especificado antes de continuar para o próximo nó.
      </p>
    </div>
  );
}

// ============ Webhook Node Editor ============
function WebhookNodeEditor({ content, onChange }: { content: Record<string, any>; onChange: (c: Record<string, any>) => void }) {
  const headers: WebhookHeader[] = content.headers || [];

  const addHeader = () => {
    const newHeader: WebhookHeader = { id: `h_${Date.now()}`, key: '', value: '' };
    onChange({ ...content, headers: [...headers, newHeader] });
  };

  const updateHeader = (id: string, field: string, value: string) => {
    const updated = headers.map(h => h.id === id ? { ...h, [field]: value } : h);
    onChange({ ...content, headers: updated });
  };

  const removeHeader = (id: string) => {
    onChange({ ...content, headers: headers.filter(h => h.id !== id) });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>URL do Webhook</Label>
        <Input
          value={content.url || ''}
          onChange={(e) => onChange({ ...content, url: e.target.value })}
          placeholder="https://api.exemplo.com/webhook"
        />
      </div>

      <div className="space-y-2">
        <Label>Método HTTP</Label>
        <Select
          value={content.method || 'POST'}
          onValueChange={(v) => onChange({ ...content, method: v })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="GET">GET</SelectItem>
            <SelectItem value="POST">POST</SelectItem>
            <SelectItem value="PUT">PUT</SelectItem>
            <SelectItem value="PATCH">PATCH</SelectItem>
            <SelectItem value="DELETE">DELETE</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Headers</Label>
          <Button variant="outline" size="sm" onClick={addHeader}>
            <Plus className="h-3 w-3 mr-1" />
            Header
          </Button>
        </div>
        <div className="space-y-2">
          {headers.map((h) => (
            <div key={h.id} className="flex gap-2">
              <Input
                value={h.key}
                onChange={(e) => updateHeader(h.id, 'key', e.target.value)}
                placeholder="Header"
                className="flex-1"
              />
              <Input
                value={h.value}
                onChange={(e) => updateHeader(h.id, 'value', e.target.value)}
                placeholder="Valor"
                className="flex-1"
              />
              <Button variant="ghost" size="icon" onClick={() => removeHeader(h.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Corpo da Requisição (JSON)</Label>
        <Textarea
          value={content.body || ''}
          onChange={(e) => onChange({ ...content, body: e.target.value })}
          placeholder='{"nome": "{nome_cliente}", "telefone": "{telefone}"}'
          rows={4}
          className="font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Use {'{variavel}'} para inserir variáveis do fluxo
        </p>
      </div>

      <div className="space-y-2">
        <Label>Salvar resposta em variável</Label>
        <Input
          value={content.response_variable || ''}
          onChange={(e) => onChange({ ...content, response_variable: e.target.value })}
          placeholder="resposta_api"
        />
      </div>

      <div className="space-y-2">
        <Label>Timeout (segundos)</Label>
        <Input
          type="number"
          min={1}
          max={120}
          value={content.timeout || 30}
          onChange={(e) => onChange({ ...content, timeout: parseInt(e.target.value) || 30 })}
        />
      </div>

      <div className="flex items-center justify-between">
        <Label className="text-sm">Continuar em caso de erro</Label>
        <Switch
          checked={content.continue_on_error || false}
          onCheckedChange={(v) => onChange({ ...content, continue_on_error: v })}
        />
      </div>
    </div>
  );
}
