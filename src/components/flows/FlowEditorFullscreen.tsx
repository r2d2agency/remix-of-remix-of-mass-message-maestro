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
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { 
  Save, Plus, MessageSquare, List, FormInput, GitBranch, 
  Zap, ArrowRightLeft, Sparkles, Square, Loader2, X,
  Clock, Webhook, Undo2, Play
} from 'lucide-react';
import { toast } from 'sonner';
import { nodeTypes, FlowNodeData } from '@/components/chatbots/FlowNodes';
import { useFlows, Flow } from '@/hooks/use-flows';
import { NodeEditorPanel } from './NodeEditorPanel';
import { FlowSimulator } from '@/components/chatbots/FlowSimulator';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';

interface FlowEditorFullscreenProps {
  open: boolean;
  flow: Flow;
  onClose: () => void;
}

const nodeTypeOptions = [
  { type: 'message', label: 'Mensagem', icon: MessageSquare, description: 'Envia uma mensagem', color: 'bg-blue-500' },
  { type: 'menu', label: 'Menu', icon: List, description: 'Opções para escolher', color: 'bg-purple-500' },
  { type: 'input', label: 'Entrada', icon: FormInput, description: 'Coleta informação', color: 'bg-green-500' },
  { type: 'condition', label: 'Condição', icon: GitBranch, description: 'Ramifica baseado em condição', color: 'bg-amber-500' },
  { type: 'action', label: 'Ação', icon: Zap, description: 'Executa uma ação', color: 'bg-orange-500' },
  { type: 'transfer', label: 'Transferir', icon: ArrowRightLeft, description: 'Transfere para atendente', color: 'bg-pink-500' },
  { type: 'ai_response', label: 'IA', icon: Sparkles, description: 'Resposta com IA', color: 'bg-violet-500' },
  { type: 'delay', label: 'Delay', icon: Clock, description: 'Aguarda X segundos', color: 'bg-cyan-500' },
  { type: 'webhook', label: 'Webhook', icon: Webhook, description: 'Chama API externa', color: 'bg-rose-500' },
  { type: 'end', label: 'Fim', icon: Square, description: 'Encerra o fluxo', color: 'bg-slate-500' },
];

