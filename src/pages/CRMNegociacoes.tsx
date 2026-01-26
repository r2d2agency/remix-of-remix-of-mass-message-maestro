import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KanbanBoard } from "@/components/crm/KanbanBoard";
import { DealDetailDialog } from "@/components/crm/DealDetailDialog";
import { DealFormDialog } from "@/components/crm/DealFormDialog";
import { FunnelEditorDialog } from "@/components/crm/FunnelEditorDialog";
import { useCRMFunnels, useCRMFunnel, useCRMDeals, useCRMGroups, useCRMGroupMembers, CRMDeal, CRMFunnel } from "@/hooks/use-crm";
import { Plus, Settings, Loader2, Filter, User, Users } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export default function CRMNegociacoes() {
  const { user } = useAuth();
  const [selectedFunnelId, setSelectedFunnelId] = useState<string | null>(null);
  const [selectedDeal, setSelectedDeal] = useState<CRMDeal | null>(null);
  const [dealDetailOpen, setDealDetailOpen] = useState(false);
  const [newDealOpen, setNewDealOpen] = useState(false);
  const [funnelEditorOpen, setFunnelEditorOpen] = useState(false);
  const [editingFunnel, setEditingFunnel] = useState<CRMFunnel | null>(null);
  
  // Filters
  const [ownerFilter, setOwnerFilter] = useState<string>("all"); // "all" | "mine" | user_id
  const [groupFilter, setGroupFilter] = useState<string>("all"); // "all" | group_id

  const { data: funnels, isLoading: loadingFunnels } = useCRMFunnels();
  const { data: groups } = useCRMGroups();
  
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

  // Debug logs
  console.log("🔍 Debug Kanban:", {
    funnels,
    funnelsCount: funnels?.length,
    selectedFunnelId,
    currentFunnelId,
    currentFunnel,
    funnelData,
    stages: funnelData?.stages,
    stagesCount: funnelData?.stages?.length,
    dealsByStage,
    loadingFunnels,
    loadingDeals
  });

  // Apply filters to deals
  const filteredDealsByStage = dealsByStage ? Object.entries(dealsByStage).reduce((acc, [stageId, deals]) => {
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
    
    acc[stageId] = filtered;
    return acc;
  }, {} as Record<string, CRMDeal[]>) : {};

  const handleDealClick = (deal: CRMDeal) => {
    setSelectedDeal(deal);
    setDealDetailOpen(true);
  };

  const handleEditFunnel = () => {
    setEditingFunnel(currentFunnel);
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

            {(ownerFilter !== "all" || groupFilter !== "all") && (
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => {
                  setOwnerFilter("all");
                  setGroupFilter("all");
                }}
              >
                Limpar filtros
              </Button>
            )}
          </div>
        </div>

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
            <KanbanBoard
              stages={funnelData.stages}
              dealsByStage={filteredDealsByStage}
              onDealClick={handleDealClick}
            />
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
    </MainLayout>
  );
}
