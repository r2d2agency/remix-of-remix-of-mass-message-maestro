import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Terminal, ChevronDown, ChevronUp, RefreshCw, Loader2, Trash2 } from "lucide-react";

interface SyncLog {
  id: string;
  level: string;
  event: string;
  payload: Record<string, any>;
  created_at: string;
}

const levelColors: Record<string, string> = {
  info: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
  warn: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30",
  error: "bg-destructive/15 text-destructive border-destructive/30",
};

export function SyncLogsPanel() {
  const [open, setOpen] = useState(false);

  const { data: logs, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["aasp-sync-logs"],
    queryFn: () => api<SyncLog[]>("/api/aasp/sync-logs"),
    enabled: open,
    refetchInterval: open ? 5000 : false,
  });

  const handleClear = async () => {
    try {
      await api("/api/aasp/sync-logs", { method: "DELETE" });
      refetch();
    } catch {
      // silent
    }
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-accent/50 transition-colors py-3">
            <CardTitle className="flex items-center justify-between text-sm font-medium">
              <span className="flex items-center gap-2">
                <Terminal className="h-4 w-4 text-muted-foreground" />
                Logs de Sincronização
              </span>
              {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 pb-3">
            <div className="flex gap-2 mb-3">
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
                {isFetching ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                <span className="ml-1">Atualizar</span>
              </Button>
              <Button variant="ghost" size="sm" onClick={handleClear}>
                <Trash2 className="h-3 w-3 mr-1" />
                Limpar
              </Button>
            </div>
            <ScrollArea className="h-[300px] rounded-md border bg-muted/30 p-2">
              {isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : !logs || logs.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">
                  Nenhum log disponível. Clique em "Sincronizar" para gerar logs.
                </p>
              ) : (
                <div className="space-y-1 font-mono text-xs">
                  {logs.map((log) => (
                    <div key={log.id} className="flex items-start gap-2 py-1 px-1 rounded hover:bg-accent/50">
                      <span className="text-muted-foreground whitespace-nowrap shrink-0">
                        {new Date(log.created_at).toLocaleTimeString("pt-BR")}
                      </span>
                      <Badge variant="outline" className={`text-[10px] px-1 py-0 shrink-0 ${levelColors[log.level] || ""}`}>
                        {log.level.toUpperCase()}
                      </Badge>
                      <span className="text-foreground font-semibold shrink-0">{log.event}</span>
                      {Object.keys(log.payload).length > 0 && (
                        <span className="text-muted-foreground break-all">
                          {JSON.stringify(log.payload, null, 0)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
