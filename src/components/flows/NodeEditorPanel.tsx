import { useState, useEffect } from 'react';
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
  Clock, Webhook, Image, FileText, Video, Mic
} from 'lucide-react';
import { FlowNodeData } from '@/components/chatbots/FlowNodes';

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
  return (
    <Tabs defaultValue="text" className="w-full">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="text" className="text-xs"><FileText className="h-3 w-3" /></TabsTrigger>
        <TabsTrigger value="image" className="text-xs"><Image className="h-3 w-3" /></TabsTrigger>
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
        <div className="space-y-2">
          <Label>URL da Imagem</Label>
          <Input
            value={content.media_url || ''}
            onChange={(e) => onChange({ ...content, media_url: e.target.value, media_type: 'image' })}
            placeholder="https://..."
          />
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

      <TabsContent value="video" className="space-y-3 mt-3">
        <div className="space-y-2">
          <Label>URL do Vídeo</Label>
          <Input
            value={content.media_url || ''}
            onChange={(e) => onChange({ ...content, media_url: e.target.value, media_type: 'video' })}
            placeholder="https://..."
          />
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
        <div className="space-y-2">
          <Label>URL do Áudio</Label>
          <Input
            value={content.media_url || ''}
            onChange={(e) => onChange({ ...content, media_url: e.target.value, media_type: 'audio' })}
            placeholder="https://..."
          />
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
            <SelectItem value="notify">Notificar equipe</SelectItem>
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
          <Label>Tag</Label>
          <Input
            value={content.tag || ''}
            onChange={(e) => onChange({ ...content, tag: e.target.value })}
            placeholder="Nome da tag"
          />
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
    </div>
  );
}

// ============ Transfer Node Editor ============
function TransferNodeEditor({ content, onChange }: { content: Record<string, any>; onChange: (c: Record<string, any>) => void }) {
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
          <Label>ID ou nome do Departamento</Label>
          <Input
            value={content.department_id || ''}
            onChange={(e) => onChange({ ...content, department_id: e.target.value })}
            placeholder="comercial"
          />
        </div>
      )}

      {content.transfer_type === 'agent' && (
        <div className="space-y-2">
          <Label>ID do Agente</Label>
          <Input
            value={content.agent_id || ''}
            onChange={(e) => onChange({ ...content, agent_id: e.target.value })}
            placeholder="ID do agente"
          />
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
