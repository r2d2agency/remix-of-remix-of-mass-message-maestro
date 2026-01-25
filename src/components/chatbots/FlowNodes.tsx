import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { 
  Play, MessageSquare, List, FormInput, GitBranch, 
  Zap, ArrowRightLeft, Sparkles, Square, Trash2, Settings,
  Clock, Webhook
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface FlowNodeData {
  label: string;
  content?: Record<string, unknown>;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
}

const nodeColors: Record<string, { bg: string; border: string; icon: string }> = {
  start: { bg: 'bg-green-500/10', border: 'border-green-500', icon: 'text-green-500' },
  message: { bg: 'bg-blue-500/10', border: 'border-blue-500', icon: 'text-blue-500' },
  menu: { bg: 'bg-purple-500/10', border: 'border-purple-500', icon: 'text-purple-500' },
  input: { bg: 'bg-amber-500/10', border: 'border-amber-500', icon: 'text-amber-500' },
  condition: { bg: 'bg-orange-500/10', border: 'border-orange-500', icon: 'text-orange-500' },
  action: { bg: 'bg-cyan-500/10', border: 'border-cyan-500', icon: 'text-cyan-500' },
  transfer: { bg: 'bg-pink-500/10', border: 'border-pink-500', icon: 'text-pink-500' },
  ai_response: { bg: 'bg-violet-500/10', border: 'border-violet-500', icon: 'text-violet-500' },
  delay: { bg: 'bg-sky-500/10', border: 'border-sky-500', icon: 'text-sky-500' },
  webhook: { bg: 'bg-rose-500/10', border: 'border-rose-500', icon: 'text-rose-500' },
  end: { bg: 'bg-red-500/10', border: 'border-red-500', icon: 'text-red-500' },
};

const nodeIcons: Record<string, React.ElementType> = {
  start: Play,
  message: MessageSquare,
  menu: List,
  input: FormInput,
  condition: GitBranch,
  action: Zap,
  transfer: ArrowRightLeft,
  ai_response: Sparkles,
  delay: Clock,
  webhook: Webhook,
  end: Square,
};

interface BaseNodeProps extends NodeProps<FlowNodeData> {
  nodeType: string;
}

function BaseFlowNode({ id, data, nodeType, selected }: BaseNodeProps) {
  const colors = nodeColors[nodeType] || nodeColors.message;
  const Icon = nodeIcons[nodeType] || MessageSquare;
  const isStart = nodeType === 'start';
  const isEnd = nodeType === 'end';
  const isMenu = nodeType === 'menu';
  
  // Get menu options for dynamic handles
  const menuOptions = isMenu ? ((data.content?.options as any[]) || []) : [];

  return (
    <div
      className={cn(
        'px-4 py-3 rounded-xl border-2 shadow-lg min-w-[180px] max-w-[280px] transition-all',
        colors.bg,
        colors.border,
        selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
      )}
    >
      {/* Input Handle */}
      {!isStart && (
        <Handle
          type="target"
          position={Position.Top}
          className="!w-3 !h-3 !bg-muted-foreground !border-2 !border-background"
        />
      )}

      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <div className={cn('p-1.5 rounded-lg', colors.bg)}>
          <Icon className={cn('h-4 w-4', colors.icon)} />
        </div>
        <span className="font-medium text-sm truncate flex-1">{data.label}</span>
        {!isStart && !isEnd && (
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                data.onEdit?.(id);
              }}
            >
              <Settings className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                data.onDelete?.(id);
              }}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>

      {/* Content Preview */}
      {data.content && (
        <div className="text-xs text-muted-foreground line-clamp-2">
          {nodeType === 'message' && (data.content.text as string)}
          {nodeType === 'menu' && `${menuOptions.length} opções`}
          {nodeType === 'input' && `Variável: ${data.content.variable}`}
          {nodeType === 'condition' && `${data.content.variable} ${data.content.operator} ${data.content.value}`}
          {nodeType === 'action' && `Ação: ${data.content.action_type || data.content.type}`}
          {nodeType === 'transfer' && 'Transferir para atendente'}
          {nodeType === 'ai_response' && 'Resposta da IA'}
          {nodeType === 'delay' && `${data.content.duration || 5}${data.content.unit === 'minutes' ? 'min' : 's'}`}
          {nodeType === 'webhook' && (data.content.url ? 'API configurada' : 'Configurar...')}
        </div>
      )}

      {/* Menu Options Preview with dynamic handles */}
      {isMenu && menuOptions.length > 0 && (
        <div className="mt-2 pt-2 border-t border-purple-300/30 space-y-1">
          {menuOptions.slice(0, 5).map((opt: any, idx: number) => (
            <div key={opt.id || idx} className="flex items-center gap-1 text-xs">
              <span className="bg-purple-500/20 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded text-[10px] font-medium">
                {idx + 1}
              </span>
              <span className="truncate flex-1">{opt.label || `Opção ${idx + 1}`}</span>
            </div>
          ))}
          {menuOptions.length > 5 && (
            <span className="text-[10px] text-muted-foreground">+{menuOptions.length - 5} mais</span>
          )}
        </div>
      )}

      {/* Output Handle(s) */}
      {!isEnd && (
        <>
          {nodeType === 'condition' ? (
            <>
              <div className="flex justify-between mt-2 text-[10px]">
                <span className="text-green-600">Sim</span>
                <span className="text-red-600">Não</span>
              </div>
              <Handle
                type="source"
                position={Position.Bottom}
                id="true"
                className="!w-3 !h-3 !bg-green-500 !border-2 !border-background !left-[30%]"
              />
              <Handle
                type="source"
                position={Position.Bottom}
                id="false"
                className="!w-3 !h-3 !bg-red-500 !border-2 !border-background !left-[70%]"
              />
            </>
          ) : isMenu && menuOptions.length > 0 ? (
            // Menu nodes have multiple outputs based on options
            <div className="relative mt-3 pt-2">
              {menuOptions.map((opt: any, idx: number) => {
                const totalOptions = menuOptions.length;
                const position = ((idx + 1) / (totalOptions + 1)) * 100;
                return (
                  <Handle
                    key={opt.id || idx}
                    type="source"
                    position={Position.Bottom}
                    id={opt.id || `opt_${idx}`}
                    className="!w-2.5 !h-2.5 !bg-purple-500 !border-2 !border-background"
                    style={{ left: `${position}%` }}
                    title={`Opção ${idx + 1}: ${opt.label}`}
                  />
                );
              })}
              {/* Default fallback handle */}
              <Handle
                type="source"
                position={Position.Bottom}
                id="default"
                className="!w-2.5 !h-2.5 !bg-gray-400 !border-2 !border-background !left-[95%]"
                title="Padrão (opção inválida)"
              />
            </div>
          ) : (
            <Handle
              type="source"
              position={Position.Bottom}
              className="!w-3 !h-3 !bg-muted-foreground !border-2 !border-background"
            />
          )}
        </>
      )}
    </div>
  );
}

