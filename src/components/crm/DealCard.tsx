import { forwardRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CRMDeal } from "@/hooks/use-crm";
import { cn } from "@/lib/utils";
import { Building2, User, Clock, AlertTriangle, CheckSquare, Trophy, XCircle, Pause } from "lucide-react";
import { differenceInHours, parseISO } from "date-fns";

interface DealCardProps {
  deal: CRMDeal;
  isDragging?: boolean;
  onClick: () => void;
  isNewWin?: boolean;
}

export const DealCard = forwardRef<HTMLDivElement, DealCardProps>(
  function DealCard({ deal, isDragging: isDraggingProp, onClick, isNewWin }, ref) {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
      isOver,
    } = useSortable({ id: deal.id });

    // Smooth transform with better easing
    const style = {
      transform: CSS.Transform.toString(transform),
      transition: transition || 'transform 250ms cubic-bezier(0.25, 1, 0.5, 1)',
      zIndex: isDragging ? 50 : undefined,
    };

    // Calculate inactivity
    const hoursInactive = differenceInHours(new Date(), parseISO(deal.last_activity_at));
    const isInactive = deal.inactivity_hours && hoursInactive >= deal.inactivity_hours;
    
    // Convert pending_tasks to number (comes as string from API)
    const pendingTasksCount = Number(deal.pending_tasks) || 0;
    const hasPendingTasks = pendingTasksCount > 0;

    const formatCurrency = (value: number) => {
      return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
        minimumFractionDigits: 0,
      }).format(value);
    };

    const primaryContact = deal.contacts?.find((c) => c.is_primary);

    // Status-based styling
    const isWon = deal.status === 'won';
    const isLost = deal.status === 'lost';
    const isPaused = deal.status === 'paused';

    // Determine border/ring color based on status
    const getStatusStyles = () => {
      if (isWon) return "ring-2 ring-green-500 border-green-500 bg-green-50/50 dark:bg-green-950/20";
      if (isLost) return "ring-2 ring-red-500 border-red-500 bg-red-50/50 dark:bg-red-950/20";
      if (isPaused) return "ring-2 ring-gray-400 border-gray-400 bg-gray-100/50 dark:bg-gray-800/50 opacity-70";
      return "";
    };

    // Determine left border color priority: status > inactivity > tasks > none
    const getBorderColor = () => {
      if (isWon) return "#22c55e";
      if (isLost) return "#ef4444";
      if (isPaused) return "#9ca3af";
      if (isInactive) return deal.inactivity_color || "#ef4444";
      if (hasPendingTasks) return "#f59e0b";
      return undefined;
    };

    const borderColor = getBorderColor();

    // Merge styles with smooth transitions
    const cardStyle = {
      ...style,
      borderLeftColor: borderColor,
    };

    // Combine refs
    const setRefs = (node: HTMLDivElement) => {
      setNodeRef(node);
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    };

    // Status badge
    const getStatusBadge = () => {
      if (isWon) {
        return (
          <Badge className="bg-green-500 text-white text-[10px] px-1.5 flex items-center gap-0.5">
            <Trophy className="h-3 w-3" />
            Ganho
          </Badge>
        );
      }
      if (isLost) {
        return (
          <Badge className="bg-red-500 text-white text-[10px] px-1.5 flex items-center gap-0.5">
            <XCircle className="h-3 w-3" />
            Perdido
          </Badge>
        );
      }
      if (isPaused) {
        return (
          <Badge className="bg-gray-500 text-white text-[10px] px-1.5 flex items-center gap-0.5">
            <Pause className="h-3 w-3" />
            Pausado
          </Badge>
        );
      }
      return null;
    };

    // Combined dragging state (from prop or from useSortable)
    const isCurrentlyDragging = isDraggingProp || isDragging;

    return (
      <Card
        ref={setRefs}
        style={cardStyle}
        {...attributes}
        {...listeners}
        onClick={onClick}
        className={cn(
          "p-3 cursor-grab active:cursor-grabbing transition-all duration-200",
          "hover:shadow-md hover:-translate-y-0.5",
          isCurrentlyDragging && "opacity-80 shadow-xl scale-105 rotate-1 ring-2 ring-primary/50",
          isOver && "ring-2 ring-primary/30 bg-primary/5",
          borderColor && "border-l-4",
          getStatusStyles(),
          isNewWin && "animate-scale-in"
        )}
      >
        {/* Status Badge */}
        {getStatusBadge() && (
          <div className="mb-2">
            {getStatusBadge()}
          </div>
        )}

        {/* Title & Value */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <h4 className={cn(
            "font-medium text-sm line-clamp-2",
            isPaused && "text-muted-foreground"
          )}>
            {deal.title}
          </h4>
          <Badge variant="outline" className={cn(
            "shrink-0 text-xs",
            isWon && "border-green-500 text-green-600",
            isLost && "border-red-500 text-red-600 line-through",
            isPaused && "border-gray-400 text-gray-500"
          )}>
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
                <div className={cn(
                  "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium",
                  isWon ? "bg-green-200 text-green-700" :
                  isLost ? "bg-red-200 text-red-700" :
                  isPaused ? "bg-gray-200 text-gray-600" :
                  "bg-primary/20"
                )}>
                  {deal.owner_name.charAt(0).toUpperCase()}
                </div>
              </div>
            )}

            {/* Probability - hide for closed deals */}
            {!isWon && !isLost && (
              <Badge 
                variant="secondary" 
                className={cn(
                  "text-[10px] px-1.5",
                  deal.probability >= 70 && "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
                  deal.probability >= 40 && deal.probability < 70 && "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
                  deal.probability < 40 && "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                )}
              >
                {deal.probability}%
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {/* Pending tasks - highlighted */}
            {hasPendingTasks && !isWon && !isLost && (
              <Badge 
                variant="secondary" 
                className="text-[10px] px-1.5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 flex items-center gap-0.5"
              >
                <CheckSquare className="h-3 w-3" />
                <span>{pendingTasksCount}</span>
              </Badge>
            )}

            {/* Inactivity warning - hide for closed deals */}
            {isInactive && !isWon && !isLost && !isPaused && (
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
);
