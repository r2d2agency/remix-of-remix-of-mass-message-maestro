import { useState, useMemo } from "react";
import { DndContext, DragOverlay, closestCorners, DragStartEvent, DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { KanbanColumn } from "./KanbanColumn";
import { DealCard } from "./DealCard";
import { CRMDeal, CRMStage, useCRMDealMutations } from "@/hooks/use-crm";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

interface KanbanBoardProps {
  stages: CRMStage[];
  dealsByStage: Record<string, CRMDeal[]>;
  onDealClick: (deal: CRMDeal) => void;
}

export function KanbanBoard({ stages, dealsByStage, onDealClick }: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const { moveDeal } = useCRMDealMutations();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const activeDeal = useMemo(() => {
    if (!activeId) return null;
    for (const deals of Object.values(dealsByStage)) {
      const deal = deals.find((d) => d.id === activeId);
      if (deal) return deal;
    }
    return null;
  }, [activeId, dealsByStage]);

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const dealId = active.id as string;
    const targetStageId = over.id as string;

    // Check if dropped on a stage column
    const isStageColumn = stages.some((s) => s.id === targetStageId);
    
    if (isStageColumn) {
      // Find current stage of the deal
      let currentStageId: string | null = null;
      for (const [stageId, deals] of Object.entries(dealsByStage)) {
        if (deals.some((d) => d.id === dealId)) {
          currentStageId = stageId;
          break;
        }
      }

      if (currentStageId !== targetStageId) {
        moveDeal.mutate({ id: dealId, stage_id: targetStageId });
      }
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <ScrollArea className="w-full">
        <div className="flex gap-4 p-4 min-w-max">
          {stages.map((stage) => {
            const deals = dealsByStage[stage.id!] || [];
            const stageValue = deals.reduce((sum, d) => sum + Number(d.value || 0), 0);

            return (
              <SortableContext
                key={stage.id}
                items={deals.map((d) => d.id)}
                strategy={verticalListSortingStrategy}
              >
                <KanbanColumn
                  stage={stage}
                  deals={deals}
                  totalValue={stageValue}
                  onDealClick={onDealClick}
                />
              </SortableContext>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      <DragOverlay>
        {activeDeal ? (
          <DealCard deal={activeDeal} isDragging onClick={() => {}} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
