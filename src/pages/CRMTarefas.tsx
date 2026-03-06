import { useState, useEffect, useMemo } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
  DndContext, DragOverlay, closestCenter, DragStartEvent, DragEndEvent, DragOverEvent,
  PointerSensor, TouchSensor, useSensor, useSensors, MeasuringStrategy,
  rectIntersection,
  UniqueIdentifier,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, horizontalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDroppable } from "@dnd-kit/core";
import {
  useTaskBoards, useTaskBoardMutations, useTaskBoardColumns, useTaskCards,
  useTaskCardMutations, useTaskColumnMutations, TaskBoard, TaskBoardColumn, TaskCard
} from "@/hooks/use-task-boards";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganizations } from "@/hooks/use-organizations";
import { CreateBoardDialog } from "@/components/tasks/CreateBoardDialog";
import { CreateCardDialog } from "@/components/tasks/CreateCardDialog";
import { TaskCardDetailDialog } from "@/components/tasks/TaskCardDetailDialog";
import { ChecklistTemplateManager } from "@/components/tasks/ChecklistTemplateManager";
import {
  Plus, Kanban, Globe, User, MoreHorizontal, Trash2, Edit2, Loader2,
  AlertTriangle, ArrowUp, ArrowDown, Minus, Calendar as CalendarIcon, CheckSquare,
  ListChecks, Filter, X, GripVertical, Settings2, Copy, ArrowRightLeft,
  ChevronLeft, ChevronRight
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { format, parseISO, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { api } from "@/lib/api";

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
        "bg-card border rounded-lg p-3 cursor-pointer hover:shadow-md transition-shadow space-y-2 min-w-0",
        card.status === 'completed' && "opacity-60"
      )}
      onClick={onClick}
    >
      {card.cover_color && (
        <div className="h-1.5 -mt-1 -mx-1 rounded-t-lg" style={{ backgroundColor: card.cover_color }} />
      )}
      <div className="flex items-start gap-2 min-w-0">
        {card.status === 'completed' && <CheckSquare className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />}
        <p className={cn("text-sm font-medium flex-1 break-words min-w-0", card.status === 'completed' && "line-through text-muted-foreground")}>
          {card.title}
        </p>
        {priorityIcons[card.priority]}
      </div>
      {/* CRM links */}
      {(card.deal_title || card.company_name || card.contact_name) && (
        <div className="flex flex-wrap gap-1">
          {card.deal_title && <Badge variant="outline" className="text-[9px] px-1 py-0 max-w-full truncate">🤝 {card.deal_title}</Badge>}
          {card.company_name && <Badge variant="outline" className="text-[9px] px-1 py-0 max-w-full truncate">🏢 {card.company_name}</Badge>}
          {card.contact_name && <Badge variant="outline" className="text-[9px] px-1 py-0 max-w-full truncate">👤 {card.contact_name}</Badge>}
        </div>
      )}
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
          <span className="truncate max-w-[100px]">{card.assigned_to_name}</span>
        )}
      </div>
    </div>
  );
}

// Sortable card wrapper
function SortableTaskCard({ card, onClick, activeId }: { card: TaskCard; onClick: () => void; activeId: string | null }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: 'card', card, columnId: card.column_id },
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

