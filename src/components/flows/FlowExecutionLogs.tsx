import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  Loader2,
  RefreshCw,
  Trash2,
  Play,
  Pause,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Clock,
  MessageSquare,
  GitBranch,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ExecutionLog {
  at: string;
  type: "node_start" | "transition" | "waiting_input" | "flow_complete" | "error";
  flowId?: string;
  nodeId?: string;
  nodeType?: string;
  nodeName?: string;
  fromNodeId?: string;
  toNodeId?: string;
  step?: number;
  message?: string;
  handle?: string;
  variables?: Record<string, string>;
  resumed?: boolean;
  conversationId?: string;
}

interface FlowExecutionLogsProps {
  conversationId?: string;
  className?: string;
}

const nodeTypeIcons: Record<string, React.ReactNode> = {
  message: <MessageSquare className="h-3 w-3" />,
  input: <Pause className="h-3 w-3" />,
  menu: <GitBranch className="h-3 w-3" />,
  condition: <GitBranch className="h-3 w-3" />,
  action: <Zap className="h-3 w-3" />,
  delay: <Clock className="h-3 w-3" />,
  start: <Play className="h-3 w-3" />,
  end: <CheckCircle2 className="h-3 w-3" />,
};

const logTypeColors: Record<string, string> = {
  node_start: "bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-300",
  transition: "bg-gray-500/10 border-gray-500/30 text-gray-700 dark:text-gray-300",
  waiting_input: "bg-yellow-500/10 border-yellow-500/30 text-yellow-700 dark:text-yellow-300",
  flow_complete: "bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-300",
  error: "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300",
};

const logTypeBadge: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  node_start: { label: "Nó", variant: "default" },
  transition: { label: "→", variant: "outline" },
  waiting_input: { label: "Aguardando", variant: "secondary" },
  flow_complete: { label: "Fim", variant: "default" },
  error: { label: "Erro", variant: "destructive" },
};

export function FlowExecutionLogs({ conversationId, className }: FlowExecutionLogsProps) {
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);

  const fetchLogs = useCallback(async () => {
    try {
      const endpoint = conversationId 
        ? `/api/flows/execution-logs/${conversationId}?limit=100`
        : `/api/flows/execution-logs?limit=100`;
      const result = await api<{ logs: ExecutionLog[] }>(endpoint);
      setLogs(result.logs || []);
    } catch (error: any) {
      console.error("Error fetching execution logs:", error);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  const handleClear = async () => {
    setClearing(true);
    try {
      const endpoint = conversationId 
        ? `/api/flows/execution-logs/${conversationId}`
        : `/api/flows/execution-logs`;
      await api(endpoint, { method: "DELETE" });
      setLogs([]);
      toast.success("Logs limpos");
    } catch (error: any) {
      toast.error(error.message || "Erro ao limpar logs");
    } finally {
      setClearing(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    // Auto-refresh every 3 seconds
    const interval = setInterval(fetchLogs, 3000);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card className={cn("", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-primary" />
              Logs de Execução de Fluxo
            </CardTitle>
            <CardDescription className="mt-1">
              {conversationId 
                ? "Histórico de execução do fluxo nesta conversa"
                : "Histórico de execução de fluxos em todas as conversas"
              }
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
              <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
              Atualizar
            </Button>
            <Button variant="destructive" size="sm" onClick={handleClear} disabled={clearing || logs.length === 0}>
              <Trash2 className="h-4 w-4 mr-2" />
              Limpar
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] rounded-md border border-border">
          <div className="p-3 space-y-2">
            {logs.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                Nenhum log de execução registrado ainda.
                <br />
                <span className="text-xs">Inicie um fluxo para ver os logs aqui.</span>
              </div>
            ) : (
              logs.map((log, i) => (
                <div
                  key={i}
                  className={cn(
                    "rounded-md border p-3 text-sm",
                    logTypeColors[log.type] || "bg-muted/50 border-border"
                  )}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant={logTypeBadge[log.type]?.variant || "outline"}
                        className="text-xs"
                      >
                        {logTypeBadge[log.type]?.label || log.type}
                      </Badge>
                      {log.nodeType && (
                        <Badge variant="outline" className="text-xs flex items-center gap-1">
                          {nodeTypeIcons[log.nodeType] || <Play className="h-3 w-3" />}
                          {log.nodeType}
                        </Badge>
                      )}
                      {log.step && (
                        <span className="text-xs text-muted-foreground">
                          Passo #{log.step}
                        </span>
                      )}
                      {log.resumed && (
                        <Badge variant="secondary" className="text-xs">
                          retomado
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(log.at).toLocaleString()}
                    </span>
                  </div>

                  <div className="mt-2 font-medium">
                    {log.message}
                  </div>

                  {log.type === "transition" && (
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <code className="bg-background/50 px-1 rounded">{log.fromNodeId}</code>
                      <ArrowRight className="h-3 w-3" />
                      <code className="bg-background/50 px-1 rounded">{log.toNodeId}</code>
                      {log.handle && log.handle !== "default" && (
                        <Badge variant="outline" className="text-xs">
                          handle: {log.handle}
                        </Badge>
                      )}
                    </div>
                  )}

                  {log.nodeId && log.type === "node_start" && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      ID: <code className="bg-background/50 px-1 rounded">{log.nodeId}</code>
                    </div>
                  )}

                  {log.variables && Object.keys(log.variables).length > 0 && (
                    <div className="mt-2 text-xs">
                      <span className="text-muted-foreground">Variáveis:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {Object.entries(log.variables).map(([key, value]) => (
                          <Badge key={key} variant="outline" className="text-xs">
                            {key}: {String(value).substring(0, 30)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {!conversationId && log.conversationId && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Conversa: <code className="bg-background/50 px-1 rounded">{log.conversationId.substring(0, 8)}...</code>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