// Export individual node types
export const StartNode = memo((props: NodeProps<FlowNodeData>) => (
  <BaseFlowNode {...props} nodeType="start" />
));
StartNode.displayName = 'StartNode';

export const MessageNode = memo((props: NodeProps<FlowNodeData>) => (
  <div className="group">
    <BaseFlowNode {...props} nodeType="message" />
  </div>
));
MessageNode.displayName = 'MessageNode';

export const MenuNode = memo((props: NodeProps<FlowNodeData>) => (
  <div className="group">
    <BaseFlowNode {...props} nodeType="menu" />
  </div>
));
MenuNode.displayName = 'MenuNode';

export const InputNode = memo((props: NodeProps<FlowNodeData>) => (
  <div className="group">
    <BaseFlowNode {...props} nodeType="input" />
  </div>
));
InputNode.displayName = 'InputNode';

export const ConditionNode = memo((props: NodeProps<FlowNodeData>) => (
  <div className="group">
    <BaseFlowNode {...props} nodeType="condition" />
  </div>
));
ConditionNode.displayName = 'ConditionNode';

export const ActionNode = memo((props: NodeProps<FlowNodeData>) => (
  <div className="group">
    <BaseFlowNode {...props} nodeType="action" />
  </div>
));
ActionNode.displayName = 'ActionNode';

export const TransferNode = memo((props: NodeProps<FlowNodeData>) => (
  <div className="group">
    <BaseFlowNode {...props} nodeType="transfer" />
  </div>
));
TransferNode.displayName = 'TransferNode';

export const AIResponseNode = memo((props: NodeProps<FlowNodeData>) => (
  <div className="group">
    <BaseFlowNode {...props} nodeType="ai_response" />
  </div>
));
AIResponseNode.displayName = 'AIResponseNode';

export const DelayNode = memo((props: NodeProps<FlowNodeData>) => (
  <div className="group">
    <BaseFlowNode {...props} nodeType="delay" />
  </div>
));
DelayNode.displayName = 'DelayNode';

export const WebhookNode = memo((props: NodeProps<FlowNodeData>) => (
  <div className="group">
    <BaseFlowNode {...props} nodeType="webhook" />
  </div>
));
WebhookNode.displayName = 'WebhookNode';

export const EndNode = memo((props: NodeProps<FlowNodeData>) => (
  <BaseFlowNode {...props} nodeType="end" />
));
EndNode.displayName = 'EndNode';

export const nodeTypes = {
  start: StartNode,
  message: MessageNode,
  menu: MenuNode,
  input: InputNode,
  condition: ConditionNode,
  action: ActionNode,
  transfer: TransferNode,
  ai_response: AIResponseNode,
  delay: DelayNode,
  webhook: WebhookNode,
  end: EndNode,
};