function FlowEditorContent({ flow, onClose }: { flow: Flow; onClose: () => void }) {
  const { getCanvas, saveCanvas } = useFlows();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();
  
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingNode, setEditingNode] = useState<Node<FlowNodeData> | null>(null);
  const [draggedType, setDraggedType] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [showSimulator, setShowSimulator] = useState(false);

  const handleEditNode = useCallback((nodeId: string) => {
    setNodes((currentNodes) => {
      const node = currentNodes.find((n) => n.id === nodeId);
      if (node && node.type !== 'start') {
        setEditingNode(node);
      }
      return currentNodes;
    });
  }, [setNodes]);

  const handleDeleteNode = useCallback((nodeId: string) => {
    if (nodeId === 'start') {
      toast.error('Não é possível deletar o nó inicial');
      return;
    }
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setEditingNode((current) => current?.id === nodeId ? null : current);
  }, [setNodes, setEdges]);

  useEffect(() => {
    loadCanvas();
  }, [flow.id]);

  // Mark as changed when nodes/edges change
  useEffect(() => {
    if (!loading) {
      setHasChanges(true);
    }
  }, [nodes, edges]);

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
        deletable: true,
        style: { stroke: 'hsl(var(--primary))' },
      }));

      setNodes(nodesData);
      setEdges(edgesData);
    }
    setLoading(false);
    setHasChanges(false);
  };

  // Use refs for callbacks to avoid stale closures in nodes
  const handleEditNodeRef = useRef(handleEditNode);
  const handleDeleteNodeRef = useRef(handleDeleteNode);
  
  useEffect(() => {
    handleEditNodeRef.current = handleEditNode;
    handleDeleteNodeRef.current = handleDeleteNode;
  }, [handleEditNode, handleDeleteNode]);

  // Inject callbacks into all nodes for edit/delete functionality
  // This runs only once after initial load or when nodes are added
  const nodesNeedCallbacks = nodes.some(n => !n.data.onEdit || !n.data.onDelete);
  
  useEffect(() => {
    if (!loading && nodesNeedCallbacks) {
      setNodes((currentNodes) => 
        currentNodes.map((node) => ({
          ...node,
          data: {
            ...node.data,
            onEdit: (id: string) => handleEditNodeRef.current(id),
            onDelete: (id: string) => handleDeleteNodeRef.current(id),
          },
        }))
      );
    }
  }, [loading, nodesNeedCallbacks, setNodes]);


  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge({
      ...params,
      animated: true,
      deletable: true,
      style: { stroke: 'hsl(var(--primary))' },
    }, eds));
  }, [setEdges]);

  // Delete edge when clicked
  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setEdges((eds) => eds.filter((e) => e.id !== edge.id));
    toast.info('Conexão removida');
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
      if (!draggedType) return;

      // Usar a nova API screenToFlowPosition
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNodeId = `${draggedType}_${Date.now()}`;
      const newNode: Node<FlowNodeData> = {
        id: newNodeId,
        type: draggedType,
        position,
        data: {
          label: nodeTypeOptions.find(o => o.type === draggedType)?.label || draggedType,
          content: {},
        },
      };

      setNodes((nds) => nds.concat(newNode));
      setDraggedType(null);
      
      // Auto-open editor for new node (buscar o nó atualizado)
      setTimeout(() => {
        setEditingNode(newNode);
      }, 150);
    },
    [draggedType, screenToFlowPosition, setNodes]
  );

  const handleSaveNodeContent = (content: Record<string, any>) => {
    if (!editingNode) return;
    setNodes((nds) =>
      nds.map((n) =>
        n.id === editingNode.id
          ? { ...n, data: { ...n.data, label: content.label || n.data.label, content } }
          : n
      )
    );
    setEditingNode(null);
  };

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node<FlowNodeData>) => {
    if (node.type !== 'start') {
      // Buscar o nó atualizado no estado atual para garantir dados corretos
      setNodes((currentNodes) => {
        const updatedNode = currentNodes.find(n => n.id === node.id);
        if (updatedNode && updatedNode.type !== 'start') {
          setEditingNode(updatedNode);
        }
        return currentNodes;
      });
    }
  }, [setNodes]);

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
      setHasChanges(false);
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
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Carregando fluxo...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar - Node Palette */}
      <div className="w-64 border-r bg-card flex flex-col">
        <div className="p-4 border-b bg-muted/30">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold text-lg truncate">{flow.name}</h2>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            {flow.is_active && <Badge variant="default" className="text-xs">Ativo</Badge>}
            {hasChanges && <Badge variant="outline" className="text-xs">Alterações não salvas</Badge>}
          </div>
        </div>
        
        <div className="p-3 border-b">
          <h3 className="font-medium text-sm flex items-center gap-2 text-muted-foreground">
            <Plus className="h-4 w-4" />
            Arraste para adicionar
          </h3>
        </div>
        
        <ScrollArea className="flex-1">
          <div className="p-3 space-y-2">
            {nodeTypeOptions.map((opt) => (
              <Card
                key={opt.type}
                className="cursor-grab active:cursor-grabbing hover:border-primary transition-all hover:shadow-md group"
                draggable
                onDragStart={(e) => onDragStart(e, opt.type)}
              >
                <CardContent className="p-3 flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${opt.color} text-white transition-transform group-hover:scale-110`}>
                    <opt.icon className="h-4 w-4" />
                  </div>
                  <div className="overflow-hidden">
                    <p className="font-medium text-sm">{opt.label}</p>
                    <p className="text-xs text-muted-foreground truncate">{opt.description}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>

        <div className="p-3 border-t bg-muted/30">
          <p className="text-xs text-muted-foreground text-center">
            {nodes.length} nós • {edges.length} conexões
          </p>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1" ref={reactFlowWrapper}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onEdgeClick={onEdgeClick}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onNodeClick={handleNodeClick}
          nodeTypes={nodeTypes}
          deleteKeyCode={['Backspace', 'Delete']}
          fitView
          snapToGrid
          snapGrid={[15, 15]}
          className="bg-background"
        >
          <Controls className="!bg-card !border !shadow-lg" />
          <MiniMap className="!bg-card !border" nodeStrokeWidth={3} />
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
          <Panel position="top-right" className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => setShowSimulator(true)}
              className="bg-background/80 backdrop-blur"
            >
              <Play className="h-4 w-4 mr-2" />
              Testar Fluxo
            </Button>
            <Button variant="outline" onClick={loadCanvas} disabled={saving}>
              <Undo2 className="h-4 w-4 mr-2" />
              Reverter
            </Button>
            <Button onClick={handleSave} disabled={saving || !hasChanges}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Salvar Fluxo
            </Button>
          </Panel>
        </ReactFlow>
      </div>

      {/* Node Editor Panel */}
      {editingNode && (
        <NodeEditorPanel
          node={editingNode}
          onSave={handleSaveNodeContent}
          onClose={() => setEditingNode(null)}
        />
      )}

      {/* Flow Simulator Sheet */}
      <Sheet open={showSimulator} onOpenChange={setShowSimulator}>
        <SheetContent className="w-[400px] sm:w-[540px] p-0" side="right">
          <SheetHeader className="sr-only">
            <SheetTitle>Simulador de Fluxo</SheetTitle>
            <SheetDescription>Teste o fluxo interagindo como um usuário</SheetDescription>
          </SheetHeader>
          <div className="h-full">
            <FlowSimulator
              nodes={nodes}
              edges={edges}
              chatbotName={flow.name}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function FlowEditorFullscreen({ open, flow, onClose }: FlowEditorFullscreenProps) {
  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-[100vw] w-screen h-screen max-h-screen p-0 border-none rounded-none">
        <DialogTitle className="sr-only">Editor de Fluxo: {flow.name}</DialogTitle>
        <DialogDescription className="sr-only">
          Editor visual para criar e editar fluxos de automação
        </DialogDescription>
        <ReactFlowProvider>
          <FlowEditorContent flow={flow} onClose={onClose} />
        </ReactFlowProvider>
      </DialogContent>
    </Dialog>
  );
}
