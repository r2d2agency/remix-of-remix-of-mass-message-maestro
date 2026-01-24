import { useState, useCallback, useRef, useEffect } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  BackgroundVariant,
  Panel,
  ReactFlowProvider,
  useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Save, Plus, MessageSquare, List, FormInput, GitBranch, 
  Zap, ArrowRightLeft, Sparkles, Square, Loader2, Trash2, X,
  Play, PanelRightOpen, PanelRightClose
} from 'lucide-react';
import { toast } from 'sonner';
import { nodeTypes, FlowNodeData } from './FlowNodes';
import { useChatbots, Chatbot, ChatbotFlow } from '@/hooks/use-chatbots';
import { FlowSimulator } from './FlowSimulator';

interface FlowEditorDialogProps {
  open: boolean;
  chatbot: Chatbot | null;
  onClose: () => void;
}

const nodeTypeOptions = [
  { type: 'message', label: 'Mensagem', icon: MessageSquare, description: 'Envia uma mensagem de texto' },
  { type: 'menu', label: 'Menu', icon: List, description: 'Mostra opções para o usuário escolher' },
  { type: 'input', label: 'Entrada', icon: FormInput, description: 'Coleta informação do usuário' },
  { type: 'condition', label: 'Condição', icon: GitBranch, description: 'Ramifica baseado em condição' },
  { type: 'action', label: 'Ação', icon: Zap, description: 'Executa uma ação (tag, variável)' },
  { type: 'transfer', label: 'Transferir', icon: ArrowRightLeft, description: 'Transfere para atendente' },
  { type: 'ai_response', label: 'IA', icon: Sparkles, description: 'Gera resposta com IA' },
  { type: 'end', label: 'Fim', icon: Square, description: 'Encerra o fluxo' },
];

