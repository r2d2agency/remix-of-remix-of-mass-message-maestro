import { useState, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { 
  Bot, Send, Loader2, User, AlertCircle, Trash2, 
  RefreshCw, Brain, Clock
} from 'lucide-react';
import { AIAgent } from '@/hooks/use-ai-agents';
import { api } from '@/lib/api';
import { toast } from 'sonner';

interface AgentTestChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: AIAgent | null;
}

interface ToolCallInfo {
  tool: string;
  arguments: Record<string, unknown>;
  response_preview: string;
}

interface TestMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  tokens?: number;
  sources_used?: string[];
  processing_time_ms?: number;
  tool_calls?: ToolCallInfo[];
  error?: boolean;
}

export function AgentTestChatDialog({ open, onOpenChange, agent }: AgentTestChatDialogProps) {
  const [messages, setMessages] = useState<TestMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [tokenCount, setTokenCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && agent) {
      // Add system greeting
      setMessages([{
        id: 'welcome',
        role: 'system',
        content: `Modo de teste ativado para o agente "${agent.name}". Envie mensagens para simular uma conversa.`,
        timestamp: new Date(),
      }]);
      setTokenCount(0);
      // Focus input after a short delay
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, agent]);

  useEffect(() => {
    // Scroll to bottom when new message arrives
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !agent || loading) return;

    const userMessage: TestMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const startTime = Date.now();
      
      // Call the test endpoint
      const response = await api<{
        response: string;
        tokens_used: number;
        sources_used?: string[];
        model_used?: string;
        tool_calls?: ToolCallInfo[];
      }>(`/api/ai-agents/${agent.id}/test`, {
        method: 'POST',
        body: {
          message: userMessage.content,
          history: messages
            .filter(m => m.role !== 'system')
            .map(m => ({ role: m.role, content: m.content })),
        },
        auth: true,
      });

      const processingTime = Date.now() - startTime;

      // Show tool call info
      if (response.tool_calls && response.tool_calls.length > 0) {
        for (const tc of response.tool_calls) {
          const toolLabels: Record<string, string> = {
            consult_specialist_agent: `🤖 Consultou agente "${tc.arguments?.agent_name}": "${tc.arguments?.question}"`,
            create_deal: `📊 Criou negócio: "${tc.arguments?.title}" (R$ ${tc.arguments?.value || 0})`,
            manage_tasks: tc.arguments?.action === 'create' 
              ? `📋 Criou tarefa: "${tc.arguments?.title}"` 
              : `📋 Listou tarefas pendentes`,
            qualify_lead: `🎯 Qualificou lead: ${tc.arguments?.qualification} (score: ${tc.arguments?.score})`,
            summarize_conversation: `📝 Resumiu conversa (sentimento: ${tc.arguments?.customer_sentiment})`,
          };
          setMessages(prev => [...prev, {
            id: `tool-${Date.now()}-${tc.tool}`,
            role: 'system',
            content: toolLabels[tc.tool] || `🔧 ${tc.tool}`,
            timestamp: new Date(),
          }]);
        }
      }

      const assistantMessage: TestMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response.response,
        timestamp: new Date(),
        tokens: response.tokens_used,
        sources_used: response.sources_used,
        processing_time_ms: processingTime,
        tool_calls: response.tool_calls,
      };

      setMessages(prev => [...prev, assistantMessage]);
      setTokenCount(prev => prev + (response.tokens_used || 0));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao processar mensagem';
      
      // Check if it's a missing API key error
      const needsApiKey = errorMessage.toLowerCase().includes('api') && 
                          errorMessage.toLowerCase().includes('key');
      
      const errorContent = needsApiKey 
        ? `⚠️ ${errorMessage}\n\nPara treinar e testar o agente, configure uma chave de API válida do ${agent.ai_provider === 'openai' ? 'OpenAI' : 'Google Gemini'} nas configurações do agente.`
        : `Erro: ${errorMessage}`;

      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: errorContent,
        timestamp: new Date(),
        error: true,
      }]);

      if (needsApiKey) {
        toast.error('Configure uma chave de API para testar o agente');
      }
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => {
    setMessages([{
      id: 'welcome',
      role: 'system',
      content: `Chat limpo. Envie uma nova mensagem para continuar testando "${agent?.name}".`,
      timestamp: new Date(),
    }]);
    setTokenCount(0);
  };

  if (!agent) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[80vh] flex flex-col p-0">
        <DialogHeader className="p-4 pb-2 border-b">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-primary" />
                Testar Agente: {agent.name}
              </DialogTitle>
              <DialogDescription className="flex items-center gap-3 mt-1">
                <Badge variant="secondary" className="text-xs">
                  {agent.ai_provider === 'openai' ? 'OpenAI' : 'Gemini'} • {agent.ai_model}
                </Badge>
                <span className="text-xs flex items-center gap-1">
                  <Brain className="h-3 w-3" />
                  {tokenCount.toLocaleString()} tokens
                </span>
              </DialogDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={clearChat}>
              <Trash2 className="h-4 w-4 mr-1" />
              Limpar
            </Button>
          </div>
        </DialogHeader>

        {/* Messages Area */}
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {message.role !== 'user' && (
                  <div className={`p-2 rounded-lg ${
                    message.role === 'system' ? 'bg-muted' : 
                    message.error ? 'bg-destructive/10' : 'bg-primary/10'
                  }`}>
                    {message.role === 'system' ? (
                      <AlertCircle className="h-4 w-4 text-muted-foreground" />
                    ) : message.error ? (
                      <AlertCircle className="h-4 w-4 text-destructive" />
                    ) : (
                      <Bot className="h-4 w-4 text-primary" />
                    )}
                  </div>
                )}

                <div className={`max-w-[80%] ${
                  message.role === 'user' ? 'order-first' : ''
                }`}>
                  <div
                    className={`rounded-lg p-3 ${
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : message.role === 'system'
                        ? 'bg-muted text-muted-foreground text-sm'
                        : message.error
                        ? 'bg-destructive/10 border border-destructive/20'
                        : 'bg-muted'
                    }`}
                  >
                    <p className="whitespace-pre-wrap text-sm">{message.content}</p>
                  </div>

                  {/* Message metadata */}
                  {message.role === 'assistant' && !message.error && (
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                      {message.processing_time_ms && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {(message.processing_time_ms / 1000).toFixed(1)}s
                        </span>
                      )}
                      {message.tokens && (
                        <span>{message.tokens} tokens</span>
                      )}
                      {message.sources_used && message.sources_used.length > 0 && (
                        <span className="text-primary">
                          {message.sources_used.length} fonte(s) usada(s)
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {message.role === 'user' && (
                  <div className="p-2 rounded-lg bg-primary/10">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="bg-muted rounded-lg p-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processando...
                  </div>
                </div>
              </div>
            )}

            <div ref={scrollRef} />
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="p-4 border-t bg-background">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              placeholder="Digite uma mensagem de teste..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              className="flex-1"
            />
            <Button onClick={handleSend} disabled={loading || !input.trim()}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Este é um ambiente de teste. As mensagens não são salvas.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
