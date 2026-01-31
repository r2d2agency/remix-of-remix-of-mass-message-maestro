import { useState, useEffect } from 'react';
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
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Bot, Brain, MessageSquare, Settings, Zap, Shield,
  Sparkles, X, Plus, Save, Loader2
} from 'lucide-react';
import { useAIAgents, AIAgent, AgentCapability, AIModels } from '@/hooks/use-ai-agents';
import { toast } from 'sonner';

interface AgentEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: AIAgent | null;
  onSaved: () => void;
}

const ALL_CAPABILITIES: { id: AgentCapability; label: string; description: string }[] = [
  { id: 'respond_messages', label: 'Responder Mensagens', description: 'Responde automaticamente baseado no contexto' },
  { id: 'read_files', label: 'Ler Arquivos', description: 'Analisa imagens, PDFs enviados pelo cliente' },
  { id: 'schedule_meetings', label: 'Agendar Reuniões', description: 'Integra com calendário para marcar compromissos' },
  { id: 'google_calendar', label: 'Google Calendar', description: 'Gerencia eventos: criar, editar, remover reuniões' },
  { id: 'manage_tasks', label: 'Gerenciar Tarefas', description: 'Cria e atualiza tarefas com responsável definido' },
  { id: 'create_deals', label: 'Criar Negociações', description: 'Cria deals automaticamente no CRM' },
  { id: 'suggest_actions', label: 'Sugerir Ações', description: 'Analisa e sugere próximos passos' },
  { id: 'generate_content', label: 'Gerar Conteúdo', description: 'Cria rascunhos de emails e mensagens' },
  { id: 'summarize_history', label: 'Resumir Histórico', description: 'Resume interações anteriores com o cliente' },
  { id: 'qualify_leads', label: 'Qualificar Leads', description: 'Scoring automático baseado em dados' },
];

const DEFAULT_SYSTEM_PROMPT = `Você é um assistente virtual profissional e prestativo. Seu objetivo é ajudar os clientes de forma clara, objetiva e amigável.

Diretrizes:
- Seja cordial e use uma linguagem acessível
- Responda de forma concisa, mas completa
- Se não souber algo, admita e ofereça alternativas
- Quando apropriado, faça perguntas para entender melhor a necessidade
- Mantenha o foco no atendimento ao cliente`;

// Helper to normalize PostgreSQL arrays (can come as string "{a,b,c}" or actual array)
function normalizeArray<T>(value: unknown, defaultValue: T[] = []): T[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    // PostgreSQL array format: {item1,item2,item3}
    if (value.startsWith('{') && value.endsWith('}')) {
      const inner = value.slice(1, -1);
      if (!inner) return defaultValue;
      return inner.split(',').map(s => s.trim()) as T[];
    }
    // Try JSON parse
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : defaultValue;
    } catch {
      return defaultValue;
    }
  }
  return defaultValue;
}