function FlowEditorContent({ chatbot, onClose }: { chatbot: Chatbot; onClose: () => void }) {
  const { getFlows, saveFlows } = useChatbots();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { project } = useReactFlow();
  
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showSimulator, setShowSimulator] = useState(false);
  
  // Node editing state
  const [editingNode, setEditingNode] = useState<Node<FlowNodeData> | null>(null);
  const [nodeContent, setNodeContent] = useState<Record<string, any>>({});
  
  // Drag state
  const [draggedType, setDraggedType] = useState<string | null>(null);

  // Load existing flows
  useEffect(() => {
    loadFlows();
  }, [chatbot.id]);

  const loadFlows = async () => {
    setLoading(true);
    const flows = await getFlows(chatbot.id);
    
    if (flows.length === 0) {
      // Create default start node
      setNodes([{
        id: 'start',
        type: 'start',
        position: { x: 250, y: 50 },
        data: { label: 'Início' },
      }]);
    } else {
      // Convert flows to React Flow format
      const nodesData: Node<FlowNodeData>[] = flows.map((flow) => ({
        id: flow.node_id,
        type: flow.node_type,
        position: { x: flow.position_x, y: flow.position_y },
        data: {
          label: flow.name || getDefaultLabel(flow.node_type),
          content: flow.content as Record<string, unknown>,
          onEdit: (id: string) => handleEditNode(id),
          onDelete: (id: string) => handleDeleteNode(id),
        },
      }));

      // Create edges from next_node_id
      const edgesData: Edge[] = flows
        .filter((flow) => flow.next_node_id)
        .map((flow) => ({
          id: `${flow.node_id}-${flow.next_node_id}`,
          source: flow.node_id,
          target: flow.next_node_id!,
          animated: true,
          style: { stroke: 'hsl(var(--primary))' },
        }));

      // Also check content for menu options and conditions
      flows.forEach((flow) => {
        if (flow.node_type === 'menu' && flow.content?.options) {
          (flow.content.options as any[]).forEach((opt: any) => {
            if (opt.next_node) {
              edgesData.push({
                id: `${flow.node_id}-${opt.next_node}-${opt.id}`,
                source: flow.node_id,
                target: opt.next_node,
                label: opt.label,
                animated: true,
                style: { stroke: 'hsl(var(--primary))' },
              });
            }
          });
        }
        if (flow.node_type === 'condition') {
          if (flow.content?.true_node) {
            edgesData.push({
              id: `${flow.node_id}-${flow.content.true_node}-true`,
              source: flow.node_id,
              sourceHandle: 'true',
              target: flow.content.true_node as string,
              label: 'Sim',
              animated: true,
              style: { stroke: 'hsl(142, 76%, 36%)' },
            });
          }
          if (flow.content?.false_node) {
            edgesData.push({
              id: `${flow.node_id}-${flow.content.false_node}-false`,
              source: flow.node_id,
              sourceHandle: 'false',
              target: flow.content.false_node as string,
              label: 'Não',
              animated: true,
              style: { stroke: 'hsl(0, 84%, 60%)' },
            });
          }
        }
      });

      setNodes(nodesData);
      setEdges(edgesData);
    }
    setLoading(false);
  };

  const getDefaultLabel = (type: string): string => {
    const labels: Record<string, string> = {
      start: 'Início',
      message: 'Mensagem',
      menu: 'Menu',
      input: 'Entrada',
      condition: 'Condição',
      action: 'Ação',
      transfer: 'Transferir',
      ai_response: 'Resposta IA',
      end: 'Fim',
    };
    return labels[type] || type;
  };

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge({
      ...params,
      animated: true,
      style: { stroke: 'hsl(var(--primary))' },
    }, eds));
  }, [setEdges]);

  const handleEditNode = useCallback((nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (node) {
      setEditingNode(node);
      setNodeContent(node.data.content || {});
    }
  }, [nodes]);

  const handleDeleteNode = useCallback((nodeId: string) => {
    if (nodeId === 'start') {
      toast.error('Não é possível deletar o nó inicial');
      return;
    }
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
  }, [setNodes, setEdges]);

  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    setDraggedType(nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      if (!draggedType || !reactFlowWrapper.current) return;

      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = project({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      });

      const newNode: Node<FlowNodeData> = {
        id: `${draggedType}_${Date.now()}`,
        type: draggedType,
        position,
        data: {
          label: getDefaultLabel(draggedType),
          content: {},
          onEdit: (id: string) => handleEditNode(id),
          onDelete: (id: string) => handleDeleteNode(id),
        },
      };

      setNodes((nds) => nds.concat(newNode));
      setDraggedType(null);
      
      // Auto open editor for new node
      if (draggedType !== 'start' && draggedType !== 'end') {
        setTimeout(() => {
          setEditingNode(newNode);
          setNodeContent({});
        }, 100);
      }
    },
    [draggedType, project, setNodes, handleEditNode, handleDeleteNode]
  );

  const saveNodeContent = () => {
    if (!editingNode) return;

    setNodes((nds) =>
      nds.map((n) =>
        n.id === editingNode.id
          ? {
              ...n,
              data: {
                ...n.data,
                label: nodeContent.label || n.data.label,
                content: nodeContent,
              },
            }
          : n
      )
    );
    setEditingNode(null);
    setNodeContent({});
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Convert React Flow format to API format
      const flows: Partial<ChatbotFlow>[] = nodes.map((node, index) => {
        // Find outgoing edge for next_node_id
        const outgoingEdge = edges.find((e) => e.source === node.id && !e.sourceHandle);
        
        return {
          node_id: node.id,
          node_type: node.type as any,
          name: node.data.label,
          position_x: Math.round(node.position.x),
          position_y: Math.round(node.position.y),
          content: node.data.content || {},
          next_node_id: outgoingEdge?.target || null,
          order_index: index,
        };
      });

      await saveFlows(chatbot.id, flows);
      toast.success('Fluxo salvo com sucesso!');
    } catch (error) {
      console.error('Erro ao salvar:', error);
      toast.error('Erro ao salvar fluxo');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[600px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-[700px]">
      {/* Sidebar with node types */}
      <div className="w-64 border-r bg-muted/30 p-4">
        <h3 className="font-medium mb-4 flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Adicionar Nó
        </h3>
        <ScrollArea className="h-[calc(100%-60px)]">
          <div className="space-y-2">
            {nodeTypeOptions.map((opt) => (
              <Card
                key={opt.type}
                className="cursor-grab active:cursor-grabbing hover:border-primary transition-colors"
                draggable
                onDragStart={(e) => onDragStart(e, opt.type)}
              >
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <opt.icon className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{opt.label}</p>
                    <p className="text-xs text-muted-foreground">{opt.description}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Flow Canvas */}
      <div className="flex-1" ref={reactFlowWrapper}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onDragOver={onDragOver}
          onDrop={onDrop}
          nodeTypes={nodeTypes}
          fitView
          snapToGrid
          snapGrid={[15, 15]}
          className="bg-background"
        >
          <Controls className="!bg-card !border !shadow-lg" />
          <MiniMap 
            className="!bg-card !border"
            nodeColor={(node) => {
              const colors: Record<string, string> = {
                start: '#22c55e',
                message: '#3b82f6',
                menu: '#a855f7',
                input: '#f59e0b',
                condition: '#f97316',
                action: '#06b6d4',
                transfer: '#ec4899',
                ai_response: '#8b5cf6',
                end: '#ef4444',
              };
              return colors[node.type || 'message'] || '#6b7280';
            }}
          />
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
          <Panel position="top-right" className="flex gap-2">
            <Button 
              onClick={() => setShowSimulator(!showSimulator)} 
              variant={showSimulator ? "secondary" : "outline"}
              size="sm"
            >
              {showSimulator ? <PanelRightClose className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
              {showSimulator ? "Fechar Teste" : "Testar Fluxo"}
            </Button>
            <Button onClick={handleSave} disabled={saving} variant="gradient">
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Salvar Fluxo
            </Button>
          </Panel>
        </ReactFlow>
      </div>

      {/* Simulator Panel */}
      {showSimulator && (
        <div className="w-96 border-l bg-background">
          <FlowSimulator
            nodes={nodes}
            edges={edges}
            chatbotName={chatbot.name}
            welcomeMessage={chatbot.welcome_message || undefined}
          />
        </div>
      )}

      {/* Node Editor Dialog */}
      <Dialog open={!!editingNode} onOpenChange={() => setEditingNode(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar {editingNode?.data.label}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome do Nó</Label>
              <Input
                value={nodeContent.label || editingNode?.data.label || ''}
                onChange={(e) => setNodeContent({ ...nodeContent, label: e.target.value })}
                placeholder="Nome do nó"
              />
            </div>

            {/* Message Node */}
            {editingNode?.type === 'message' && (
              <div className="space-y-2">
                <Label>Mensagem</Label>
                <Textarea
                  value={nodeContent.text || ''}
                  onChange={(e) => setNodeContent({ ...nodeContent, text: e.target.value })}
                  placeholder="Digite a mensagem..."
                  rows={4}
                />
              </div>
            )}

            {/* Menu Node */}
            {editingNode?.type === 'menu' && (
              <>
                <div className="space-y-2">
                  <Label>Texto do Menu</Label>
                  <Textarea
                    value={nodeContent.text || ''}
                    onChange={(e) => setNodeContent({ ...nodeContent, text: e.target.value })}
                    placeholder="Escolha uma opção:"
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Opções</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const options = nodeContent.options || [];
                        setNodeContent({
                          ...nodeContent,
                          options: [...options, { id: Date.now().toString(), label: '', next_node: '' }],
                        });
                      }}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Adicionar
                    </Button>
                  </div>
                  {(nodeContent.options || []).map((opt: any, idx: number) => (
                    <div key={opt.id} className="flex gap-2">
                      <Input
                        value={opt.label}
                        onChange={(e) => {
                          const options = [...(nodeContent.options || [])];
                          options[idx].label = e.target.value;
                          setNodeContent({ ...nodeContent, options });
                        }}
                        placeholder={`Opção ${idx + 1}`}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          const options = (nodeContent.options || []).filter((_: any, i: number) => i !== idx);
                          setNodeContent({ ...nodeContent, options });
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Input Node */}
            {editingNode?.type === 'input' && (
              <>
                <div className="space-y-2">
                  <Label>Pergunta</Label>
                  <Input
                    value={nodeContent.text || ''}
                    onChange={(e) => setNodeContent({ ...nodeContent, text: e.target.value })}
                    placeholder="Qual seu nome?"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Salvar em Variável</Label>
                  <Input
                    value={nodeContent.variable || ''}
                    onChange={(e) => setNodeContent({ ...nodeContent, variable: e.target.value })}
                    placeholder="user_name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Validação</Label>
                  <Select
                    value={nodeContent.validation || 'text'}
                    onValueChange={(v) => setNodeContent({ ...nodeContent, validation: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Texto livre</SelectItem>
                      <SelectItem value="phone">Telefone</SelectItem>
                      <SelectItem value="email">E-mail</SelectItem>
                      <SelectItem value="number">Número</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {/* Condition Node */}
            {editingNode?.type === 'condition' && (
              <>
                <div className="space-y-2">
                  <Label>Variável</Label>
                  <Input
                    value={nodeContent.variable || ''}
                    onChange={(e) => setNodeContent({ ...nodeContent, variable: e.target.value })}
                    placeholder="user_choice"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Operador</Label>
                  <Select
                    value={nodeContent.operator || 'equals'}
                    onValueChange={(v) => setNodeContent({ ...nodeContent, operator: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="equals">Igual a</SelectItem>
                      <SelectItem value="contains">Contém</SelectItem>
                      <SelectItem value="starts_with">Começa com</SelectItem>
                      <SelectItem value="gt">Maior que</SelectItem>
                      <SelectItem value="lt">Menor que</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Valor</Label>
                  <Input
                    value={nodeContent.value || ''}
                    onChange={(e) => setNodeContent({ ...nodeContent, value: e.target.value })}
                    placeholder="sim"
                  />
                </div>
              </>
            )}

            {/* AI Response Node */}
            {editingNode?.type === 'ai_response' && (
              <>
                <div className="space-y-2">
                  <Label>Contexto Adicional</Label>
                  <Textarea
                    value={nodeContent.context || ''}
                    onChange={(e) => setNodeContent({ ...nodeContent, context: e.target.value })}
                    placeholder="Contexto extra para a IA..."
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Salvar resposta em variável</Label>
                  <Input
                    value={nodeContent.save_to_variable || ''}
                    onChange={(e) => setNodeContent({ ...nodeContent, save_to_variable: e.target.value })}
                    placeholder="ai_response"
                  />
                </div>
              </>
            )}

            {/* Action Node */}
            {editingNode?.type === 'action' && (
              <>
                <div className="space-y-2">
                  <Label>Tipo de Ação</Label>
                  <Select
                    value={nodeContent.type || 'set_variable'}
                    onValueChange={(v) => setNodeContent({ ...nodeContent, type: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="set_variable">Definir Variável</SelectItem>
                      <SelectItem value="add_tag">Adicionar Tag</SelectItem>
                      <SelectItem value="notify">Notificar</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {nodeContent.type === 'set_variable' && (
                  <>
                    <div className="space-y-2">
                      <Label>Nome da Variável</Label>
                      <Input
                        value={nodeContent.variable_name || ''}
                        onChange={(e) => setNodeContent({ ...nodeContent, variable_name: e.target.value })}
                        placeholder="status"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Valor</Label>
                      <Input
                        value={nodeContent.variable_value || ''}
                        onChange={(e) => setNodeContent({ ...nodeContent, variable_value: e.target.value })}
                        placeholder="ativo"
                      />
                    </div>
                  </>
                )}
                {nodeContent.type === 'add_tag' && (
                  <div className="space-y-2">
                    <Label>Nome da Tag</Label>
                    <Input
                      value={nodeContent.tag_name || ''}
                      onChange={(e) => setNodeContent({ ...nodeContent, tag_name: e.target.value })}
                      placeholder="lead"
                    />
                  </div>
                )}
              </>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setEditingNode(null)}>
                Cancelar
              </Button>
              <Button onClick={saveNodeContent}>
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function FlowEditorDialog({ open, chatbot, onClose }: FlowEditorDialogProps) {
  if (!chatbot) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] p-0">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-primary" />
            Editor de Fluxo - {chatbot.name}
          </DialogTitle>
        </DialogHeader>
        <ReactFlowProvider>
          <FlowEditorContent chatbot={chatbot} onClose={onClose} />
        </ReactFlowProvider>
      </DialogContent>
    </Dialog>
  );
}