// Droppable Column component
function TaskKanbanColumn({
  column, cards, onCardClick, onAddCard, activeId, overId, onEditColumn, onDeleteColumn, canManageColumns,
  onMoveLeft, onMoveRight, isFirst, isLast
}: {
  column: TaskBoardColumn;
  cards: TaskCard[];
  onCardClick: (card: TaskCard) => void;
  onAddCard: (columnId: string) => void;
  activeId: string | null;
  overId: string | null;
  onEditColumn?: (col: TaskBoardColumn) => void;
  onDeleteColumn?: (colId: string) => void;
  canManageColumns?: boolean;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
  isFirst?: boolean;
  isLast?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ 
    id: `column-${column.id}`,
    data: { type: 'column', columnId: column.id },
  });
  const hasActiveItem = cards.some(c => c.id === activeId);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col w-[320px] min-w-[320px] max-w-[320px] bg-muted/50 rounded-lg border overflow-hidden",
        "transition-all duration-300",
        isOver && !hasActiveItem && "ring-2 ring-primary bg-primary/5 shadow-lg"
      )}
    >
      <div
        className="p-3 border-b flex items-center justify-between"
        style={{ borderTopColor: column.color, borderTopWidth: 4, borderTopLeftRadius: 8, borderTopRightRadius: 8 }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="font-semibold text-sm truncate">{column.name}</h3>
          <Badge variant="secondary" className="text-xs shrink-0">{cards.length}</Badge>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {canManageColumns && (
            <>
              <Button variant="ghost" size="icon" className="h-6 w-6" disabled={isFirst} onClick={onMoveLeft} title="Mover para esquerda">
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" disabled={isLast} onClick={onMoveRight} title="Mover para direita">
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6">
                    <Settings2 className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => onEditColumn?.(column)}>
                    <Edit2 className="h-4 w-4 mr-2" /> Editar coluna
                  </DropdownMenuItem>
                  {!column.is_final && (
                    <DropdownMenuItem className="text-destructive" onClick={() => onDeleteColumn?.(column.id)}>
                      <Trash2 className="h-4 w-4 mr-2" /> Excluir coluna
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onAddCard(column.id)}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 max-h-[calc(100vh-280px)]">
        <div className="p-2 space-y-2 min-h-[60px]">
          {isOver && cards.length === 0 && !hasActiveItem && (
            <div className="h-20 rounded-lg border-2 border-dashed border-primary/50 bg-primary/10 flex items-center justify-center animate-pulse">
              <span className="text-sm text-primary">Soltar aqui</span>
            </div>
          )}
          {cards.length === 0 && !isOver ? (
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
  const { createColumn, updateColumn, deleteColumn, reorderColumns } = useTaskColumnMutations();

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
  const [mainTab, setMainTab] = useState<'kanban' | 'templates'>('kanban');
  const [filterUser, setFilterUser] = useState<string>("all");
  const [filterDateFrom, setFilterDateFrom] = useState<Date | undefined>();
  const [filterDateTo, setFilterDateTo] = useState<Date | undefined>();
  const [showFilters, setShowFilters] = useState(false);

  // Column management
  const [editColumnDialog, setEditColumnDialog] = useState(false);
  const [editingColumn, setEditingColumn] = useState<TaskBoardColumn | null>(null);
  const [colName, setColName] = useState("");
  const [colColor, setColColor] = useState("#94a3b8");
  const [colIsFinal, setColIsFinal] = useState(false);
  const [addColumnDialog, setAddColumnDialog] = useState(false);
  const [colPosition, setColPosition] = useState<string>("");

  // Duplicate/migrate card
  const [migrateCardDialog, setMigrateCardDialog] = useState(false);
  const [migrateCard, setMigrateCard] = useState<TaskCard | null>(null);
  const [migrateTargetBoard, setMigrateTargetBoard] = useState("");

  const canFilter = isAdmin || isSuperadmin;

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
  const { data: cards } = useTaskCards(selectedBoardId, {
    filter_user: canFilter ? filterUser : undefined,
    date_from: filterDateFrom?.toISOString(),
    date_to: filterDateTo?.toISOString(),
  });

  const canManageColumns = !!(
    selectedBoard && (
      (selectedBoard.type === 'global' && canCreateGlobal) ||
      (selectedBoard.type === 'personal' && selectedBoard.created_by === user?.id)
    )
  );

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
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
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

    const activeIdStr = active.id as string;
    const overIdStr = over.id as string;

    // Column reorder
    if (activeIdStr.startsWith('col-sort-') && overIdStr.startsWith('col-sort-')) {
      const activeColId = activeIdStr.replace('col-sort-', '');
      const overColId = overIdStr.replace('col-sort-', '');
      if (columns) {
        const oldIndex = columns.findIndex(c => c.id === activeColId);
        const newIndex = columns.findIndex(c => c.id === overColId);
        if (oldIndex !== -1 && newIndex !== -1) {
          const newOrder = arrayMove(columns, oldIndex, newIndex);
          reorderColumns.mutate(newOrder.map((c, i) => ({ id: c.id, position: i })));
        }
      }
      return;
    }

    // Card drag
    const cardId = activeIdStr;
    const currentColId = findColumnForCard(cardId);
    if (!currentColId) return;

    if (overIdStr.startsWith('column-')) {
      const targetColId = overIdStr.replace('column-', '');
      if (currentColId !== targetColId) {
        moveCard.mutate({ id: cardId, column_id: targetColId });
      }
    } else {
      const targetColId = findColumnForCard(overIdStr);
      if (targetColId) {
        moveCard.mutate({ id: cardId, column_id: targetColId, over_card_id: overIdStr });
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

  // Column management
  const handleEditColumn = (col: TaskBoardColumn) => {
    setEditingColumn(col);
    setColName(col.name);
    setColColor(col.color);
    setColIsFinal(col.is_final);
    setEditColumnDialog(true);
  };

  const handleSaveColumn = () => {
    if (!editingColumn || !colName.trim()) return;
    updateColumn.mutate({ id: editingColumn.id, name: colName.trim(), color: colColor, is_final: colIsFinal });
    setEditColumnDialog(false);
    toast.success("Coluna atualizada!");
  };

  const handleDeleteColumn = (colId: string) => {
    const col = columns?.find(c => c.id === colId);
    const cardsInCol = cardsByColumn[colId]?.length || 0;
    if (cardsInCol > 0) {
      toast.error("Mova ou exclua os cards desta coluna antes de excluí-la");
      return;
    }
    if (confirm(`Excluir coluna "${col?.name}"?`)) {
      deleteColumn.mutate(colId);
      toast.success("Coluna excluída!");
    }
  };

  const handleAddColumn = () => {
    if (!selectedBoardId || !colName.trim()) return;
    const desiredPos = colPosition ? parseInt(colPosition) - 1 : undefined;
    
    // If user specified a position, we need to reorder after creating
    createColumn.mutate(
      { boardId: selectedBoardId, name: colName.trim(), color: colColor, is_final: colIsFinal },
      {
        onSuccess: (newCol: any) => {
          if (desiredPos !== undefined && columns && desiredPos >= 0 && desiredPos < columns.length) {
            // Reorder: insert at desired position, push others forward
            const currentCols = [...columns];
            const newColEntry = { id: newCol.id, position: 0 };
            // Build new order with the new column inserted at desiredPos
            const withoutNew = currentCols.filter(c => c.id !== newCol.id);
            withoutNew.splice(desiredPos, 0, newColEntry as any);
            const reorderData = withoutNew.map((c, i) => ({ id: c.id, position: i }));
            reorderColumns.mutate(reorderData);
          }
        }
      }
    );
    setAddColumnDialog(false);
    setColName("");
    setColColor("#94a3b8");
    setColIsFinal(false);
    setColPosition("");
    toast.success("Coluna criada!");
  };

  const handleMoveColumn = (columnId: string, direction: 'left' | 'right') => {
    if (!columns) return;
    const idx = columns.findIndex(c => c.id === columnId);
    if (idx === -1) return;
    const newIdx = direction === 'left' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= columns.length) return;
    const newOrder = arrayMove(columns, idx, newIdx);
    reorderColumns.mutate(newOrder.map((c, i) => ({ id: c.id, position: i })));
    toast.success("Coluna reordenada!");
  };

  // Duplicate card
  const handleDuplicateCard = async (card: TaskCard) => {
    try {
      await api('/api/task-boards/cards', {
        method: 'POST',
        body: {
          board_id: card.board_id,
          column_id: card.column_id,
          title: `${card.title} (cópia)`,
          description: card.description,
          priority: card.priority,
          due_date: card.due_date,
          assigned_to: card.assigned_to,
          contact_id: card.contact_id,
          deal_id: card.deal_id,
          company_id: card.company_id,
          tags: card.tags,
          cover_color: card.cover_color,
        },
      });
      toast.success("Card duplicado!");
      // Invalidate queries
      createCard.reset();
      window.location.reload(); // Simple refresh to show duplicate
    } catch (err) {
      toast.error("Erro ao duplicar card");
    }
  };

  // Migrate card to another board
  const handleMigrateCard = async () => {
    if (!migrateCard || !migrateTargetBoard) return;
    try {
      // Get first column of target board
      const cols = await api<TaskBoardColumn[]>(`/api/task-boards/boards/${migrateTargetBoard}/columns`);
      if (!cols || cols.length === 0) {
        toast.error("Quadro de destino não tem colunas");
        return;
      }
      await api(`/api/task-boards/cards/${migrateCard.id}/move`, {
        method: 'PUT',
        body: { board_id: migrateTargetBoard, column_id: cols[0].id },
      });
      toast.success("Card migrado!");
      setMigrateCardDialog(false);
      setMigrateCard(null);
      moveCard.reset();
    } catch (err) {
      toast.error("Erro ao migrar card");
    }
  };

  const colColors = ['#94a3b8', '#3b82f6', '#f59e0b', '#22c55e', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

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
              <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as any)}>
                <TabsList className="h-8">
                  <TabsTrigger value="kanban" className="text-xs px-3">
                    <Kanban className="h-3 w-3 mr-1" /> Kanban
                  </TabsTrigger>
                  <TabsTrigger value="templates" className="text-xs px-3">
                    <ListChecks className="h-3 w-3 mr-1" /> Templates
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {mainTab === 'kanban' && (
                <>
                  <Button
                    variant={showFilters ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShowFilters(!showFilters)}
                  >
                    <Filter className="h-4 w-4 mr-1" /> Filtros
                    {(filterUser !== 'all' || filterDateFrom || filterDateTo) && (
                      <Badge variant="secondary" className="ml-1 text-[10px] px-1">!</Badge>
                    )}
                  </Button>
                  {canManageColumns && (
                    <Button size="sm" variant="outline" onClick={() => { setColName(""); setColColor("#94a3b8"); setColIsFinal(false); setAddColumnDialog(true); }}>
                      <Plus className="h-4 w-4 mr-1" /> Coluna
                    </Button>
                  )}
                  <Button size="sm" onClick={() => setCreateBoardOpen(true)}>
                    <Plus className="h-4 w-4 mr-1" /> Quadro
                  </Button>
                </>
              )}
            </div>
            </div>

          {/* Board selector - only for kanban */}
          {mainTab === 'kanban' && (
            <div className="flex items-center gap-2 flex-wrap">
              <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)}>
                <TabsList className="h-7">
                  <TabsTrigger value="all" className="text-xs px-2">Todos</TabsTrigger>
                  <TabsTrigger value="global" className="text-xs px-2">
                    <Globe className="h-3 w-3 mr-1" /> Globais
                  </TabsTrigger>
                  <TabsTrigger value="personal" className="text-xs px-2">
                    <User className="h-3 w-3 mr-1" /> Pessoais
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="flex items-center gap-2 overflow-x-auto">
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
          )}
        </div>

        {/* Filter bar */}
        {showFilters && mainTab === 'kanban' && (
          <div className="px-4 py-2 border-b bg-muted/30 flex items-center gap-3 flex-wrap">
            {canFilter && (
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-muted-foreground">Usuário:</label>
                <Select value={filterUser} onValueChange={setFilterUser}>
                  <SelectTrigger className="h-8 w-[180px] text-xs">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os usuários</SelectItem>
                    {orgMembers.filter(m => m.user_id).map(m => (
                      <SelectItem key={m.user_id} value={m.user_id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-muted-foreground">De:</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("h-8 text-xs", !filterDateFrom && "text-muted-foreground")}>
                    <CalendarIcon className="h-3 w-3 mr-1" />
                    {filterDateFrom ? format(filterDateFrom, "dd/MM/yy", { locale: ptBR }) : "Início"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={filterDateFrom} onSelect={setFilterDateFrom} initialFocus className="pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-muted-foreground">Até:</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("h-8 text-xs", !filterDateTo && "text-muted-foreground")}>
                    <CalendarIcon className="h-3 w-3 mr-1" />
                    {filterDateTo ? format(filterDateTo, "dd/MM/yy", { locale: ptBR }) : "Fim"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={filterDateTo} onSelect={setFilterDateTo} initialFocus className="pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            {(filterUser !== 'all' || filterDateFrom || filterDateTo) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => { setFilterUser("all"); setFilterDateFrom(undefined); setFilterDateTo(undefined); }}
              >
                <X className="h-3 w-3 mr-1" /> Limpar
              </Button>
            )}
          </div>
        )}

        {/* Content */}
        {mainTab === 'kanban' && (
          <>
            {selectedBoard && columns ? (
              <DndContext
                sensors={sensors}
                collisionDetection={rectIntersection}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
                onDragCancel={handleDragCancel}
                measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
              >
                <ScrollArea className="flex-1 w-full">
                    <div className="flex gap-4 p-4 min-w-max">
                      {columns.map((col, colIndex) => {
                        const colCards = cardsByColumn[col.id] || [];
                        return (
                          <SortableContext key={col.id} items={colCards.map(c => c.id)} strategy={verticalListSortingStrategy}>
                            <TaskKanbanColumn
                              column={col}
                              cards={colCards}
                              onCardClick={(card) => { setSelectedCard(card); setCardDetailOpen(true); }}
                              onAddCard={handleAddCard}
                              activeId={activeId}
                              overId={overId}
                              onEditColumn={handleEditColumn}
                              onDeleteColumn={handleDeleteColumn}
                              canManageColumns={canManageColumns}
                              onMoveLeft={() => handleMoveColumn(col.id, 'left')}
                              onMoveRight={() => handleMoveColumn(col.id, 'right')}
                              isFirst={colIndex === 0}
                              isLast={colIndex === columns.length - 1}
                            />
                          </SortableContext>
                        );
                      })}
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
          </>
        )}

        {mainTab === 'templates' && (
          <div className="flex-1 p-4 overflow-auto">
            <ChecklistTemplateManager />
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
        boards={boards || []}
        onDuplicate={handleDuplicateCard}
        onMigrate={(card) => { setMigrateCard(card); setMigrateTargetBoard(""); setMigrateCardDialog(true); }}
      />

      {/* Edit Column Dialog */}
      <Dialog open={editColumnDialog} onOpenChange={setEditColumnDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar Coluna</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome</Label>
              <Input value={colName} onChange={e => setColName(e.target.value)} />
            </div>
            <div>
              <Label>Cor</Label>
              <div className="flex gap-2 mt-1">
                {colColors.map(c => (
                  <button key={c} className={cn("w-8 h-6 rounded border-2", colColor === c ? "border-foreground" : "border-transparent")}
                    style={{ backgroundColor: c }} onClick={() => setColColor(c)} />
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={colIsFinal} onChange={e => setColIsFinal(e.target.checked)} id="col-final" />
              <Label htmlFor="col-final">Coluna final (conclusão)</Label>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditColumnDialog(false)}>Cancelar</Button>
              <Button onClick={handleSaveColumn}>Salvar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Column Dialog */}
      <Dialog open={addColumnDialog} onOpenChange={setAddColumnDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nova Coluna</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome</Label>
              <Input value={colName} onChange={e => setColName(e.target.value)} placeholder="Nome da coluna" />
            </div>
            <div>
              <Label>Cor</Label>
              <div className="flex gap-2 mt-1">
                {colColors.map(c => (
                  <button key={c} className={cn("w-8 h-6 rounded border-2", colColor === c ? "border-foreground" : "border-transparent")}
                    style={{ backgroundColor: c }} onClick={() => setColColor(c)} />
                ))}
              </div>
            </div>
            <div>
              <Label>Posição (opcional)</Label>
              <Input 
                type="number" 
                min="1" 
                max={columns ? columns.length + 1 : 1}
                value={colPosition} 
                onChange={e => setColPosition(e.target.value)} 
                placeholder={`1 a ${columns ? columns.length + 1 : 1}`} 
              />
              <p className="text-xs text-muted-foreground mt-1">Deixe vazio para adicionar no final</p>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={colIsFinal} onChange={e => setColIsFinal(e.target.checked)} id="add-col-final" />
              <Label htmlFor="add-col-final">Coluna final (conclusão)</Label>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAddColumnDialog(false)}>Cancelar</Button>
              <Button onClick={handleAddColumn} disabled={!colName.trim()}>Criar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Migrate Card Dialog */}
      <Dialog open={migrateCardDialog} onOpenChange={setMigrateCardDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Migrar Card</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Mover "{migrateCard?.title}" para outro quadro:
            </p>
            <Select value={migrateTargetBoard} onValueChange={setMigrateTargetBoard}>
              <SelectTrigger><SelectValue placeholder="Selecionar quadro" /></SelectTrigger>
              <SelectContent>
                {(boards || []).filter(b => b.id !== migrateCard?.board_id).map(b => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name} {b.type === 'global' ? '(Global)' : '(Pessoal)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setMigrateCardDialog(false)}>Cancelar</Button>
              <Button onClick={handleMigrateCard} disabled={!migrateTargetBoard}>Migrar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
