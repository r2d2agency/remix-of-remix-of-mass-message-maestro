import { useState, useEffect, useRef } from "react";
import { Node, Edge } from "reactflow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Play, RotateCcw, Send, Bot, User, Sparkles,
  ArrowRight, Clock, CheckCircle2, XCircle, Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FlowNodeData } from "./FlowNodes";

interface FlowSimulatorProps {
  nodes: Node<FlowNodeData>[];
  edges: Edge[];
  chatbotName: string;
  welcomeMessage?: string;
}

interface SimMessage {
  id: string;
  type: "bot" | "user" | "system";
  content: string;
  nodeId?: string;
  nodeType?: string;
  timestamp: Date;
}

interface SimulatorState {
  currentNodeId: string | null;
  variables: Record<string, string>;
  waitingForInput: boolean;
  inputVariable?: string;
  menuOptions?: Array<{ id: string; label: string; next_node?: string }>;
  isComplete: boolean;
  isTransferred: boolean;
}

export function FlowSimulator({
  nodes,
  edges,
  chatbotName,
  welcomeMessage,
}: FlowSimulatorProps) {
  const [messages, setMessages] = useState<SimMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [state, setState] = useState<SimulatorState>({
    currentNodeId: null,
    variables: {},
    waitingForInput: false,
    isComplete: false,
    isTransferred: false,
  });
  const [isRunning, setIsRunning] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const addMessage = (
    type: SimMessage["type"],
    content: string,
    nodeId?: string,
    nodeType?: string
  ) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `msg-${Date.now()}-${Math.random()}`,
        type,
        content,
        nodeId,
        nodeType,
        timestamp: new Date(),
      },
    ]);
  };

  const findNextNode = (currentId: string, handleId?: string): string | null => {
    const edge = edges.find((e) => {
      if (handleId) {
        return e.source === currentId && e.sourceHandle === handleId;
      }
      return e.source === currentId && !e.sourceHandle;
    });
    return edge?.target || null;
  };

  const processNode = async (nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) {
      addMessage("system", "❌ Nó não encontrado: " + nodeId);
      setState((s) => ({ ...s, isComplete: true }));
      return;
    }

    const content = node.data.content || {};

    // Simulate typing delay
    setIsTyping(true);
    await new Promise((r) => setTimeout(r, 500 + Math.random() * 500));
    setIsTyping(false);

    switch (node.type) {
      case "start":
        addMessage("system", "🚀 Fluxo iniciado", nodeId, "start");
        if (welcomeMessage) {
          await new Promise((r) => setTimeout(r, 300));
          addMessage("bot", welcomeMessage);
        }
        const nextFromStart = findNextNode(nodeId);
        if (nextFromStart) {
          processNode(nextFromStart);
        } else {
          setState((s) => ({ ...s, isComplete: true }));
        }
        break;

      case "message":
        const text = replaceVariables(content.text as string || "Mensagem vazia");
        addMessage("bot", text, nodeId, "message");
        const nextFromMessage = findNextNode(nodeId);
        if (nextFromMessage) {
          processNode(nextFromMessage);
        } else {
          setState((s) => ({ ...s, isComplete: true }));
        }
        break;

      case "menu":
        const menuText = replaceVariables(content.text as string || "Escolha uma opção:");
        const options = (content.options as any[]) || [];
        addMessage("bot", menuText, nodeId, "menu");
        setState((s) => ({
          ...s,
          currentNodeId: nodeId,
          waitingForInput: true,
          menuOptions: options.map((opt, idx) => ({
            id: opt.id || `opt-${idx}`,
            label: opt.label || `Opção ${idx + 1}`,
            next_node: opt.next_node,
          })),
        }));
        break;

      case "input":
        // Check both 'text' and 'prompt' fields for compatibility
        const promptText = content.text as string || content.prompt as string || "Digite sua resposta:";
        const variable = content.variable as string || "resposta";
        addMessage("bot", replaceVariables(promptText), nodeId, "input");
        setState((s) => ({
          ...s,
          currentNodeId: nodeId,
          waitingForInput: true,
          inputVariable: variable,
          menuOptions: undefined,
        }));
        break;

      case "condition":
        const varName = content.variable as string || "";
        const operator = content.operator as string || "equals";
        const condValue = content.value as string || "";
        const currentValue = state.variables[varName] || "";

        let result = false;
        switch (operator) {
          case "equals":
            result = currentValue === condValue;
            break;
          case "not_equals":
            result = currentValue !== condValue;
            break;
          case "contains":
            result = currentValue.includes(condValue);
            break;
          case "starts_with":
            result = currentValue.startsWith(condValue);
            break;
          case "ends_with":
            result = currentValue.endsWith(condValue);
            break;
          case "greater_than":
            result = parseFloat(currentValue) > parseFloat(condValue);
            break;
          case "less_than":
            result = parseFloat(currentValue) < parseFloat(condValue);
            break;
          default:
            result = currentValue === condValue;
        }

        addMessage(
          "system",
          `🔀 Condição: ${varName} ${operator} "${condValue}" → ${result ? "✅ Verdadeiro" : "❌ Falso"}`,
          nodeId,
          "condition"
        );

        const trueNode = content.true_node as string;
        const falseNode = content.false_node as string;
        const nextConditionNode = result ? trueNode : falseNode;

        if (!nextConditionNode) {
          // Try edges
          const edgeNext = findNextNode(nodeId, result ? "true" : "false");
          if (edgeNext) {
            processNode(edgeNext);
          } else {
            setState((s) => ({ ...s, isComplete: true }));
          }
        } else {
          processNode(nextConditionNode);
        }
        break;

      case "action":
        const actionType = content.type as string || "set_variable";
        const actionVar = content.variable as string || "";
        const actionVal = content.value as string || "";

        if (actionType === "set_variable") {
          setState((s) => ({
            ...s,
            variables: { ...s.variables, [actionVar]: replaceVariables(actionVal) },
          }));
          addMessage("system", `⚡ Variável: ${actionVar} = "${replaceVariables(actionVal)}"`, nodeId, "action");
        } else if (actionType === "add_tag") {
          addMessage("system", `🏷️ Tag adicionada: ${actionVal}`, nodeId, "action");
        } else {
          addMessage("system", `⚡ Ação: ${actionType}`, nodeId, "action");
        }

        const nextFromAction = findNextNode(nodeId);
        if (nextFromAction) {
          processNode(nextFromAction);
        } else {
          setState((s) => ({ ...s, isComplete: true }));
        }
        break;

      case "ai_response":
        const aiContext = content.context as string || "Resposta da IA";
        addMessage("bot", `🤖 [IA simulada] ${replaceVariables(aiContext)}`, nodeId, "ai_response");
        const nextFromAI = findNextNode(nodeId);
        if (nextFromAI) {
          processNode(nextFromAI);
        } else {
          setState((s) => ({ ...s, isComplete: true }));
        }
        break;

      case "transfer":
        addMessage("system", "🔄 Conversa transferida para atendente humano", nodeId, "transfer");
        setState((s) => ({ ...s, isComplete: true, isTransferred: true }));
        break;

      case "end":
        addMessage("system", "✅ Fluxo finalizado", nodeId, "end");
        setState((s) => ({ ...s, isComplete: true }));
        break;

      default:
        addMessage("system", `⚠️ Tipo de nó desconhecido: ${node.type}`, nodeId);
        setState((s) => ({ ...s, isComplete: true }));
    }
  };

  const replaceVariables = (text: string): string => {
    if (!text) return text;
    // Support both {{var}} and {var} syntax
    return text
      .replace(/\{\{(\w+)\}\}/g, (match, varName) => {
        return state.variables[varName] || match;
      })
      .replace(/\{(\w+)\}/g, (match, varName) => {
        return state.variables[varName] || match;
      });
  };

  const startSimulation = () => {
    setMessages([]);
    setState({
      currentNodeId: null,
      variables: {},
      waitingForInput: false,
      isComplete: false,
      isTransferred: false,
    });
    setIsRunning(true);

    // Find start node
    const startNode = nodes.find((n) => n.type === "start");
    if (startNode) {
      processNode(startNode.id);
    } else {
      addMessage("system", "❌ Nó de início não encontrado!");
      setState((s) => ({ ...s, isComplete: true }));
    }
  };

  const handleUserInput = () => {
    if (!inputValue.trim() || !state.waitingForInput) return;

    if (state.menuOptions) {
      // Menu selection - find by number or label
      const inputLower = inputValue.trim().toLowerCase();
      const inputNum = parseInt(inputValue.trim());
      
      let selectedOption = state.menuOptions.find((opt, idx) => {
        return (
          opt.label.toLowerCase() === inputLower ||
          (inputNum > 0 && inputNum === idx + 1)
        );
      });

      if (!selectedOption && inputNum > 0 && inputNum <= state.menuOptions.length) {
        selectedOption = state.menuOptions[inputNum - 1];
      }

      if (selectedOption) {
        addMessage("user", selectedOption.label);
        setState((s) => ({
          ...s,
          waitingForInput: false,
          menuOptions: undefined,
        }));

        if (selectedOption.next_node) {
          processNode(selectedOption.next_node);
        } else {
          // Find via edges
          const nextNode = findNextNode(state.currentNodeId!);
          if (nextNode) {
            processNode(nextNode);
          } else {
            setState((s) => ({ ...s, isComplete: true }));
          }
        }
      } else {
        addMessage("user", inputValue);
        addMessage("bot", "Por favor, escolha uma opção válida.");
      }
    } else if (state.inputVariable) {
      // Text input
      addMessage("user", inputValue);
      setState((s) => ({
        ...s,
        variables: { ...s.variables, [state.inputVariable!]: inputValue },
        waitingForInput: false,
        inputVariable: undefined,
      }));

      const nextNode = findNextNode(state.currentNodeId!);
      if (nextNode) {
        processNode(nextNode);
      } else {
        setState((s) => ({ ...s, isComplete: true }));
      }
    }

    setInputValue("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleUserInput();
    }
  };

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-muted/30 to-muted/10 rounded-lg border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-background/80 backdrop-blur">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <span className="font-medium">{chatbotName}</span>
          {state.isComplete && (
            <Badge variant={state.isTransferred ? "secondary" : "default"} className="text-xs">
              {state.isTransferred ? "Transferido" : "Finalizado"}
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={startSimulation}
            disabled={isTyping}
          >
            {isRunning ? (
              <>
                <RotateCcw className="h-4 w-4 mr-1" />
                Reiniciar
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-1" />
                Iniciar Teste
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        {!isRunning && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Bot className="h-12 w-12 mb-4 opacity-50" />
            <p className="text-sm">Clique em "Iniciar Teste" para simular o fluxo</p>
            <p className="text-xs mt-1">Você poderá interagir como um usuário real</p>
          </div>
        )}

        <div className="space-y-3">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex",
                msg.type === "user" ? "justify-end" : "justify-start"
              )}
            >
              {msg.type === "system" ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full">
                  <ArrowRight className="h-3 w-3" />
                  {msg.content}
                </div>
              ) : (
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-4 py-2 shadow-sm",
                    msg.type === "user"
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-card border rounded-bl-md"
                  )}
                >
                  <div className="flex items-start gap-2">
                    {msg.type === "bot" && (
                      <Bot className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                    )}
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    {msg.type === "user" && (
                      <User className="h-4 w-4 mt-0.5 shrink-0" />
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Typing indicator */}
          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-card border rounded-2xl rounded-bl-md px-4 py-2">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-primary" />
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Menu options display */}
          {state.menuOptions && state.waitingForInput && (
            <div className="flex flex-wrap gap-2 mt-2">
              {state.menuOptions.map((opt, idx) => (
                <Button
                  key={opt.id}
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={() => {
                    setInputValue(opt.label);
                    setTimeout(() => handleUserInput(), 100);
                  }}
                >
                  {idx + 1}. {opt.label}
                </Button>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Variables panel */}
      {Object.keys(state.variables).length > 0 && (
        <div className="px-4 py-2 border-t bg-muted/30">
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-muted-foreground">Variáveis:</span>
            {Object.entries(state.variables).map(([key, value]) => (
              <Badge key={key} variant="secondary" className="text-xs">
                {key}: {value}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t bg-background">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              !isRunning
                ? "Inicie o teste primeiro..."
                : state.isComplete
                ? "Fluxo finalizado"
                : state.menuOptions
                ? "Digite o número ou nome da opção..."
                : "Digite sua mensagem..."
            }
            disabled={!isRunning || state.isComplete || isTyping}
            className="flex-1"
          />
          <Button
            onClick={handleUserInput}
            disabled={!isRunning || state.isComplete || !inputValue.trim() || isTyping}
            size="icon"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
