import { useState, useEffect, useMemo } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  DndContext, DragOverlay, closestCorners, DragStartEvent, DragEndEvent, DragOverEvent,
  PointerSensor, useSensor, useSensors, MeasuringStrategy 
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDroppable } from "@dnd-kit/core";
import {
  useTaskBoards, useTaskBoardMutations, useTaskBoardColumns, useTaskCards,
  useTaskCardMutations, TaskBoard, TaskBoardColumn, TaskCard
} from "@/hooks/use-task-boards";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganizations } from "@/hooks/use-organizations";
import { CreateBoardDialog } from "@/components/tasks/CreateBoardDialog";
import { CreateCardDialog } from "@/components/tasks/CreateCardDialog";
import { TaskCardDetailDialog } from "@/components/tasks/TaskCardDetailDialog";
import {
  Plus, Kanban, Globe, User, MoreHorizontal, Trash2, Edit2, Loader2,
  AlertTriangle, ArrowUp, ArrowDown, Minus, Calendar as CalendarIcon, CheckSquare
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { format, parseISO, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// Task card mini component for the kanban
function TaskKanbanCard({ card, onClick }: { card: TaskCard; onClick: () => void }) {
  const isOverdue = card.due_date && isPast(parseISO(card.due_date)) && card.status !== 'completed';
  const priorityIcons: Record<string, any> = {
    urgent: <AlertTriangle className="h-3 w-3 text-red-500" />,
    high: <ArrowUp className="h-3 w-3 text-orange-500" />,
    medium: <Minus className="h-3 w-3 text-yellow-500" />,
    low: <ArrowDown className="h-3 w-3 text-muted-foreground" />,
  };

  return (
    <div
      className={cn(
        "bg-card border rounded-lg p-3 cursor-pointer hover:shadow-md transition-shadow space-y-2",
        card.status === 'completed' && "opacity-60"
      )}
      onClick={onClick}
    >
      {card.cover_color && (
        <div className="h-1.5 -mt-1 -mx-1 rounded-t-lg" style={{ backgroundColor: card.cover_color }} />
      )}
      <div className="flex items-start gap-2">
        {card.status === 'completed' && <CheckSquare className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />}
        <p className={cn("text-sm font-medium flex-1 break-words", card.status === 'completed' && "line-through text-muted-foreground")}>
          {card.title}
        </p>
        {priorityIcons[card.priority]}
      </div>
      <div className="flex flex-wrap gap-1">
        {card.tags?.slice(0, 3).map((tag, i) => (
          <Badge key={i} variant="secondary" className="text-[10px] px-1.5 py-0">{tag}</Badge>
        ))}
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          {card.due_date && (
            <span className={cn("flex items-center gap-0.5", isOverdue && "text-red-500 font-medium")}>
              <CalendarIcon className="h-3 w-3" />
              {format(parseISO(card.due_date), "dd/MM", { locale: ptBR })}
            </span>
          )}
        </div>
        {card.assigned_to_name && (
          <span className="truncate max-w-[80px]">{card.assigned_to_name}</span>
        )}
      </div>
    </div>
  );
}

// Sortable card wrapper
function SortableTaskCard({ card, onClick, activeId }: { card: TaskCard; onClick: () => void; activeId: string | null }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    transition: { duration: 200, easing: 'cubic-bezier(0.25, 1, 0.5, 1)' },
  });
  const style = { transform: CSS.Transform.toString(transform), transition: isDragging ? undefined : transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn("touch-manipulation", isDragging && "opacity-30 scale-95")}
    >
      <TaskKanbanCard card={card} onClick={() => !isDragging && onClick()} />
    </div>
  );
}