export function AgentEditorDialog({ open, onOpenChange, agent, onSaved }: AgentEditorDialogProps) {
  const [saving, setSaving] = useState(false);
  const [models, setModels] = useState<AIModels>({ openai: [], gemini: [] });
  const [handoffKeyword, setHandoffKeyword] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    avatar_url: '',
    ai_provider: 'openai' as 'openai' | 'gemini',
    ai_model: 'gpt-4o-mini',
    ai_api_key: '',
    system_prompt: DEFAULT_SYSTEM_PROMPT,
    personality_traits: [] as string[],
    language: 'pt-BR',
    temperature: 0.7,
    max_tokens: 1000,
    context_window: 10,
    capabilities: ['respond_messages'] as AgentCapability[],
    greeting_message: '',
    fallback_message: 'Desculpe, não consegui entender. Pode reformular sua pergunta?',
    handoff_message: 'Vou transferir você para um atendente humano.',
    handoff_keywords: ['humano', 'atendente', 'pessoa'] as string[],
    auto_handoff_after_failures: 3,
  });

  const { createAgent, updateAgent, getAIModels } = useAIAgents();

  useEffect(() => {
    if (open) {
      loadModels();
      if (agent && agent.id) {
        setFormData({
          name: agent.name,
          description: agent.description || '',
          avatar_url: agent.avatar_url || '',
          ai_provider: agent.ai_provider,
          ai_model: agent.ai_model,
          ai_api_key: '', // Não expor a chave existente
          system_prompt: agent.system_prompt,
          personality_traits: normalizeArray<string>(agent.personality_traits, []),
          language: agent.language,
          temperature: agent.temperature,
          max_tokens: agent.max_tokens,
          context_window: agent.context_window,
          capabilities: normalizeArray<AgentCapability>(agent.capabilities, ['respond_messages']),
          greeting_message: agent.greeting_message || '',
          fallback_message: agent.fallback_message,
          handoff_message: agent.handoff_message,
          handoff_keywords: normalizeArray<string>(agent.handoff_keywords, ['humano', 'atendente', 'pessoa']),
          auto_handoff_after_failures: agent.auto_handoff_after_failures,
        });
      } else {
        // Reset para valores padrão
        setFormData({
          name: agent?.name || '',
          description: agent?.description || '',
          avatar_url: '',
          ai_provider: 'openai',
          ai_model: 'gpt-4o-mini',
          ai_api_key: '',
          system_prompt: DEFAULT_SYSTEM_PROMPT,
          personality_traits: [],
          language: 'pt-BR',
          temperature: 0.7,
          max_tokens: 1000,
          context_window: 10,
          capabilities: ['respond_messages'],
          greeting_message: '',
          fallback_message: 'Desculpe, não consegui entender. Pode reformular sua pergunta?',
          handoff_message: 'Vou transferir você para um atendente humano.',
          handoff_keywords: ['humano', 'atendente', 'pessoa'],
          auto_handoff_after_failures: 3,
        });
      }
    }
  }, [open, agent]);

  const loadModels = async () => {
    const data = await getAIModels();
    setModels(data);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...formData,
        ai_api_key: formData.ai_api_key || undefined, // Não enviar se vazio
      };

      if (agent?.id) {
        await updateAgent(agent.id, payload);
        toast.success('Agente atualizado');
      } else {
        await createAgent(payload);
        toast.success('Agente criado');
      }
      onSaved();
     } catch (err) {
       const msg = err instanceof Error && err.message ? err.message : 'Erro ao salvar agente';
       toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const toggleCapability = (cap: AgentCapability) => {
    setFormData(prev => ({
      ...prev,
      capabilities: prev.capabilities.includes(cap)
        ? prev.capabilities.filter(c => c !== cap)
        : [...prev.capabilities, cap]
    }));
  };

  const addHandoffKeyword = () => {
    if (handoffKeyword.trim() && !formData.handoff_keywords.includes(handoffKeyword.trim())) {
      setFormData(prev => ({
        ...prev,
        handoff_keywords: [...prev.handoff_keywords, handoffKeyword.trim()]
      }));
      setHandoffKeyword('');
    }
  };

  const removeHandoffKeyword = (keyword: string) => {
    setFormData(prev => ({
      ...prev,
      handoff_keywords: prev.handoff_keywords.filter(k => k !== keyword)
    }));
  };

  const currentModels = formData.ai_provider === 'openai' ? models.openai : models.gemini;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            {agent?.id ? 'Editar Agente' : 'Novo Agente de IA'}
          </DialogTitle>
          <DialogDescription>
            Configure as capacidades e comportamento do seu assistente inteligente
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="basic" className="flex-1">
          <div className="px-6">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="basic" className="gap-2">
                <Bot className="h-4 w-4" />
                Básico
              </TabsTrigger>
              <TabsTrigger value="ai" className="gap-2">
                <Brain className="h-4 w-4" />
                IA
              </TabsTrigger>
              <TabsTrigger value="capabilities" className="gap-2">
                <Zap className="h-4 w-4" />
                Capacidades
              </TabsTrigger>
              <TabsTrigger value="handoff" className="gap-2">
                <Shield className="h-4 w-4" />
                Handoff
              </TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="h-[500px]">
            <div className="p-6 pt-4">
              {/* Basic Tab */}
              <TabsContent value="basic" className="space-y-4 mt-0">
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name">Nome do Agente *</Label>
                    <Input
                      id="name"
                      placeholder="Ex: Assistente de Vendas"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="description">Descrição</Label>
                    <Textarea
                      id="description"
                      placeholder="Descreva o propósito do agente..."
                      value={formData.description}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      rows={3}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="greeting">Mensagem de Boas-vindas</Label>
                    <Textarea
                      id="greeting"
                      placeholder="Olá! Como posso ajudar você hoje?"
                      value={formData.greeting_message}
                      onChange={(e) => setFormData(prev => ({ ...prev, greeting_message: e.target.value }))}
                      rows={2}
                    />
                    <p className="text-xs text-muted-foreground">
                      Enviada automaticamente ao iniciar uma conversa
                    </p>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="fallback">Mensagem de Fallback</Label>
                    <Textarea
                      id="fallback"
                      value={formData.fallback_message}
                      onChange={(e) => setFormData(prev => ({ ...prev, fallback_message: e.target.value }))}
                      rows={2}
                    />
                    <p className="text-xs text-muted-foreground">
                      Usada quando o agente não consegue entender a mensagem
                    </p>
                  </div>
                </div>
              </TabsContent>

              {/* AI Tab */}
              <TabsContent value="ai" className="space-y-4 mt-0">
                <div className="grid gap-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Provedor de IA</Label>
                      <Select
                        value={formData.ai_provider}
                        onValueChange={(value: 'openai' | 'gemini') => {
                          setFormData(prev => ({
                            ...prev,
                            ai_provider: value,
                            ai_model: value === 'openai' ? 'gpt-4o-mini' : 'gemini-1.5-flash'
                          }));
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="openai">
                            <div className="flex items-center gap-2">
                              <Sparkles className="h-4 w-4 text-green-500" />
                              OpenAI
                            </div>
                          </SelectItem>
                          <SelectItem value="gemini">
                            <div className="flex items-center gap-2">
                              <Brain className="h-4 w-4 text-blue-500" />
                              Google Gemini
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid gap-2">
                      <Label>Modelo</Label>
                      <Select
                        value={formData.ai_model}
                        onValueChange={(value) => setFormData(prev => ({ ...prev, ai_model: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {currentModels.map((model) => (
                            <SelectItem key={model.id} value={model.id}>
                              <div>
                                <p>{model.name}</p>
                                <p className="text-xs text-muted-foreground">{model.description}</p>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="apiKey">Chave de API (opcional)</Label>
                    <Input
                      id="apiKey"
                      type="password"
                      placeholder="Deixe vazio para usar a chave padrão da organização"
                      value={formData.ai_api_key}
                      onChange={(e) => setFormData(prev => ({ ...prev, ai_api_key: e.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground">
                      Use uma chave específica para este agente ou deixe vazio para usar a configuração global
                    </p>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="system_prompt">System Prompt</Label>
                    <Textarea
                      id="system_prompt"
                      value={formData.system_prompt}
                      onChange={(e) => setFormData(prev => ({ ...prev, system_prompt: e.target.value }))}
                      rows={8}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Define a personalidade e comportamento base do agente
                    </p>
                  </div>

                  <div className="grid sm:grid-cols-3 gap-4">
                    <div className="grid gap-2">
                      <Label>Temperatura: {formData.temperature.toFixed(1)}</Label>
                      <Slider
                        value={[formData.temperature]}
                        onValueChange={([value]) => setFormData(prev => ({ ...prev, temperature: value }))}
                        min={0}
                        max={1}
                        step={0.1}
                      />
                      <p className="text-xs text-muted-foreground">
                        Menor = mais focado, Maior = mais criativo
                      </p>
                    </div>

                    <div className="grid gap-2">
                      <Label>Max Tokens: {formData.max_tokens}</Label>
                      <Slider
                        value={[formData.max_tokens]}
                        onValueChange={([value]) => setFormData(prev => ({ ...prev, max_tokens: value }))}
                        min={100}
                        max={4000}
                        step={100}
                      />
                      <p className="text-xs text-muted-foreground">
                        Tamanho máximo da resposta
                      </p>
                    </div>

                    <div className="grid gap-2">
                      <Label>Contexto: {formData.context_window} msgs</Label>
                      <Slider
                        value={[formData.context_window]}
                        onValueChange={([value]) => setFormData(prev => ({ ...prev, context_window: value }))}
                        min={1}
                        max={20}
                        step={1}
                      />
                      <p className="text-xs text-muted-foreground">
                        Mensagens anteriores incluídas
                      </p>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* Capabilities Tab */}
              <TabsContent value="capabilities" className="space-y-4 mt-0">
                <div className="grid gap-3">
                  {ALL_CAPABILITIES.map((cap) => (
                    <div
                      key={cap.id}
                      className={`flex items-center justify-between p-4 rounded-lg border cursor-pointer transition-colors ${
                        formData.capabilities.includes(cap.id)
                          ? 'border-primary bg-primary/5'
                          : 'hover:border-muted-foreground/50'
                      }`}
                      onClick={() => toggleCapability(cap.id)}
                    >
                      <div className="flex-1">
                        <p className="font-medium">{cap.label}</p>
                        <p className="text-sm text-muted-foreground">{cap.description}</p>
                      </div>
                      <Switch
                        checked={formData.capabilities.includes(cap.id)}
                        onCheckedChange={() => toggleCapability(cap.id)}
                      />
                    </div>
                  ))}
                </div>
              </TabsContent>

              {/* Handoff Tab */}
              <TabsContent value="handoff" className="space-y-4 mt-0">
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="handoff_message">Mensagem de Transferência</Label>
                    <Textarea
                      id="handoff_message"
                      value={formData.handoff_message}
                      onChange={(e) => setFormData(prev => ({ ...prev, handoff_message: e.target.value }))}
                      rows={2}
                    />
                    <p className="text-xs text-muted-foreground">
                      Enviada quando o usuário é transferido para um humano
                    </p>
                  </div>

                  <div className="grid gap-2">
                    <Label>Palavras-chave de Transferência</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Adicionar palavra-chave..."
                        value={handoffKeyword}
                        onChange={(e) => setHandoffKeyword(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addHandoffKeyword())}
                      />
                      <Button type="button" variant="outline" onClick={addHandoffKeyword}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {formData.handoff_keywords.map((keyword) => (
                        <Badge key={keyword} variant="secondary" className="gap-1">
                          {keyword}
                          <X
                            className="h-3 w-3 cursor-pointer"
                            onClick={() => removeHandoffKeyword(keyword)}
                          />
                        </Badge>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Quando o usuário menciona essas palavras, é transferido automaticamente
                    </p>
                  </div>

                  <div className="grid gap-2">
                    <Label>Transferir após {formData.auto_handoff_after_failures} falhas</Label>
                    <Slider
                      value={[formData.auto_handoff_after_failures]}
                      onValueChange={([value]) => setFormData(prev => ({ ...prev, auto_handoff_after_failures: value }))}
                      min={1}
                      max={10}
                      step={1}
                    />
                    <p className="text-xs text-muted-foreground">
                      Número de vezes que o agente pode falhar antes de transferir automaticamente
                    </p>
                  </div>
                </div>
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>

        <div className="flex justify-end gap-3 p-6 pt-0 border-t mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Salvar Agente
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
