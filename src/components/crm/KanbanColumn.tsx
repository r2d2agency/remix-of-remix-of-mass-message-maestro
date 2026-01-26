import { useDroppable } from "@dnd-kit/core";
import { DealCard } from "./DealCard";
import { CRMDeal, CRMStage } from "@/hooks/use-crm";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

interface KanbanColumnProps {
  stage: CRMStage;
  deals: CRMDeal[];
  totalValue: number;
  onDealClick: (deal: CRMDeal) => void;
}

export function KanbanColumn({ stage, deals, totalValue, onDealClick }: KanbanColumnProps) {
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
        "flex flex-col w-[300px] min-w-[300px] bg-muted/50 rounded-lg border",
        isOver && "ring-2 ring-primary bg-primary/5"
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
          {deals.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              Nenhuma negociação
            </div>
          ) : (
            deals.map((deal) => (
              <DealCard
                key={deal.id}
                deal={deal}
                onClick={() => onDealClick(deal)}
              />
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
