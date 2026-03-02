import { useState, useEffect, useMemo, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KanbanBoard } from "@/components/crm/KanbanBoard";
import { PipelineView } from "@/components/crm/PipelineView";
import { DealDetailDialog } from "@/components/crm/DealDetailDialog";
import { DealFormDialog } from "@/components/crm/DealFormDialog";
import { FunnelEditorDialog } from "@/components/crm/FunnelEditorDialog";
import { WinCelebration } from "@/components/crm/WinCelebration";
import { LossReasonDialog } from "@/components/crm/LossReasonDialog";
import { BulkActionBar } from "@/components/crm/BulkActionBar";
import { useCRMFunnels, useCRMFunnel, useCRMDeals, useCRMGroups, useCRMGroupMembers, useCRMDealMutations, CRMDeal, CRMFunnel } from "@/hooks/use-crm";
import { Plus, Settings, Loader2, Filter, User, Users, ArrowUpDown, CalendarIcon, X, LayoutGrid, List, Trophy, XCircle, Pause, CheckSquare } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { parseISO, format, startOfDay, endOfDay, isWithinInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { toast } from "sonner";
import { api } from "@/lib/api";

export default function CRMNegociacoes() {
  const { user } = useAuth();
  const [selectedFunnelId, setSelectedFunnelId] = useState<string | null>(null);
  const [selectedDeal, setSelectedDeal] = useState<CRMDeal | null>(null);
  const [dealDetailOpen, setDealDetailOpen] = useState(false);
  const [newDealOpen, setNewDealOpen] = useState(false);
  const [funnelEditorOpen, setFunnelEditorOpen] = useState(false);
  const [editingFunnel, setEditingFunnel] = useState<CRMFunnel | null>(null);
  
  // View mode
  const [viewMode, setViewMode] = useState<"kanban" | "pipeline">("kanban");
  
  // Celebration state
  const [showCelebration, setShowCelebration] = useState(false);
  const [newWinDealId, setNewWinDealId] = useState<string | null>(null);
  
  // Loss reason dialog state
  const [lossDialogOpen, setLossDialogOpen] = useState(false);
  const [pendingLossDeal, setPendingLossDeal] = useState<{ id: string; title: string } | null>(null);
  
  // Filters
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [sortOrder, setSortOrder] = useState<string>("recent");
  const [dateFilterType, setDateFilterType] = useState<string>("created");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  
  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const { data: funnels, isLoading: loadingFunnels } = useCRMFunnels();
  const { data: groups } = useCRMGroups();
  const { updateDeal } = useCRMDealMutations();
  const queryClient = useQueryClient();
  
  // Auto-select first funnel
  const currentFunnelId = selectedFunnelId || funnels?.[0]?.id || null;
  
  useEffect(() => {
    if (!selectedFunnelId && funnels?.[0]?.id) {
      setSelectedFunnelId(funnels[0].id);
    }
  }, [funnels, selectedFunnelId]);

  const { data: funnelData } = useCRMFunnel(currentFunnelId);
  const { data: dealsByStage, isLoading: loadingDeals } = useCRMDeals(currentFunnelId);
  const { data: groupMembers } = useCRMGroupMembers(groupFilter !== "all" ? groupFilter : null);

  const currentFunnel = funnels?.find((f) => f.id === currentFunnelId) || null;
  const canManage = user?.role && ['owner', 'admin', 'manager'].includes(user.role);
  
  // Handle status change with celebration
  const handleStatusChange = useCallback((dealId: string, status: 'won' | 'lost' | 'paused' | 'open', dealTitle?: string) => {
    // If marking as lost, open the loss reason dialog
    if (status === 'lost') {
      const deal = Object.values(dealsByStage || {}).flat().find(d => d.id === dealId);
      setPendingLossDeal({ id: dealId, title: dealTitle || deal?.title || 'Negociação' });
      setLossDialogOpen(true);
      return;
    }

    updateDeal.mutate({ id: dealId, status } as any, {
      onSuccess: () => {
        if (status === 'won') {
          setNewWinDealId(dealId);
          setShowCelebration(true);
          toast.success("🎉 Negócio fechado com sucesso!");
        } else if (status === 'paused') {
          toast.info("Negociação pausada");
        } else {
          toast.success("Negociação reaberta");
        }
      }
    });
  }, [updateDeal, dealsByStage]);

  // Handle confirmed loss with reason
  const handleConfirmLoss = useCallback((reasonId: string, description: string) => {
    if (!pendingLossDeal) return;
    
    updateDeal.mutate({ 
      id: pendingLossDeal.id, 
      status: 'lost',
      loss_reason_id: reasonId,
      lost_reason: description 
    } as any, {
      onSuccess: () => {
        toast.error("Negociação marcada como perdida");
        setPendingLossDeal(null);
      }
    });
  }, [updateDeal, pendingLossDeal]);


  const sortDeals = (deals: CRMDeal[]): CRMDeal[] => {
    return [...deals].sort((a, b) => {
      switch (sortOrder) {
        case "oldest":
          return parseISO(a.created_at).getTime() - parseISO(b.created_at).getTime();
        case "last_activity":
          return parseISO(b.last_activity_at).getTime() - parseISO(a.last_activity_at).getTime();
        case "recent":
        default:
          return parseISO(b.created_at).getTime() - parseISO(a.created_at).getTime();
      }
    });
  };

  // Apply filters and sorting to deals
  const filteredDealsByStage = useMemo(() => {
    if (!dealsByStage) return {};
    
    return Object.entries(dealsByStage).reduce((acc, [stageId, deals]) => {
      let filtered = deals as CRMDeal[];
      
      // Filter by owner
      if (ownerFilter === "mine") {
        filtered = filtered.filter(d => d.owner_id === user?.id);
      } else if (ownerFilter !== "all") {
        filtered = filtered.filter(d => d.owner_id === ownerFilter);
      }
      
      // Filter by group
      if (groupFilter !== "all") {
        filtered = filtered.filter(d => d.group_id === groupFilter);
      }
      
      // Filter by status
      if (statusFilter !== "all") {
        filtered = filtered.filter(d => d.status === statusFilter);
      }
      
      // Filter by date range
      if (startDate || endDate) {
        filtered = filtered.filter(d => {
          const dateToCheck = dateFilterType === "last_activity" 
            ? parseISO(d.last_activity_at) 
            : parseISO(d.created_at);
          
          if (startDate && endDate) {
            return isWithinInterval(dateToCheck, {
              start: startOfDay(startDate),
              end: endOfDay(endDate)
            });
          } else if (startDate) {
            return dateToCheck >= startOfDay(startDate);
          } else if (endDate) {
            return dateToCheck <= endOfDay(endDate);
          }
          return true;
        });
      }
      
      // Apply sorting
      filtered = sortDeals(filtered);
      
      acc[stageId] = filtered;
      return acc;
    }, {} as Record<string, CRMDeal[]>);
  }, [dealsByStage, ownerFilter, groupFilter, sortOrder, user?.id, startDate, endDate, dateFilterType, statusFilter]);

  // Bulk selection handlers
  const allFilteredDeals = useMemo(() => {
    return Object.values(filteredDealsByStage || {}).flat() as CRMDeal[];
  }, [filteredDealsByStage]);

  const uniqueOwners = useMemo(() => {
    const owners = new Map<string, string>();
    allFilteredDeals.forEach(d => {
      if (d.owner_id && d.owner_name) owners.set(d.owner_id, d.owner_name);
    });
    return Array.from(owners.entries()).map(([id, name]) => ({ id, name }));
  }, [allFilteredDeals]);

  const handleToggleSelect = useCallback((dealId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(dealId)) next.delete(dealId);
      else next.add(dealId);
      return next;
    });
    if (!selectionMode) setSelectionMode(true);
  }, [selectionMode]);

  const handleSelectColumn = useCallback((stageId: string) => {
    const columnDeals = (filteredDealsByStage as Record<string, CRMDeal[]>)?.[stageId] || [];
    const allSelected = columnDeals.every(d => selectedIds.has(d.id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      columnDeals.forEach(d => {
        if (allSelected) next.delete(d.id);
        else next.add(d.id);
      });
      return next;
    });
  }, [filteredDealsByStage, selectedIds]);

  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(allFilteredDeals.map(d => d.id)));
  }, [allFilteredDeals]);

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setSelectionMode(false);
  }, []);

  const handleBulkMoveStage = useCallback(async (stageId: string) => {
    const ids = Array.from(selectedIds);
    try {
      await Promise.all(ids.map(id => 
        api(`/api/crm/deals/${id}/move`, { method: "POST", body: { stage_id: stageId } })
      ));
      toast.success(`${ids.length} negociação(ões) movida(s)`);
      handleClearSelection();
      queryClient.invalidateQueries({ queryKey: ["crm-deals"] });
    } catch {
      toast.error("Erro ao mover negociações");
    }
  }, [selectedIds, handleClearSelection]);

  const handleBulkMoveFunnel = useCallback(async (funnelId: string) => {
    const ids = Array.from(selectedIds);
    try {
      await Promise.all(ids.map(id => 
        api(`/api/crm/deals/${id}`, { method: "PUT", body: { funnel_id: funnelId } })
      ));
      toast.success(`${ids.length} negociação(ões) movida(s) para outro funil`);
      handleClearSelection();
      queryClient.invalidateQueries({ queryKey: ["crm-deals"] });
    } catch {
      toast.error("Erro ao mover negociações");
    }
  }, [selectedIds, handleClearSelection]);

  const handleBulkChangeOwner = useCallback(async (ownerId: string) => {
    const ids = Array.from(selectedIds);
    try {
      await Promise.all(ids.map(id => 
        api(`/api/crm/deals/${id}`, { method: "PUT", body: { owner_id: ownerId } })
      ));
      toast.success(`Responsável alterado em ${ids.length} negociação(ões)`);
      handleClearSelection();
      queryClient.invalidateQueries({ queryKey: ["crm-deals"] });
    } catch {
      toast.error("Erro ao alterar responsável");
    }
  }, [selectedIds, handleClearSelection]);

  const handleBulkDelete = useCallback(async () => {
    const ids = Array.from(selectedIds);
    try {
      await Promise.all(ids.map(id => 
        api(`/api/crm/deals/${id}`, { method: "DELETE" })
      ));
      toast.success(`${ids.length} negociação(ões) excluída(s)`);
      handleClearSelection();
      queryClient.invalidateQueries({ queryKey: ["crm-deals"] });
    } catch {
      toast.error("Erro ao excluir negociações");
    }
  }, [selectedIds, handleClearSelection]);

  const handleDealClick = (deal: CRMDeal) => {
    setSelectedDeal(deal);
    setDealDetailOpen(true);
  };

  const handleEditFunnel = () => {
    // Use funnelData which includes stages
    if (funnelData) {
      setEditingFunnel(funnelData as CRMFunnel);
    } else {
      setEditingFunnel(currentFunnel);
    }
    setFunnelEditorOpen(true);
  };

  const handleNewFunnel = () => {
    setEditingFunnel(null);
    setFunnelEditorOpen(true);
  };

  return (
    <MainLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex flex-col gap-4 p-4 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold">Negociações</h1>
              
              {/* Funnel Selector */}
              <Select 
                value={currentFunnelId || ""} 
                onValueChange={(val) => setSelectedFunnelId(val)}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Selecione um funil" />
                </SelectTrigger>
                <SelectContent>
                  {funnels?.map((funnel) => (
                    <SelectItem key={funnel.id} value={funnel.id}>
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: funnel.color }} 
                        />
                        {funnel.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {canManage && currentFunnel && (
                <Button variant="ghost" size="icon" onClick={handleEditFunnel}>
                  <Settings className="h-4 w-4" />
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* View Toggle */}
              <ToggleGroup type="single" value={viewMode} onValueChange={(v) => v && setViewMode(v as "kanban" | "pipeline")}>
                <ToggleGroupItem value="kanban" aria-label="Kanban" className="gap-1">
                  <LayoutGrid className="h-4 w-4" />
                  <span className="hidden sm:inline">Kanban</span>
                </ToggleGroupItem>
                <ToggleGroupItem value="pipeline" aria-label="Pipeline" className="gap-1">
                  <List className="h-4 w-4" />
                  <span className="hidden sm:inline">Pipeline</span>
                </ToggleGroupItem>
              </ToggleGroup>

              {/* Selection mode toggle */}
              <Button 
                variant={selectionMode ? "default" : "outline"} 
                size="sm"
                onClick={() => {
                  if (selectionMode) handleClearSelection();
                  else setSelectionMode(true);
                }}
              >
                <CheckSquare className="h-4 w-4 mr-1" />
                Selecionar
              </Button>

              {canManage && (
                <Button variant="outline" onClick={handleNewFunnel}>
                  <Plus className="h-4 w-4 mr-2" />
                  Novo Funil
                </Button>
              )}
              <Button onClick={() => setNewDealOpen(true)} disabled={!currentFunnelId}>
                <Plus className="h-4 w-4 mr-2" />
                Nova Negociação
              </Button>
            </div>
          </div>

          {/* Filters Row */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Filter className="h-4 w-4" />
              <span>Filtros:</span>
            </div>

            {/* Owner Filter */}
            <Select value={ownerFilter} onValueChange={setOwnerFilter}>
              <SelectTrigger className="w-[180px]">
                <User className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Responsável" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="mine">Minhas negociações</SelectItem>
                {groupMembers?.map((member) => (
                  <SelectItem key={member.user_id} value={member.user_id}>
                    {member.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Group Filter */}
            <Select value={groupFilter} onValueChange={setGroupFilter}>
              <SelectTrigger className="w-[180px]">
                <Users className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Grupo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os grupos</SelectItem>
                {groups?.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Sort Order */}
            <Select value={sortOrder} onValueChange={setSortOrder}>
              <SelectTrigger className="w-[180px]">
                <ArrowUpDown className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Ordenar por" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Mais recentes</SelectItem>
                <SelectItem value="oldest">Mais antigas</SelectItem>
                <SelectItem value="last_activity">Último contato</SelectItem>
              </SelectContent>
            </Select>

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos status</SelectItem>
                <SelectItem value="open">
                  <span className="flex items-center gap-2">Em aberto</span>
                </SelectItem>
                <SelectItem value="won">
                  <span className="flex items-center gap-2">
                    <Trophy className="h-3 w-3 text-green-500" />
                    Ganhos
                  </span>
                </SelectItem>
                <SelectItem value="lost">
                  <span className="flex items-center gap-2">
                    <XCircle className="h-3 w-3 text-red-500" />
                    Perdidos
                  </span>
                </SelectItem>
                <SelectItem value="paused">
                  <span className="flex items-center gap-2">
                    <Pause className="h-3 w-3 text-gray-500" />
                    Pausados
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>

            {/* Date Filter */}
            <div className="flex items-center gap-2">
              <Select value={dateFilterType} onValueChange={setDateFilterType}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Filtrar por" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="created">Criação</SelectItem>
                  <SelectItem value="last_activity">Última atividade</SelectItem>
                </SelectContent>
              </Select>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-[130px] justify-start text-left font-normal",
                      !startDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {startDate ? format(startDate, "dd/MM/yy") : "Data início"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 z-50" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={setStartDate}
                    locale={ptBR}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-[130px] justify-start text-left font-normal",
                      !endDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {endDate ? format(endDate, "dd/MM/yy") : "Data fim"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 z-50" align="start">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={setEndDate}
                    locale={ptBR}
                    disabled={(date) => startDate ? date < startDate : false}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>

              {(startDate || endDate) && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setStartDate(undefined);
                    setEndDate(undefined);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            {(ownerFilter !== "all" || groupFilter !== "all" || sortOrder !== "recent" || startDate || endDate || statusFilter !== "all") && (
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => {
                  setOwnerFilter("all");
                  setGroupFilter("all");
                  setSortOrder("recent");
                  setStartDate(undefined);
                  setEndDate(undefined);
                  setStatusFilter("all");
                }}
              >
                Limpar filtros
              </Button>
            )}
          </div>
        </div>

        {/* Bulk Action Bar */}
        {selectionMode && selectedIds.size > 0 && funnelData?.stages && (
          <BulkActionBar
            selectedCount={selectedIds.size}
            stages={funnelData.stages}
            funnels={funnels}
            currentFunnelId={currentFunnelId || undefined}
            owners={uniqueOwners}
            onMoveToStage={handleBulkMoveStage}
            onMoveToFunnel={handleBulkMoveFunnel}
            onChangeOwner={handleBulkChangeOwner}
            onDeleteAll={handleBulkDelete}
            onClearSelection={handleClearSelection}
            onSelectAll={handleSelectAll}
            totalDeals={allFilteredDeals.length}
          />
        )}

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {loadingFunnels || loadingDeals ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !funnels?.length ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <h3 className="text-lg font-medium mb-2">Nenhum funil configurado</h3>
              <p className="text-muted-foreground mb-4">
                Crie um funil para começar a gerenciar suas negociações
              </p>
              {canManage && (
                <Button onClick={handleNewFunnel}>
                  <Plus className="h-4 w-4 mr-2" />
                  Criar Funil
                </Button>
              )}
            </div>
          ) : funnelData?.stages && funnelData.stages.length > 0 ? (
            viewMode === "kanban" ? (
              <KanbanBoard
                stages={funnelData.stages}
                dealsByStage={filteredDealsByStage}
                onDealClick={handleDealClick}
                onStatusChange={handleStatusChange}
                newWinDealId={newWinDealId}
                selectedIds={selectedIds}
                selectionMode={selectionMode}
                onToggleSelect={handleToggleSelect}
                onSelectColumn={handleSelectColumn}
              />
            ) : (
              <PipelineView
                stages={funnelData.stages}
                dealsByStage={filteredDealsByStage}
                onDealClick={handleDealClick}
                onStatusChange={handleStatusChange}
                newWinDealId={newWinDealId}
                selectedIds={selectedIds}
                selectionMode={selectionMode}
                onToggleSelect={handleToggleSelect}
              />
            )
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <h3 className="text-lg font-medium mb-2">Nenhuma etapa configurada</h3>
              <p className="text-muted-foreground mb-4">
                Configure as etapas do funil para visualizar o Kanban
              </p>
              {canManage && (
                <Button onClick={handleEditFunnel}>
                  <Settings className="h-4 w-4 mr-2" />
                  Configurar Etapas
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <DealDetailDialog
        deal={selectedDeal}
        open={dealDetailOpen}
        onOpenChange={setDealDetailOpen}
      />

      <DealFormDialog
        funnel={currentFunnel}
        open={newDealOpen}
        onOpenChange={setNewDealOpen}
      />

      <FunnelEditorDialog
        funnel={editingFunnel}
        open={funnelEditorOpen}
        onOpenChange={setFunnelEditorOpen}
      />

      {/* Win Celebration */}
      <WinCelebration 
        show={showCelebration} 
        onComplete={() => {
          setShowCelebration(false);
          setNewWinDealId(null);
        }} 
      />

      {/* Loss Reason Dialog */}
      <LossReasonDialog
        open={lossDialogOpen}
        onOpenChange={setLossDialogOpen}
        onConfirm={handleConfirmLoss}
        dealTitle={pendingLossDeal?.title}
      />
    </MainLayout>
  );
}
