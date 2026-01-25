import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { GitBranch, Loader2, Play, Tag, Zap } from "lucide-react";
import { toast } from "sonner";
import { useFlows, Flow } from "@/hooks/use-flows";
import { api } from "@/lib/api";

interface StartFlowDialogProps {
  open: boolean;
  onClose: () => void;
  conversationId: string;
  connectionId: string;
  onFlowStarted?: () => void;
}

export function StartFlowDialog({
  open,
  onClose,
  conversationId,
  connectionId,
  onFlowStarted,
}: StartFlowDialogProps) {
  const [flows, setFlows] = useState<(Flow & { node_count?: number })[]>([]);
  const [loadingFlows, setLoadingFlows] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);

  useEffect(() => {
    if (open && connectionId) {
      loadFlows();
    }
  }, [open, connectionId]);

  const loadFlows = async () => {
    setLoadingFlows(true);
    try {
      const result = await api<(Flow & { node_count?: number })[]>(
        `/api/flows/available/${connectionId}`,
        { auth: true }
      );
      setFlows(result);
    } catch (error) {
      console.error("Error loading flows:", error);
      setFlows([]);
    }
    setLoadingFlows(false);
  };

  const handleStartFlow = async (flow: Flow) => {
    setStarting(flow.id);
    
    try {
      await api(`/api/flows/conversation/${conversationId}/start`, {
        method: 'POST',
        body: { flow_id: flow.id },
        auth: true,
      });
      
      toast.success(`Fluxo "${flow.name}" iniciado!`);
      onFlowStarted?.();
      onClose();
    } catch (error) {
      console.error("Error starting flow:", error);
      toast.error("Erro ao iniciar fluxo");
    }
    
    setStarting(null);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-primary" />
            Iniciar Fluxo
          </DialogTitle>
          <DialogDescription>
            Selecione um fluxo para executar nesta conversa
          </DialogDescription>
        </DialogHeader>

        {loadingFlows ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : flows.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <GitBranch className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nenhum fluxo disponível para esta conexão</p>
            <p className="text-sm mt-1">
              Configure fluxos em Atendimento → Fluxos
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-2">
              {flows.map((flow) => (
                <Card
                  key={flow.id}
                  className="cursor-pointer hover:border-primary transition-colors"
                  onClick={() => handleStartFlow(flow)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium">{flow.name}</h4>
                          {flow.trigger_enabled && (
                            <Badge variant="outline" className="text-xs">
                              <Zap className="h-3 w-3 mr-1" />
                              Auto
                            </Badge>
                          )}
                          {flow.node_count && (
                            <Badge variant="secondary" className="text-xs">
                              {flow.node_count} nós
                            </Badge>
                          )}
                        </div>
                        {flow.description && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {flow.description}
                          </p>
                        )}
                        {flow.trigger_keywords && flow.trigger_keywords.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {flow.trigger_keywords.slice(0, 3).map((kw, idx) => (
                              <Badge key={idx} variant="secondary" className="text-xs">
                                <Tag className="h-3 w-3 mr-1" />
                                {kw}
                              </Badge>
                            ))}
                            {flow.trigger_keywords.length > 3 && (
                              <Badge variant="secondary" className="text-xs">
                                +{flow.trigger_keywords.length - 3}
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                      <Button
                        size="sm"
                        disabled={starting === flow.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartFlow(flow);
                        }}
                      >
                        {starting === flow.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Play className="h-4 w-4 mr-1" />
                            Iniciar
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
