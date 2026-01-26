import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CRMDeal } from "@/hooks/use-crm";
import { cn } from "@/lib/utils";
import { Building2, User, Clock, AlertTriangle, CheckSquare } from "lucide-react";
import { differenceInHours, parseISO } from "date-fns";

interface DealCardProps {
  deal: CRMDeal;
  isDragging?: boolean;
  onClick: () => void;
}

export function DealCard({ deal, isDragging, onClick }: DealCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: deal.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Calculate inactivity
  const hoursInactive = differenceInHours(new Date(), parseISO(deal.last_activity_at));
  const isInactive = deal.inactivity_hours && hoursInactive >= deal.inactivity_hours;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 0,
    }).format(value);
  };

  const primaryContact = deal.contacts?.find((c) => c.is_primary);

  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={cn(
        "p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow",
        isDragging && "opacity-50 shadow-lg rotate-2",
        isInactive && "border-l-4"
      )}
      style={{
        ...style,
        borderLeftColor: isInactive ? deal.inactivity_color : undefined,
      }}
    >
      {/* Title & Value */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="font-medium text-sm line-clamp-2">{deal.title}</h4>
        <Badge variant="outline" className="shrink-0 text-xs">
          {formatCurrency(deal.value)}
        </Badge>
      </div>

      {/* Company */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
        <Building2 className="h-3 w-3" />
        <span className="truncate">{deal.company_name}</span>
      </div>

      {/* Contact */}
      {primaryContact && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
          <User className="h-3 w-3" />
          <span className="truncate">{primaryContact.name}</span>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t mt-2">
        <div className="flex items-center gap-2">
          {/* Owner */}
          {deal.owner_name && (
            <div className="flex items-center gap-1">
              <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-medium">
                {deal.owner_name.charAt(0).toUpperCase()}
              </div>
            </div>
          )}

          {/* Probability */}
          <Badge 
            variant="secondary" 
            className={cn(
              "text-[10px] px-1.5",
              deal.probability >= 70 && "bg-green-100 text-green-700",
              deal.probability >= 40 && deal.probability < 70 && "bg-yellow-100 text-yellow-700",
              deal.probability < 40 && "bg-red-100 text-red-700"
            )}
          >
            {deal.probability}%
          </Badge>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {/* Pending tasks */}
          {deal.pending_tasks > 0 && (
            <div className="flex items-center gap-0.5">
              <CheckSquare className="h-3 w-3" />
              <span>{deal.pending_tasks}</span>
            </div>
          )}

          {/* Inactivity warning */}
          {isInactive && (
            <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
          )}

          {/* Time indicator */}
          <div className="flex items-center gap-0.5">
            <Clock className="h-3 w-3" />
            <span>{hoursInactive}h</span>
          </div>
        </div>
      </div>
    </Card>
  );
}
