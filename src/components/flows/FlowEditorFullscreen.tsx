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
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Save, Plus, MessageSquare, List, FormInput, GitBranch, 
  Zap, ArrowRightLeft, Sparkles, Square, Loader2, Trash2, X,
  Play, Clock, Webhook
} from 'lucide-react';
import { toast } from 'sonner';
import { nodeTypes, FlowNodeData } from '@/components/chatbots/FlowNodes';
import { useFlows, Flow } from '@/hooks/use-flows';

interface FlowEditorFullscreenProps {
  open: boolean;
  flow: Flow;
  onClose: () => void;
}

const nodeTypeOptions = [
  { type: 'message', label: 'Mensagem', icon: MessageSquare, description: 'Envia uma mensagem' },
  { type: 'menu', label: 'Menu', icon: List, description: 'Opções para escolher' },
  { type: 'input', label: 'Entrada', icon: FormInput, description: 'Coleta informação' },
  { type: 'condition', label: 'Condição', icon: GitBranch, description: 'Ramifica baseado em condição' },
  { type: 'action', label: 'Ação', icon: Zap, description: 'Executa uma ação' },
  { type: 'transfer', label: 'Transferir', icon: ArrowRightLeft, description: 'Transfere para atendente' },
  { type: 'ai_response', label: 'IA', icon: Sparkles, description: 'Resposta com IA' },
  { type: 'delay', label: 'Delay', icon: Clock, description: 'Aguarda X segundos' },
  { type: 'webhook', label: 'Webhook', icon: Webhook, description: 'Chama API externa' },
  { type: 'end', label: 'Fim', icon: Square, description: 'Encerra o fluxo' },
];

function FlowEditorContent({ flow, onClose }: { flow: Flow; onClose: () => void }) {
  const { getCanvas, saveCanvas } = useFlows();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { project } = useReactFlow();
  
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingNode, setEditingNode] = useState<Node<FlowNodeData> | null>(null);
  const [nodeContent, setNodeContent] = useState<Record<string, any>>({});
  const [draggedType, setDraggedType] = useState<string | null>(null);

  useEffect(() => {
    loadCanvas();
  }, [flow.id]);

  const loadCanvas = async () => {
    setLoading(true);
    const canvas = await getCanvas(flow.id);
    
    if (!canvas || canvas.nodes.length === 0) {
      setNodes([{
        id: 'start',
        type: 'start',
        position: { x: 250, y: 50 },
        data: { label: 'Início' },
      }]);
    } else {
      const nodesData: Node<FlowNodeData>[] = canvas.nodes.map((n) => ({
        id: n.node_id,
        type: n.node_type,
        position: { x: n.position_x, y: n.position_y },
        data: {
          label: n.name || n.node_type,
          content: n.content as Record<string, unknown>,
          onEdit: (id: string) => handleEditNode(id),
          onDelete: (id: string) => handleDeleteNode(id),
        },
      }));

      const edgesData: Edge[] = canvas.edges.map((e) => ({
        id: e.edge_id,
        source: e.source_node_id,
        target: e.target_node_id,
        sourceHandle: e.source_handle || undefined,
        targetHandle: e.target_handle || undefined,
        label: e.label || undefined,
        animated: true,
        style: { stroke: 'hsl(var(--primary))' },
      }));

      setNodes(nodesData);
      setEdges(edgesData);
    }
    setLoading(false);
  };

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

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge({
      ...params,
      animated: true,
      style: { stroke: 'hsl(var(--primary))' },
    }, eds));
  }, [setEdges]);

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
          label: nodeTypeOptions.find(o => o.type === draggedType)?.label || draggedType,
          content: {},
          onEdit: (id: string) => handleEditNode(id),
          onDelete: (id: string) => handleDeleteNode(id),
        },
      };

      setNodes((nds) => nds.concat(newNode));
      setDraggedType(null);
    },
    [draggedType, project, setNodes, handleEditNode, handleDeleteNode]
  );

  const saveNodeContent = () => {
    if (!editingNode) return;
    setNodes((nds) =>
      nds.map((n) =>
        n.id === editingNode.id
          ? { ...n, data: { ...n.data, label: nodeContent.label || n.data.label, content: nodeContent } }
          : n
      )
    );
    setEditingNode(null);
    setNodeContent({});
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const nodesData = nodes.map((node) => ({
        node_id: node.id,
        node_type: node.type,
        name: node.data.label,
        position_x: Math.round(node.position.x),
        position_y: Math.round(node.position.y),
        content: node.data.content || {},
      }));

      const edgesData = edges.map((edge) => ({
        edge_id: edge.id,
        source_node_id: edge.source,
        target_node_id: edge.target,
        source_handle: edge.sourceHandle,
        target_handle: edge.targetHandle,
        label: edge.label,
      }));

      await saveCanvas(flow.id, { nodes: nodesData, edges: edgesData });
      toast.success('Fluxo salvo com sucesso!');
    } catch (error) {
      toast.error('Erro ao salvar fluxo');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <div className="w-64 border-r bg-card p-4 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-lg truncate">{flow.name}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <h3 className="font-medium mb-3 flex items-center gap-2 text-sm">
          <Plus className="h-4 w-4" />
          Arraste para adicionar
        </h3>
        <ScrollArea className="flex-1">
          <div className="space-y-2 pr-2">
            {nodeTypeOptions.map((opt) => (
              <Card
                key={opt.type}
                className="cursor-grab active:cursor-grabbing hover:border-primary transition-all hover:shadow-md"
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

      {/* Canvas */}
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
          <MiniMap className="!bg-card !border" />
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
          <Panel position="top-right" className="flex gap-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Salvar Fluxo
            </Button>
          </Panel>
        </ReactFlow>
      </div>

      {/* Node Editor */}
      {editingNode && (
        <div className="w-80 border-l bg-card p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Editar Nó</h3>
            <Button variant="ghost" size="icon" onClick={() => setEditingNode(null)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                value={nodeContent.label || editingNode.data.label || ''}
                onChange={(e) => setNodeContent({ ...nodeContent, label: e.target.value })}
              />
            </div>
            {editingNode.type === 'message' && (
              <div className="space-y-2">
                <Label>Mensagem</Label>
                <Textarea
                  value={nodeContent.text || ''}
                  onChange={(e) => setNodeContent({ ...nodeContent, text: e.target.value })}
                  rows={4}
                />
              </div>
            )}
            <Button onClick={saveNodeContent} className="w-full">
              Aplicar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function FlowEditorFullscreen({ open, flow, onClose }: FlowEditorFullscreenProps) {
  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-[100vw] w-screen h-screen max-h-screen p-0 border-none rounded-none">
        <ReactFlowProvider>
          <FlowEditorContent flow={flow} onClose={onClose} />
        </ReactFlowProvider>
      </DialogContent>
    </Dialog>
  );
}
