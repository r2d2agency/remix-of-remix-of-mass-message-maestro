import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { GitBranch, Loader2, Play, Tag, Zap, Search, FolderOpen, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { useFlows, Flow } from "@/hooks/use-flows";
import { api } from "@/lib/api";

interface AvailableFlow extends Flow {
  node_count?: number;
  category_name?: string | null;
  category_color?: string | null;
  category_sort_order?: number | null;
}

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
  const [flows, setFlows] = useState<AvailableFlow[]>([]);
  const [loadingFlows, setLoadingFlows] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open && connectionId) {
      loadFlows();
      setSearchQuery("");
    }
  }, [open, connectionId]);

  const loadFlows = async () => {
    setLoadingFlows(true);
    try {
      const result = await api<AvailableFlow[]>(
        `/api/flows/available/${connectionId}`,
        { auth: true }
      );
      setFlows(result);
      // Expand all categories by default
      const cats = new Set(result.map(f => f.category_id || 'uncategorized'));
      setExpandedCategories(cats);
    } catch (error) {
      console.error("Error loading flows:", error);
      setFlows([]);
    }
    setLoadingFlows(false);
  };

  const handleStartFlow = async (flow: AvailableFlow) => {
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

  const filteredFlows = useMemo(() => {
    if (!searchQuery) return flows;
    const q = searchQuery.toLowerCase();
    return flows.filter(f => 
      f.name.toLowerCase().includes(q) ||
      f.description?.toLowerCase().includes(q) ||
      f.trigger_keywords?.some(k => k.includes(q)) ||
      f.category_name?.toLowerCase().includes(q)
    );
  }, [flows, searchQuery]);

  const groupedFlows = useMemo(() => {
    const groups: { key: string; name: string; color: string | null; flows: AvailableFlow[] }[] = [];
    const catMap: Record<string, AvailableFlow[]> = {};
    const uncategorized: AvailableFlow[] = [];

    filteredFlows.forEach(flow => {
      const catKey = flow.category_id || 'uncategorized';
      if (flow.category_id && flow.category_name) {
        if (!catMap[catKey]) catMap[catKey] = [];
        catMap[catKey].push(flow);
      } else {
        uncategorized.push(flow);
      }
    });

    // Sort by category sort order
    const sortedCatIds = Object.keys(catMap).sort((a, b) => {
      const fa = catMap[a][0];
      const fb = catMap[b][0];
      return (fa.category_sort_order || 0) - (fb.category_sort_order || 0);
    });

    sortedCatIds.forEach(catId => {
      const firstFlow = catMap[catId][0];
      groups.push({
        key: catId,
        name: firstFlow.category_name || '',
        color: firstFlow.category_color || null,
        flows: catMap[catId]
      });
    });

    if (uncategorized.length > 0) {
      groups.push({
        key: 'uncategorized',
        name: 'Sem categoria',
        color: null,
        flows: uncategorized
      });
    }

    return groups;
  }, [filteredFlows]);

  const toggleCategory = (key: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
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

        {/* Search */}
        {flows.length > 3 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar fluxo..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        )}

        {loadingFlows ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : filteredFlows.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <GitBranch className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>{searchQuery ? 'Nenhum fluxo encontrado' : 'Nenhum fluxo disponível para esta conexão'}</p>
            {!searchQuery && (
              <p className="text-sm mt-1">
                Configure fluxos em Atendimento → Fluxos
              </p>
            )}
          </div>
        ) : (
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-3">
              {groupedFlows.map((group) => (
                <Collapsible
                  key={group.key}
                  open={expandedCategories.has(group.key)}
                  onOpenChange={() => toggleCategory(group.key)}
                >
                  <CollapsibleTrigger className="flex items-center gap-2 w-full py-1.5 px-2 rounded hover:bg-muted transition-colors">
                    {group.color && (
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: group.color }} />
                    )}
                    {!group.color && <FolderOpen className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
                    <span className="text-sm font-semibold flex-1 text-left">{group.name}</span>
                    <Badge variant="secondary" className="text-xs">{group.flows.length}</Badge>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expandedCategories.has(group.key) ? 'rotate-180' : ''}`} />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="space-y-2 mt-2 ml-1">
                      {group.flows.map((flow) => (
                        <Card
                          key={flow.id}
                          className="cursor-pointer hover:border-primary transition-colors"
                          onClick={() => handleStartFlow(flow)}
                        >
                          <CardContent className="p-3">
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <h4 className="font-medium text-sm">{flow.name}</h4>
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
                                  <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                                    {flow.description}
                                  </p>
                                )}
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={starting === flow.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStartFlow(flow);
                                }}
                              >
                                {starting === flow.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Play className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
