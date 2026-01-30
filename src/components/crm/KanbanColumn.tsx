import { useDroppable } from "@dnd-kit/core";
import { DealCard } from "./DealCard";
import { CRMDeal, CRMStage } from "@/hooks/use-crm";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Trophy, XCircle, Pause, Play } from "lucide-react";

interface KanbanColumnProps {
  stage: CRMStage;
  deals: CRMDeal[];
  totalValue: number;
  onDealClick: (deal: CRMDeal) => void;
  onStatusChange?: (dealId: string, status: 'won' | 'lost' | 'paused' | 'open') => void;
  newWinDealId?: string | null;
}

export function KanbanColumn({ stage, deals, totalValue, onDealClick, onStatusChange, newWinDealId }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: stage.id!,
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col w-[300px] min-w-[300px] bg-muted/50 rounded-lg border transition-all duration-300",
        isOver && "ring-2 ring-primary bg-primary/5 shadow-lg scale-[1.01]"
      )}
    >
      {/* Header */}
      <div 
        className="p-3 border-b flex items-center justify-between"
        style={{ borderTopColor: stage.color, borderTopWidth: 4, borderTopLeftRadius: 8, borderTopRightRadius: 8 }}
      >
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm">{stage.name}</h3>
          <Badge variant="secondary" className="text-xs">
            {deals.length}
          </Badge>
        </div>
        <span className="text-xs text-muted-foreground">
          {formatCurrency(totalValue)}
        </span>
      </div>

      {/* Cards */}
      <ScrollArea className="flex-1 max-h-[calc(100vh-280px)]">
        <div className="p-2 space-y-2">
          {/* Drop indicator when hovering over empty area */}
          {isOver && deals.length === 0 && (
            <div className="h-24 rounded-lg border-2 border-dashed border-primary/50 bg-primary/5 flex items-center justify-center animate-pulse">
              <span className="text-sm text-primary/70">Soltar aqui</span>
            </div>
          )}
          {deals.length === 0 && !isOver ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              Nenhuma negociação
            </div>
          ) : (
            deals.map((deal) => (
              <div 
                key={deal.id} 
                className="relative group transition-all duration-200"
              >
                <DealCard
                  deal={deal}
                  onClick={() => onDealClick(deal)}
                  isNewWin={newWinDealId === deal.id}
                />
                {/* Quick actions menu */}
                {onStatusChange && (
                  <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button 
                          variant="secondary" 
                          size="icon" 
                          className="h-6 w-6"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        {deal.status !== 'won' && (
                          <DropdownMenuItem onClick={() => onStatusChange(deal.id, 'won')}>
                            <Trophy className="h-4 w-4 mr-2 text-green-500" />
                            Marcar como Ganho
                          </DropdownMenuItem>
                        )}
                        {deal.status !== 'lost' && (
                          <DropdownMenuItem onClick={() => onStatusChange(deal.id, 'lost')}>
                            <XCircle className="h-4 w-4 mr-2 text-red-500" />
                            Marcar como Perdido
                          </DropdownMenuItem>
                        )}
                        {deal.status !== 'paused' && deal.status !== 'won' && deal.status !== 'lost' && (
                          <DropdownMenuItem onClick={() => onStatusChange(deal.id, 'paused')}>
                            <Pause className="h-4 w-4 mr-2 text-gray-500" />
                            Pausar Negociação
                          </DropdownMenuItem>
                        )}
                        {(deal.status === 'paused' || deal.status === 'won' || deal.status === 'lost') && (
                          <DropdownMenuItem onClick={() => onStatusChange(deal.id, 'open')}>
                            <Play className="h-4 w-4 mr-2 text-blue-500" />
                            Reabrir Negociação
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Footer */}
      {stage.is_final && (
        <div className="p-2 border-t bg-muted/30 text-center">
          <span className="text-xs text-muted-foreground">
            {stage.name === "Ganho" ? "🎉" : "❌"} Etapa final
          </span>
        </div>
      )}
    </div>
  );
}