// Column component
function TaskKanbanColumn({
  column, cards, onCardClick, onAddCard, activeId, overId
}: {
  column: TaskBoardColumn;
  cards: TaskCard[];
  onCardClick: (card: TaskCard) => void;
  onAddCard: (columnId: string) => void;
  activeId: string | null;
  overId: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const isDraggingOver = isOver || cards.some(c => c.id === overId);
  const hasActiveItem = cards.some(c => c.id === activeId);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col w-[320px] min-w-[320px] max-w-[320px] bg-muted/50 rounded-lg border overflow-hidden",
        "transition-all duration-300",
        isDraggingOver && !hasActiveItem && "ring-2 ring-primary bg-primary/5 shadow-lg"
      )}
    >
      <div
        className="p-3 border-b flex items-center justify-between"
        style={{ borderTopColor: column.color, borderTopWidth: 4, borderTopLeftRadius: 8, borderTopRightRadius: 8 }}
      >
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm">{column.name}</h3>
          <Badge variant="secondary" className="text-xs">{cards.length}</Badge>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onAddCard(column.id)}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      <ScrollArea className="flex-1 max-h-[calc(100vh-280px)]">
        <div className="p-2 space-y-2">
          {isDraggingOver && cards.length === 0 && !hasActiveItem && (
            <div className="h-20 rounded-lg border-2 border-dashed border-primary/50 bg-primary/10 flex items-center justify-center animate-pulse">
              <span className="text-sm text-primary">Soltar aqui</span>
            </div>
          )}
          {cards.length === 0 && !isDraggingOver ? (
            <div className="py-8 text-center text-muted-foreground text-sm">Nenhuma tarefa</div>
          ) : (
            cards.map(card => (
              <SortableTaskCard key={card.id} card={card} onClick={() => onCardClick(card)} activeId={activeId} />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export default function CRMTarefas() {
  const { user } = useAuth();
  const { getMembers } = useOrganizations();
  const { data: boards, isLoading: loadingBoards } = useTaskBoards();
  const { createBoard, ensureDefault, deleteBoard, updateBoard } = useTaskBoardMutations();
  const { createCard, moveCard } = useTaskCardMutations();

  const isAdmin = user?.role && ['owner', 'admin', 'manager'].includes(user.role);
  const isSuperadmin = (user as any)?.is_superadmin === true;
  const canCreateGlobal = isAdmin || isSuperadmin;

  const [selectedBoardId, setSelectedBoardId] = useState<string>("");
  const [createBoardOpen, setCreateBoardOpen] = useState(false);
  const [createCardOpen, setCreateCardOpen] = useState(false);
  const [createCardColumnId, setCreateCardColumnId] = useState<string>("");
  const [selectedCard, setSelectedCard] = useState<TaskCard | null>(null);
  const [cardDetailOpen, setCardDetailOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [orgMembers, setOrgMembers] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'all' | 'global' | 'personal'>('all');
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null);
  const [editBoardName, setEditBoardName] = useState("");

  // Ensure default board on mount
  useEffect(() => {
    ensureDefault.mutate();
  }, []);

  // Load org members
  useEffect(() => {
    if (user?.organization_id) {
      getMembers(user.organization_id).then(setOrgMembers);
    }
  }, [user?.organization_id]);

  // Auto-select first board
  useEffect(() => {
    if (boards?.length && !selectedBoardId) {
      const defaultBoard = boards.find(b => b.is_default) || boards[0];
      setSelectedBoardId(defaultBoard.id);
    }
  }, [boards, selectedBoardId]);

  const selectedBoard = boards?.find(b => b.id === selectedBoardId);
  const { data: columns } = useTaskBoardColumns(selectedBoardId);
  const { data: cards } = useTaskCards(selectedBoardId);

  const cardsByColumn = useMemo(() => {
    const map: Record<string, TaskCard[]> = {};
    columns?.forEach(col => { map[col.id] = []; });
    cards?.forEach(card => {
      if (map[card.column_id]) {
        map[card.column_id].push(card);
      }
    });
    Object.values(map).forEach(arr => arr.sort((a, b) => a.position - b.position));
    return map;
  }, [columns, cards]);

  const filteredBoards = useMemo(() => {
    if (!boards) return [];
    if (viewMode === 'global') return boards.filter(b => b.type === 'global');
    if (viewMode === 'personal') return boards.filter(b => b.type === 'personal');
    return boards;
  }, [boards, viewMode]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const findColumnForCard = (cardId: string): string | null => {
    for (const [colId, colCards] of Object.entries(cardsByColumn)) {
      if (colCards.some(c => c.id === cardId)) return colId;
    }
    return null;
  };

  const activeCard = useMemo(() => {
    if (!activeId) return null;
    return cards?.find(c => c.id === activeId) || null;
  }, [activeId, cards]);

  function handleDragStart(e: DragStartEvent) { setActiveId(e.active.id as string); }
  function handleDragOver(e: DragOverEvent) { setOverId(e.over?.id as string || null); }
  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveId(null);
    setOverId(null);
    if (!over || active.id === over.id) return;

    const cardId = active.id as string;
    const targetId = over.id as string;
    const currentColId = findColumnForCard(cardId);
    if (!currentColId) return;

    const isColumn = columns?.some(c => c.id === targetId);
    if (isColumn) {
      if (currentColId !== targetId) {
        moveCard.mutate({ id: cardId, column_id: targetId });
      }
    } else {
      const targetColId = findColumnForCard(targetId);
      if (targetColId) {
        moveCard.mutate({ id: cardId, column_id: targetColId, over_card_id: targetId });
      }
    }
  }
  function handleDragCancel() { setActiveId(null); setOverId(null); }

  const handleAddCard = (columnId: string) => {
    if (!selectedBoardId) return;
    setCreateCardColumnId(columnId);
    setCreateCardOpen(true);
  };

  const handleCreateCard = (data: any) => {
    if (!selectedBoardId || !createCardColumnId) return;
    createCard.mutate({
      ...data,
      board_id: selectedBoardId,
      column_id: createCardColumnId,
    });
  };

  const handleCreateBoard = (data: { name: string; type: 'global' | 'personal'; color: string }) => {
    createBoard.mutate(data);
  };

  const handleDeleteBoard = (boardId: string) => {
    if (confirm("Excluir este quadro e todas as tarefas dele?")) {
      deleteBoard.mutate(boardId);
      if (selectedBoardId === boardId) setSelectedBoardId("");
    }
  };

  const handleRenameBoard = (boardId: string) => {
    const board = boards?.find(b => b.id === boardId);
    if (board) {
      setEditingBoardId(boardId);
      setEditBoardName(board.name);
    }
  };

  const handleSaveRename = () => {
    if (editingBoardId && editBoardName.trim()) {
      updateBoard.mutate({ id: editingBoardId, name: editBoardName.trim() });
      toast.success("Quadro renomeado!");
    }
    setEditingBoardId(null);
  };

  if (loadingBoards) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Kanban className="h-6 w-6 text-primary" />
              <div>
                <h1 className="text-xl font-bold">Tarefas</h1>
                <p className="text-sm text-muted-foreground">Gerencie seus quadros e tarefas</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)}>
                <TabsList className="h-8">
                  <TabsTrigger value="all" className="text-xs px-3">Todos</TabsTrigger>
                  <TabsTrigger value="global" className="text-xs px-3">
                    <Globe className="h-3 w-3 mr-1" /> Globais
                  </TabsTrigger>
                  <TabsTrigger value="personal" className="text-xs px-3">
                    <User className="h-3 w-3 mr-1" /> Pessoais
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <Button size="sm" onClick={() => setCreateBoardOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> Novo Quadro
              </Button>
            </div>
          </div>

          {/* Board selector */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {filteredBoards.map(board => (
              <div key={board.id} className="flex items-center gap-1">
                {editingBoardId === board.id ? (
                  <Input
                    value={editBoardName}
                    onChange={e => setEditBoardName(e.target.value)}
                    onBlur={handleSaveRename}
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveRename(); if (e.key === 'Escape') setEditingBoardId(null); }}
                    className="h-8 w-40 text-sm"
                    autoFocus
                  />
                ) : (
                  <Button
                    variant={selectedBoardId === board.id ? "default" : "outline"}
                    size="sm"
                    className="shrink-0 gap-2"
                    onClick={() => setSelectedBoardId(board.id)}
                  >
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: board.color }} />
                    {board.name}
                    {board.type === 'global' && <Globe className="h-3 w-3 text-muted-foreground" />}
                    <Badge variant="secondary" className="text-[10px] ml-1">{board.card_count}</Badge>
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
                      <MoreHorizontal className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => handleRenameBoard(board.id)}>
                      <Edit2 className="h-4 w-4 mr-2" /> Renomear
                    </DropdownMenuItem>
                    {!board.is_default && (
                      <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteBoard(board.id)}>
                        <Trash2 className="h-4 w-4 mr-2" /> Excluir
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        </div>

        {/* Kanban board */}
        {selectedBoard && columns ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
            measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
          >
            <ScrollArea className="flex-1 w-full">
              <div className="flex gap-4 p-4 min-w-max">
                {columns.map(col => (
                  <SortableContext key={col.id} items={(cardsByColumn[col.id] || []).map(c => c.id)} strategy={verticalListSortingStrategy}>
                    <TaskKanbanColumn
                      column={col}
                      cards={cardsByColumn[col.id] || []}
                      onCardClick={(card) => { setSelectedCard(card); setCardDetailOpen(true); }}
                      onAddCard={handleAddCard}
                      activeId={activeId}
                      overId={overId}
                    />
                  </SortableContext>
                ))}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>

            <DragOverlay
              dropAnimation={{ duration: 250, easing: 'cubic-bezier(0.25, 1, 0.5, 1)' }}
              style={{ cursor: 'grabbing' }}
            >
              {activeCard ? (
                <div className="rotate-2 scale-105 shadow-2xl w-[300px]">
                  <TaskKanbanCard card={activeCard} onClick={() => {}} />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <p>Selecione ou crie um quadro para começar</p>
          </div>
        )}
      </div>

      {/* Dialogs */}
      <CreateBoardDialog
        open={createBoardOpen}
        onOpenChange={setCreateBoardOpen}
        onSubmit={handleCreateBoard}
        isAdmin={!!canCreateGlobal}
      />
      <CreateCardDialog
        open={createCardOpen}
        onOpenChange={setCreateCardOpen}
        onSubmit={handleCreateCard}
        boardType={selectedBoard?.type || 'personal'}
        orgMembers={orgMembers}
      />
      <TaskCardDetailDialog
        card={selectedCard}
        open={cardDetailOpen}
        onOpenChange={setCardDetailOpen}
        boardType={selectedBoard?.type || 'personal'}
      />
    </MainLayout>
  );
}
