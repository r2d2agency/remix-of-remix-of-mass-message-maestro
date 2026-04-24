import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileText,
  FileSignature,
  FilePlus,
  Briefcase,
  Building2,
  User,
  StickyNote,
  GitBranch,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Phone,
  Mail,
  MapPin,
  DollarSign,
  Calendar,
  CheckSquare,
  Plus,
  ExternalLink,
  Trophy,
  XCircle,
  Pause,
  Edit,
  Save,
  X,
  Search,
  Video,
  ClipboardList,
  ArrowLeft,
  RefreshCw,
  Bot,
  Sparkles,
  Zap,
  MessageSquare,
  Send,
  Copy,
  Brain,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { 
  useCRMDealsByPhone, 
  useCRMFunnels, 
  useCRMFunnel,
  useCRMDealMutations,
  useCRMCompany,
  useCRMCompanies,
  useCRMCompanyMutations,
  CRMDeal,
  CRMStage,
} from "@/hooks/use-crm";
import { useChat, ConversationNote } from "@/hooks/use-chat";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAIAgents, AIAgent } from "@/hooks/use-ai-agents";
import { TaskDialog } from "@/components/crm/TaskDialog";
import { MeetingScheduleDialog } from "./MeetingScheduleDialog";
import { SendEmailDialog } from "@/components/email/SendEmailDialog";
import { EnrollSequenceDialog } from "@/components/nurturing/EnrollSequenceDialog";
import { DealDetailDialog } from "@/components/crm/DealDetailDialog";
import { CompanyDialog } from "@/components/crm/CompanyDialog";

interface CRMSidePanelProps {
  conversationId: string;
  contactPhone: string | null;
  contactName: string | null;
  isOpen: boolean;
  onToggle: () => void;
  chatMessages?: Array<{ id: string; content: string; sender: string; timestamp: string }>;
}

export function CRMSidePanel({ 
  conversationId, 
  contactPhone, 
  contactName,
  isOpen, 
  onToggle,
  chatMessages = [],
}: CRMSidePanelProps) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  
  // CRM Data
  const { data: allDeals = [], isLoading: loadingDeals, refetch: refetchDeals } = useCRMDealsByPhone(contactPhone);
  const { data: funnels = [] } = useCRMFunnels();
  
  // Filter only active deals (exclude won, lost, paused)
  const deals = allDeals.filter(d => d.status === 'open');
  
  // Selected deal for detailed view
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const selectedDeal = deals.find(d => d.id === selectedDealId) || deals[0];
  
  // Funnel stages for selected deal
  const { data: funnelData } = useCRMFunnel(selectedDeal?.funnel_id || null);
  const stages = funnelData?.stages || [];
  
  // Company data
  const { data: company, refetch: refetchCompany } = useCRMCompany(selectedDeal?.company_id || null);
  
  // Company search for assignment
  const [companySearch, setCompanySearch] = useState("");
  const { data: companiesSearch = [] } = useCRMCompanies(companySearch.length >= 2 ? companySearch : undefined);
  
  // Deal mutations
  const { moveDeal, updateDeal, createDeal } = useCRMDealMutations();
  
  // Company mutations
  const { createCompany } = useCRMCompanyMutations();
  
  // Notes
  const [notes, setNotes] = useState<ConversationNote[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const { getNotes, createNote } = useChat();

  // AI Agents
  const { getAgents } = useAIAgents();
  const [aiAgents, setAiAgents] = useState<AIAgent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [activatingAgent, setActivatingAgent] = useState<string | null>(null);

  // AI Consultation
  const [consultAgent, setConsultAgent] = useState<AIAgent | null>(null);
  const [consultPrompt, setConsultPrompt] = useState("");
  const [consultResponse, setConsultResponse] = useState("");
  const [consulting, setConsulting] = useState(false);

  // Edit states
  const [isEditingDeal, setIsEditingDeal] = useState(false);
  const [dealForm, setDealForm] = useState({
    title: "",
    value: 0,
    probability: 0,
    expected_close_date: "",
  });

  // Company assignment states
  const [isAssigningCompany, setIsAssigningCompany] = useState(false);
  const [showCompanyDialog, setShowCompanyDialog] = useState(false);

  // Task and Meeting dialogs
  const [showTaskDialog, setShowTaskDialog] = useState(false);
  const [showMeetingDialog, setShowMeetingDialog] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [showDealDetailDialog, setShowDealDetailDialog] = useState(false);
  const [showSequenceDialog, setShowSequenceDialog] = useState(false);

  // Inline deal creation state
  const [showCreateDeal, setShowCreateDeal] = useState(false);
  const [newDealTitle, setNewDealTitle] = useState("");
  const [newDealFunnelId, setNewDealFunnelId] = useState("");
  const [newDealStageId, setNewDealStageId] = useState("");
  const [newDealValue, setNewDealValue] = useState("");
  const [newDealProbability, setNewDealProbability] = useState(50);
  const [isCreatingDeal, setIsCreatingDeal] = useState(false);

  // Get stages for selected funnel in new deal form
  const { data: newDealFunnelData } = useCRMFunnel(newDealFunnelId || null);
  const newDealStages = newDealFunnelData?.stages?.filter(s => !s.is_final) || [];

  // Initialize deal form when deal changes
  useEffect(() => {
    if (selectedDeal) {
      setDealForm({
        title: selectedDeal.title,
        value: selectedDeal.value,
        probability: selectedDeal.probability,
        expected_close_date: selectedDeal.expected_close_date || "",
      });
    }
  }, [selectedDeal?.id]);

  // Auto-select first stage when funnel changes
  useEffect(() => {
    if (newDealStages.length > 0 && !newDealStageId) {
      setNewDealStageId(newDealStages[0].id || "");
    }
  }, [newDealFunnelData]);

  // Load notes when panel opens
  useEffect(() => {
    if (isOpen && conversationId) {
      loadNotes();
      loadAgents();
    }
  }, [isOpen, conversationId]);

  const loadNotes = async () => {
    setLoadingNotes(true);
    try {
      const data = await getNotes(conversationId);
      setNotes(data);
    } catch (error) {
      console.error("Error loading notes:", error);
    } finally {
      setLoadingNotes(false);
    }
  };

  const loadAgents = async () => {
    setLoadingAgents(true);
    try {
      const data = await getAgents();
      setAiAgents(data.filter(a => a.is_active));
    } catch (error) {
      console.error("Error loading AI agents:", error);
    } finally {
      setLoadingAgents(false);
    }
  };

  const handleActivateAgent = async (agent: AIAgent) => {
    setActivatingAgent(agent.id);
    try {
      // Start an AI agent session for this conversation
      await api('/api/ai-agents/' + agent.id + '/sessions', {
        method: 'POST',
        body: {
          conversation_id: conversationId,
          contact_phone: contactPhone,
          contact_name: contactName,
        },
        auth: true,
      });
      toast.success(`Agente "${agent.name}" ativado para esta conversa!`);
    } catch (error) {
      console.error("Error activating agent:", error);
      toast.error("Erro ao ativar agente de IA");
    } finally {
      setActivatingAgent(null);
    }
  };

  const handleConsultAgent = async (prompt?: string) => {
    if (!consultAgent) return;
    const actualPrompt = prompt || consultPrompt.trim();
    if (!actualPrompt && !chatMessages.length) return;

    setConsulting(true);
    setConsultResponse("");
    try {
      const data = await api<{ response: string; agent_name: string }>(`/api/ai-agents/${consultAgent.id}/consult`, {
        method: 'POST',
        body: {
          messages: chatMessages.slice(-30).map(m => ({
            content: m.content,
            sender: m.sender,
          })),
          custom_prompt: actualPrompt || undefined,
        },
        auth: true,
      });
      setConsultResponse(data.response || 'Sem resposta');
    } catch (error) {
      console.error("Error consulting agent:", error);
      toast.error("Erro ao consultar agente de IA");
      setConsultResponse("");
    } finally {
      setConsulting(false);
    }
  };

  const handleCopyResponse = () => {
    navigator.clipboard.writeText(consultResponse);
    toast.success("Resposta copiada!");
  };

  const handleCreateNote = async () => {
    if (!newNote.trim()) return;
    setSavingNote(true);
    try {
      const note = await createNote(conversationId, newNote.trim());
      if (note) {
        setNotes([note, ...notes]);
        setNewNote("");
        toast.success("Anotação criada!");
      }
    } catch (error) {
      toast.error("Erro ao criar anotação");
    } finally {
      setSavingNote(false);
    }
  };

  const handleStageChange = async (stageId: string) => {
    if (!selectedDeal) return;
    try {
      await moveDeal.mutateAsync({ id: selectedDeal.id, stage_id: stageId });
      refetchDeals();
      toast.success("Etapa atualizada!");
    } catch (error) {
      toast.error("Erro ao atualizar etapa");
    }
  };

  const handleSaveDeal = async () => {
    if (!selectedDeal) return;
    try {
      await updateDeal.mutateAsync({
        id: selectedDeal.id,
        title: dealForm.title,
        value: dealForm.value,
        probability: dealForm.probability,
        expected_close_date: dealForm.expected_close_date || undefined,
      });
      refetchDeals();
      setIsEditingDeal(false);
      toast.success("Negociação atualizada!");
    } catch (error) {
      toast.error("Erro ao atualizar negociação");
    }
  };

  const handleAssignCompany = async (companyId: string) => {
    if (!selectedDeal) return;
    try {
      await updateDeal.mutateAsync({
        id: selectedDeal.id,
        company_id: companyId,
      });
      refetchDeals();
      refetchCompany();
      setIsAssigningCompany(false);
      setCompanySearch("");
      toast.success("Empresa atribuída!");
    } catch (error) {
      toast.error("Erro ao atribuir empresa");
    }
  };

  const handleCreateAndAssignCompany = async (newCompany: any) => {
    if (!newCompany?.id) return;
    
    // If we have a deal, assign the company to it
    if (selectedDeal) {
      try {
        await updateDeal.mutateAsync({
          id: selectedDeal.id,
          company_id: newCompany.id,
        });
        refetchDeals();
        refetchCompany();
        toast.success("Empresa criada e atribuída!");
      } catch (error) {
        toast.error("Erro ao atribuir empresa");
      }
    } else {
      toast.success("Empresa criada com sucesso!");
    }
    
    setShowCompanyDialog(false);
    setIsAssigningCompany(false);
    setCompanySearch("");
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 0,
    }).format(value);
  };

  const openDealDetail = () => {
    if (selectedDeal) {
      setShowDealDetailDialog(true);
    }
  };

  const openCreateDealForm = () => {
    // Auto-select first funnel if available
    if (funnels.length > 0 && !newDealFunnelId) {
      setNewDealFunnelId(funnels[0].id);
    }
    // Pre-fill title with contact name
    if (contactName) {
      setNewDealTitle(`Negociação - ${contactName}`);
    }
    setShowCreateDeal(true);
  };

  const handleCreateDealInline = async () => {
    if (!newDealTitle.trim() || !newDealFunnelId || !newDealStageId) {
      toast.error("Preencha título, funil e etapa");
      return;
    }

    setIsCreatingDeal(true);
    try {
      await createDeal.mutateAsync({
        funnel_id: newDealFunnelId,
        stage_id: newDealStageId,
        title: newDealTitle,
        value: parseFloat(newDealValue) || 0,
        probability: newDealProbability,
        contact_phone: contactPhone || undefined,
        contact_name: contactName || undefined,
      } as any);
      
      // Small delay to let the mutation's onSuccess invalidate queries
      setTimeout(() => refetchDeals(), 500);
      resetCreateDealForm();
    } catch (error) {
      console.error("Error creating deal:", error);
      toast.error("Erro ao criar negociação");
    } finally {
      setIsCreatingDeal(false);
    }
  };

  const resetCreateDealForm = () => {
    setShowCreateDeal(false);
    setNewDealTitle("");
    setNewDealFunnelId("");
    setNewDealStageId("");
    setNewDealValue("");
    setNewDealProbability(50);
  };

  // Status helpers
  const getStatusBadge = (deal: CRMDeal) => {
    if (deal.status === 'won') {
      return <Badge className="bg-green-500 text-white text-[10px]"><Trophy className="h-3 w-3 mr-1" />Ganho</Badge>;
    }
    if (deal.status === 'lost') {
      return <Badge className="bg-red-500 text-white text-[10px]"><XCircle className="h-3 w-3 mr-1" />Perdido</Badge>;
    }
    if (deal.status === 'paused') {
      return <Badge className="bg-gray-500 text-white text-[10px]"><Pause className="h-3 w-3 mr-1" />Pausado</Badge>;
    }
    return null;
  };

  // Toggle button (always visible)
  const ToggleButton = () => {
    if (isMobile) return null;
    return (
      <Button
        variant="outline"
        size="icon"
        onClick={onToggle}
        className={cn(
          "absolute top-1/2 -translate-y-1/2 z-20 h-12 w-6 rounded-l-md rounded-r-none border-r-0 bg-background shadow-md hover:bg-muted",
          "-left-6"
        )}
        title={isOpen ? "Fechar painel CRM" : "Abrir painel CRM"}
      >
        {isOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </Button>
    );
  };

  if (!isOpen) {
    return (
      <div className="relative">
        <ToggleButton />
      </div>
    );
  }

  return (
    <div className={cn(
      "relative flex flex-col bg-card overflow-hidden min-w-0",
      isMobile 
        ? "w-full h-full" 
        : "w-full h-full border-l"
    )}>
      <ToggleButton />
      
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b bg-muted/30 min-w-0">
        <div className="flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">CRM</span>
          {deals.length > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1.5">
              {deals.length}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onToggle}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Tabs defaultValue="crm" className="flex-1 flex flex-col overflow-hidden">
        <div className="px-3 pt-2">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="crm" className="text-xs">
              <Briefcase className="h-3 w-3 mr-1" />
              CRM
            </TabsTrigger>
            <TabsTrigger value="docs" className="text-xs">
              <FileText className="h-3 w-3 mr-1" />
              Documentos
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="crm" className="flex-1 flex flex-col overflow-hidden m-0">
          {/* Deal sub-header */}
          <div className="flex items-center justify-between p-2 border-b min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Negociações</span>
              {deals.length > 0 && (
                <Badge variant="secondary" className="text-[10px] px-1.5">
                  {deals.length}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              {selectedDeal && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-7 text-xs gap-1"
                  onClick={openDealDetail}
                >
                  <ExternalLink className="h-3 w-3" />
                  Abrir
                </Button>
              )}
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-7 text-xs gap-1 text-primary"
                onClick={openCreateDealForm}
              >
                <Plus className="h-3 w-3" />
                Nova
              </Button>
              {!isMobile && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={onToggle}
                  title="Fechar painel CRM"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Inline Deal Creation Form */}
          {showCreateDeal && (
            <div className="p-3 border-b bg-muted/20 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={resetCreateDealForm}>
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <span className="font-medium text-sm">Nova Negociação</span>
                </div>
                {contactName && (
                  <Badge variant="secondary" className="text-[10px]">
                    <User className="h-3 w-3 mr-1" />
                    {contactName}
                  </Badge>
                )}
              </div>

              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Título *</Label>
                  <Input
                    value={newDealTitle}
                    onChange={(e) => setNewDealTitle(e.target.value)}
                    placeholder="Título da negociação"
                    className="h-8 text-xs mt-1"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Funil *</Label>
                    <Select value={newDealFunnelId} onValueChange={(val) => {
                      setNewDealFunnelId(val);
                      setNewDealStageId(""); // Reset stage when funnel changes
                    }}>
                      <SelectTrigger className="h-8 text-xs mt-1">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {funnels.map((funnel) => (
                          <SelectItem key={funnel.id} value={funnel.id} className="text-xs">
                            {funnel.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Etapa *</Label>
                    <Select 
                      value={newDealStageId} 
                      onValueChange={setNewDealStageId}
                      disabled={!newDealFunnelId}
                    >
                      <SelectTrigger className="h-8 text-xs mt-1">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {newDealStages.map((stage) => (
                          <SelectItem key={stage.id} value={stage.id!} className="text-xs">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: stage.color }} />
                              {stage.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Valor (R$)</Label>
                    <Input
                      type="number"
                      value={newDealValue}
                      onChange={(e) => setNewDealValue(e.target.value)}
                      placeholder="0,00"
                      className="h-8 text-xs mt-1"
                      min={0}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Probabilidade: {newDealProbability}%</Label>
                    <Slider
                      value={[newDealProbability]}
                      onValueChange={([val]) => setNewDealProbability(val)}
                      min={0}
                      max={100}
                      step={10}
                      className="mt-2"
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-8 text-xs"
                    onClick={resetCreateDealForm}
                  >
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 h-8 text-xs"
                    onClick={handleCreateDealInline}
                    disabled={!newDealTitle.trim() || !newDealFunnelId || !newDealStageId || isCreatingDeal}
                  >
                    {isCreatingDeal ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <Plus className="h-3 w-3 mr-1" />
                    )}
                    Criar
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div className="grid grid-cols-4 gap-1 p-2 border-b bg-muted/10 min-w-0 overflow-hidden">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1 px-2"
              onClick={() => setShowTaskDialog(true)}
            >
              <ClipboardList className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Tarefa</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1 px-2"
              onClick={() => setShowMeetingDialog(true)}
            >
              <Video className="h-3.5 w-3.5 text-green-600" />
              <span className="hidden sm:inline">Reunião</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1 px-2"
              onClick={() => setShowEmailDialog(true)}
            >
              <Mail className="h-3.5 w-3.5 text-blue-600" />
              <span className="hidden sm:inline">Email</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1 px-2"
              onClick={() => setShowSequenceDialog(true)}
              title="Inscrever em Sequência de Nurturing"
            >
              <RefreshCw className="h-3.5 w-3.5 text-purple-600" />
              <span className="hidden sm:inline">Seq.</span>
            </Button>
          </div>

          <ScrollArea className="flex-1 min-h-0 min-w-0 w-full [&>[data-radix-scroll-area-viewport]]:!overflow-x-hidden">
            {loadingDeals ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="p-2 min-w-0 w-full max-w-full overflow-hidden">
                {deals.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-6 text-center text-muted-foreground mb-2">
                    <Briefcase className="h-10 w-10 mb-3 opacity-40" />
                    <p className="text-sm font-medium">Nenhuma negociação ativa</p>
                    <p className="text-xs mt-1">
                      {allDeals.length > 0 
                        ? `${allDeals.length} negociação(ões) encerrada(s)`
                        : "Este contato não possui negociações"
                      }
                    </p>
                    <Button 
                      variant="default" 
                      size="sm" 
                      className="mt-4 gap-1"
                      onClick={openCreateDealForm}
                    >
                      <Plus className="h-3 w-3" />
                      Criar negociação
                    </Button>
                  </div>
                ) : (
                  <>
                    {/* Deal selector - prominent when multiple deals */}
                    {deals.length > 1 && (
                      <div className="mb-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <Briefcase className="h-4 w-4 text-primary" />
                          <span className="text-sm font-medium">Qual negociação está em pauta?</span>
                        </div>
                        <Select value={selectedDealId || deals[0]?.id} onValueChange={setSelectedDealId}>
                          <SelectTrigger className="h-9 text-sm bg-background">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {deals.map(deal => (
                              <SelectItem key={deal.id} value={deal.id} className="text-sm py-2">
                                <div className="flex flex-col items-start">
                                  <span className="font-medium">{deal.title}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {formatCurrency(deal.value)} • {deal.stage_name}
                                  </span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {deals.length} negociações ativas com este contato
                        </p>
                      </div>
                    )}

                    <Accordion type="multiple" defaultValue={[]} className="space-y-1 min-w-0">
                      {/* Deal Info - Editable */}
                      <AccordionItem value="deal" className="border rounded-lg px-3">
                        <AccordionTrigger className="py-2 hover:no-underline">
                          <div className="flex items-center gap-2 text-sm">
                            <DollarSign className="h-4 w-4 text-green-600" />
                            <span>Negociação</span>
                            {selectedDeal && getStatusBadge(selectedDeal)}
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="pb-3">
                          {selectedDeal && (
                            <div className="space-y-3">
                              {isEditingDeal ? (
                                <>
                                  <div>
                                    <Label className="text-xs">Título</Label>
                                    <Input
                                      value={dealForm.title}
                                      onChange={(e) => setDealForm({ ...dealForm, title: e.target.value })}
                                      className="h-8 text-xs mt-1"
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-xs">Valor (R$)</Label>
                                    <Input
                                      type="number"
                                      value={dealForm.value}
                                      onChange={(e) => setDealForm({ ...dealForm, value: parseFloat(e.target.value) || 0 })}
                                      className="h-8 text-xs mt-1"
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-xs">Probabilidade (%)</Label>
                                    <Input
                                      type="number"
                                      min={0}
                                      max={100}
                                      value={dealForm.probability}
                                      onChange={(e) => setDealForm({ ...dealForm, probability: parseInt(e.target.value) || 0 })}
                                      className="h-8 text-xs mt-1"
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-xs">Previsão de fechamento</Label>
                                    <Input
                                      type="date"
                                      value={dealForm.expected_close_date}
                                      onChange={(e) => setDealForm({ ...dealForm, expected_close_date: e.target.value })}
                                      className="h-8 text-xs mt-1"
                                    />
                                  </div>
                                  <div className="flex gap-2 pt-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="flex-1 h-7 text-xs"
                                      onClick={() => setIsEditingDeal(false)}
                                    >
                                      <X className="h-3 w-3 mr-1" />
                                      Cancelar
                                    </Button>
                                    <Button
                                      size="sm"
                                      className="flex-1 h-7 text-xs"
                                      onClick={handleSaveDeal}
                                      disabled={updateDeal.isPending}
                                    >
                                      {updateDeal.isPending ? (
                                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                      ) : (
                                        <Save className="h-3 w-3 mr-1" />
                                      )}
                                      Salvar
                                    </Button>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground text-xs">Título:</span>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6"
                                      onClick={() => setIsEditingDeal(true)}
                                    >
                                      <Edit className="h-3 w-3" />
                                    </Button>
                                  </div>
                                  <p className="font-medium text-sm -mt-2">{selectedDeal.title}</p>
                                  
                                  <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground text-xs">Valor:</span>
                                    <span className="font-semibold text-green-600">{formatCurrency(selectedDeal.value)}</span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground text-xs">Probabilidade:</span>
                                    <Badge variant="secondary" className="text-[10px]">{selectedDeal.probability}%</Badge>
                                  </div>
                                  {selectedDeal.expected_close_date && (
                                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                      <Calendar className="h-3 w-3" />
                                      <span>Previsão: {format(parseISO(selectedDeal.expected_close_date), "dd/MM/yyyy", { locale: ptBR })}</span>
                                    </div>
                                  )}
                                  {selectedDeal.owner_name && (
                                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                      <User className="h-3 w-3" />
                                      <span>Responsável: {selectedDeal.owner_name}</span>
                                    </div>
                                  )}
                                  {Number(selectedDeal.pending_tasks) > 0 && (
                                    <div className="flex items-center gap-1 text-xs text-amber-600">
                                      <CheckSquare className="h-3 w-3" />
                                      <span>{selectedDeal.pending_tasks} tarefa(s) pendente(s)</span>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </AccordionContent>
                      </AccordionItem>

                      {/* Stage/Funnel */}
                      <AccordionItem value="stage" className="border rounded-lg px-3">
                        <AccordionTrigger className="py-2 hover:no-underline">
                          <div className="flex items-center gap-2 text-sm">
                            <GitBranch className="h-4 w-4 text-blue-600" />
                            <span>Funil & Etapa</span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="pb-3">
                          {selectedDeal && (
                            <div className="space-y-3">
                              <div>
                                <span className="text-muted-foreground text-xs block mb-1">Funil:</span>
                                <Badge variant="outline" className="text-xs">
                                  {funnels.find(f => f.id === selectedDeal.funnel_id)?.name || 'Carregando...'}
                                </Badge>
                              </div>
                              <div>
                                <span className="text-muted-foreground text-xs block mb-1">Etapa atual:</span>
                                {selectedDeal.status === 'open' ? (
                                  <Select value={selectedDeal.stage_id} onValueChange={handleStageChange}>
                                    <SelectTrigger className="h-8 text-xs">
                                      <SelectValue placeholder="Selecionar etapa" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {stages.map((stage: CRMStage) => (
                                        <SelectItem key={stage.id} value={stage.id!} className="text-xs">
                                          <div className="flex items-center gap-2">
                                            <div 
                                              className="w-2 h-2 rounded-full" 
                                              style={{ backgroundColor: stage.color }}
                                            />
                                            {stage.name}
                                          </div>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <Badge 
                                    style={{ backgroundColor: selectedDeal.stage_color }}
                                    className="text-white text-xs"
                                  >
                                    {selectedDeal.stage_name}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          )}
                        </AccordionContent>
                      </AccordionItem>

                      {/* Company - With assignment/creation */}
                      <AccordionItem value="company" className="border rounded-lg px-3">
                        <AccordionTrigger className="py-2 hover:no-underline">
                          <div className="flex items-center gap-2 text-sm">
                            <Building2 className="h-4 w-4 text-purple-600" />
                            <span>Empresa</span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="pb-3">
                          {isAssigningCompany ? (
                            <div className="space-y-3">
                              <div className="relative">
                                <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                                <Input
                                  placeholder="Buscar empresa..."
                                  value={companySearch}
                                  onChange={(e) => setCompanySearch(e.target.value)}
                                  className="h-8 text-xs pl-7"
                                />
                              </div>
                              {companySearch.length >= 2 && (
                                <div className="max-h-32 overflow-y-auto space-y-1">
                                  {companiesSearch.length === 0 ? (
                                    <p className="text-xs text-muted-foreground text-center py-2">Nenhuma empresa encontrada</p>
                                  ) : (
                                    companiesSearch.slice(0, 5).map(c => (
                                      <Button
                                        key={c.id}
                                        variant="ghost"
                                        size="sm"
                                        className="w-full justify-start h-7 text-xs"
                                        onClick={() => handleAssignCompany(c.id)}
                                      >
                                        <Building2 className="h-3 w-3 mr-2" />
                                        {c.name}
                                      </Button>
                                    ))
                                  )}
                                </div>
                              )}
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="flex-1 h-7 text-xs"
                                  onClick={() => {
                                    setIsAssigningCompany(false);
                                    setCompanySearch("");
                                  }}
                                >
                                  Cancelar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="flex-1 h-7 text-xs"
                                  onClick={() => {
                                    setIsAssigningCompany(false);
                                    setShowCompanyDialog(true);
                                  }}
                                >
                                  <Plus className="h-3 w-3 mr-1" />
                                  Criar nova
                                </Button>
                              </div>
                            </div>
                          ) : company ? (
                            <div className="space-y-2 text-sm">
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground text-xs">Nome:</span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => setIsAssigningCompany(true)}
                                  title="Alterar empresa"
                                >
                                  <Edit className="h-3 w-3" />
                                </Button>
                              </div>
                              <p className="font-medium -mt-1">{company.name}</p>
                              {company.segment_name && (
                                <div className="flex items-center gap-1">
                                  <span className="text-muted-foreground text-xs">Segmento:</span>
                                  <Badge 
                                    variant="outline" 
                                    className="text-[10px]"
                                    style={{ borderColor: company.segment_color, color: company.segment_color }}
                                  >
                                    {company.segment_name}
                                  </Badge>
                                </div>
                              )}
                              {company.phone && (
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Phone className="h-3 w-3" />
                                  <span>{company.phone}</span>
                                </div>
                              )}
                              {company.email && (
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Mail className="h-3 w-3" />
                                  <span>{company.email}</span>
                                </div>
                              )}
                              {(company.city || company.state) && (
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <MapPin className="h-3 w-3" />
                                  <span>{[company.city, company.state].filter(Boolean).join(', ')}</span>
                                </div>
                              )}
                            </div>
                          ) : selectedDeal?.company_name && selectedDeal.company_name !== 'Sem empresa' ? (
                            <div className="space-y-2">
                              <p className="text-sm">{selectedDeal.company_name}</p>
                              <Button
                                size="sm"
                                variant="outline"
                                className="w-full h-7 text-xs"
                                onClick={() => setIsAssigningCompany(true)}
                              >
                                <Edit className="h-3 w-3 mr-1" />
                                Alterar empresa
                              </Button>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <p className="text-sm text-muted-foreground">Sem empresa vinculada</p>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="flex-1 h-7 text-xs"
                                  onClick={() => setIsAssigningCompany(true)}
                                >
                                  <Search className="h-3 w-3 mr-1" />
                                  Buscar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="flex-1 h-7 text-xs"
                                  onClick={() => setShowCompanyDialog(true)}
                                >
                                  <Plus className="h-3 w-3 mr-1" />
                                  Criar
                                </Button>
                              </div>
                            </div>
                          )}
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </>
                )}

                {/* Always visible sections */}
                <Accordion type="multiple" defaultValue={["contact", "notes", "ai-agents"]} className="space-y-1 mt-1 min-w-0">
                  {/* Contact */}
                  <AccordionItem value="contact" className="border rounded-lg px-3">
                    <AccordionTrigger className="py-2 hover:no-underline">
                      <div className="flex items-center gap-2 text-sm">
                        <User className="h-4 w-4 text-orange-600" />
                        <span>Contato</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-3">
                      <div className="space-y-2 text-sm">
                        {contactName && (
                          <div>
                            <span className="text-muted-foreground text-xs">Nome:</span>
                            <p className="font-medium">{contactName}</p>
                          </div>
                        )}
                        {contactPhone && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Phone className="h-3 w-3" />
                            <span>{contactPhone}</span>
                          </div>
                        )}
                        {selectedDeal?.contacts && selectedDeal.contacts.length > 0 && (
                          <div className="mt-2 pt-2 border-t">
                            <span className="text-muted-foreground text-xs block mb-1">Contatos da negociação:</span>
                            {selectedDeal.contacts.map(c => (
                              <div key={c.id} className="flex items-center gap-2 text-xs py-1">
                                <User className="h-3 w-3 text-muted-foreground" />
                                <span>{c.name}</span>
                                {c.is_primary && <Badge variant="secondary" className="text-[9px] px-1">Principal</Badge>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Notes */}
                  <AccordionItem value="notes" className="border rounded-lg px-3">
                    <AccordionTrigger className="py-2 hover:no-underline">
                      <div className="flex items-center gap-2 text-sm">
                        <StickyNote className="h-4 w-4 text-amber-500" />
                        <span>Anotações</span>
                        {notes.length > 0 && (
                          <Badge variant="secondary" className="text-[10px] px-1.5">{notes.length}</Badge>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-3">
                      <div className="space-y-3">
                        {/* New note input */}
                        <div>
                          <Textarea
                            placeholder="Nova anotação..."
                            value={newNote}
                            onChange={(e) => setNewNote(e.target.value)}
                            rows={2}
                            className="resize-none text-xs"
                          />
                          <Button
                            size="sm"
                            className="mt-2 w-full h-7 text-xs"
                            onClick={handleCreateNote}
                            disabled={!newNote.trim() || savingNote}
                          >
                            {savingNote ? (
                              <Loader2 className="h-3 w-3 animate-spin mr-1" />
                            ) : (
                              <Plus className="h-3 w-3 mr-1" />
                            )}
                            Adicionar
                          </Button>
                        </div>

                        {/* Notes list */}
                        {loadingNotes ? (
                          <div className="flex justify-center py-4">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          </div>
                        ) : notes.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-2">
                            Nenhuma anotação
                          </p>
                        ) : (
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {notes.slice(0, 5).map((note) => (
                              <div
                                key={note.id}
                                className="p-2 rounded bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/30 text-xs"
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <span className="font-medium truncate">{note.user_name || 'Usuário'}</span>
                                  <span className="text-[10px] text-muted-foreground">
                                    {format(new Date(note.created_at), "dd/MM HH:mm", { locale: ptBR })}
                                  </span>
                                </div>
                                <p className="whitespace-pre-wrap break-words line-clamp-3">{note.content}</p>
                              </div>
                            ))}
                            {notes.length > 5 && (
                              <p className="text-xs text-muted-foreground text-center">
                                +{notes.length - 5} anotações
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Task Boards Quick Access */}
                  <AccordionItem value="task-boards" className="border rounded-lg px-3">
                    <AccordionTrigger className="py-2 hover:no-underline">
                      <div className="flex items-center gap-2 text-sm">
                        <ClipboardList className="h-4 w-4 text-indigo-500" />
                        <span>Quadro de Tarefas</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-3">
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">
                          Acesse o Kanban de tarefas para criar e gerenciar atividades.
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full h-7 text-xs"
                          onClick={() => window.open('/crm/tarefas', '_blank')}
                        >
                          <ExternalLink className="h-3 w-3 mr-1" />
                          Abrir Quadro de Tarefas
                        </Button>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* AI Agents */}
                  <AccordionItem value="ai-agents" className="border rounded-lg px-3">
                    <AccordionTrigger className="py-2 hover:no-underline">
                      <div className="flex items-center gap-2 text-sm">
                        <Bot className="h-4 w-4 text-primary" />
                        <span>Agentes IA</span>
                        {aiAgents.length > 0 && (
                          <Badge variant="secondary" className="text-[10px] px-1.5">{aiAgents.length}</Badge>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-3">
                      {loadingAgents ? (
                        <div className="flex justify-center py-4">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                      ) : aiAgents.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-2">
                          Nenhum agente ativo disponível
                        </p>
                      ) : consultAgent ? (
                        /* ===== AI Consultation Panel ===== */
                        <div className="space-y-3">
                          {/* Header with selected agent */}
                          <div className="flex items-center gap-2">
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setConsultAgent(null); setConsultResponse(""); setConsultPrompt(""); }}>
                              <ArrowLeft className="h-4 w-4" />
                            </Button>
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                <Brain className="h-3.5 w-3.5 text-primary" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-medium truncate">{consultAgent.name}</p>
                              </div>
                            </div>
                          </div>

                          {/* Quick action buttons */}
                          <div className="grid grid-cols-2 gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-[10px] gap-1"
                              onClick={() => handleConsultAgent("Analise esta conversa e me dê um resumo do que o cliente precisa e sugestões de como proceder.")}
                              disabled={consulting}
                            >
                              <Sparkles className="h-3 w-3" />
                              Analisar
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-[10px] gap-1"
                              onClick={() => handleConsultAgent("Elabore uma resposta profissional e empática para enviar ao cliente baseada no contexto da conversa.")}
                              disabled={consulting}
                            >
                              <MessageSquare className="h-3 w-3" />
                              Elaborar resposta
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-[10px] gap-1"
                              onClick={() => handleConsultAgent("Me ajude a fechar esta negociação. Sugira argumentos de venda, gatilhos mentais e frases de fechamento adequadas ao contexto.")}
                              disabled={consulting}
                            >
                              <Trophy className="h-3 w-3" />
                              Ajuda fechamento
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-[10px] gap-1"
                              onClick={() => handleConsultAgent("Qualifique este lead baseado na conversa. Identifique nível de interesse, urgência, orçamento e próximos passos recomendados.")}
                              disabled={consulting}
                            >
                              <ClipboardList className="h-3 w-3" />
                              Qualificar lead
                            </Button>
                          </div>

                          {/* Custom prompt */}
                          <div className="flex gap-1.5">
                            <Textarea
                              placeholder="Ou digite sua pergunta..."
                              value={consultPrompt}
                              onChange={(e) => setConsultPrompt(e.target.value)}
                              rows={2}
                              className="resize-none text-xs flex-1"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey && consultPrompt.trim()) {
                                  e.preventDefault();
                                  handleConsultAgent();
                                }
                              }}
                            />
                            <Button
                              size="icon"
                              className="h-auto w-8 flex-shrink-0"
                              onClick={() => handleConsultAgent()}
                              disabled={consulting || !consultPrompt.trim()}
                            >
                              {consulting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                            </Button>
                          </div>

                          {/* AI Response */}
                          {consulting && (
                            <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
                              <Loader2 className="h-4 w-4 animate-spin text-primary flex-shrink-0" />
                              <p className="text-xs text-muted-foreground">Analisando conversa...</p>
                            </div>
                          )}

                          {consultResponse && !consulting && (
                            <div className="space-y-2">
                              <div className="p-3 rounded-lg bg-muted/50 border text-xs leading-relaxed whitespace-pre-wrap max-h-[300px] overflow-y-auto">
                                {consultResponse}
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-full h-7 text-[10px] gap-1"
                                onClick={handleCopyResponse}
                              >
                                <Copy className="h-3 w-3" />
                                Copiar resposta
                              </Button>
                            </div>
                          )}

                          {/* Activate for autonomous mode */}
                          <div className="pt-2 border-t">
                            <Button
                              size="sm"
                              variant="default"
                              className="w-full h-7 text-[10px] gap-1"
                              onClick={() => handleActivateAgent(consultAgent)}
                              disabled={activatingAgent === consultAgent.id}
                            >
                              {activatingAgent === consultAgent.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Zap className="h-3 w-3" />
                              )}
                              Ativar atendimento autônomo
                            </Button>
                          </div>
                        </div>
                      ) : (
                        /* ===== Agent List ===== */
                        <div className="space-y-2">
                          {aiAgents.map((agent) => (
                            <div
                              key={agent.id}
                              className="flex items-center gap-2 p-2 rounded-lg border bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer"
                              onClick={() => setConsultAgent(agent)}
                            >
                              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                <Sparkles className="h-4 w-4 text-primary" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium truncate">{agent.name}</p>
                                {agent.description && (
                                  <p className="text-[10px] text-muted-foreground break-words whitespace-normal">{agent.description}</p>
                                )}
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {agent.capabilities.slice(0, 3).map((cap) => (
                                    <Badge key={cap} variant="outline" className="text-[9px] px-1 py-0">
                                      {cap === 'respond_messages' ? 'Respostas' :
                                       cap === 'qualify_leads' ? 'Qualificar' :
                                       cap === 'create_deals' ? 'Negociações' :
                                       cap === 'summarize_history' ? 'Resumos' :
                                       cap === 'suggest_actions' ? 'Sugestões' :
                                       cap === 'generate_content' ? 'Conteúdo' :
                                       cap === 'schedule_meetings' ? 'Reuniões' :
                                       cap === 'read_files' ? 'Arquivos' :
                                       cap}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                              <Brain className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            </div>
                          ))}
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="docs" className="flex-1 flex flex-col overflow-hidden m-0">
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 text-primary" />
                  Documentos
                </h3>
                <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1 px-1.5">
                  <FilePlus className="h-3 w-3" />
                  Novo
                </Button>
              </div>

              {/* Docs List */}
              <div className="space-y-2">
                <div className="text-center py-6 text-muted-foreground bg-muted/20 rounded-lg border border-dashed border-muted-foreground/30">
                  <FileText className="h-6 w-6 mx-auto mb-1 opacity-20" />
                  <p className="text-[10px]">Nenhum documento vinculado.</p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <FileSignature className="h-3.5 w-3.5 text-primary" />
                  Assinaturas
                </h3>
                <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1 px-1.5">
                  <Send className="h-3 w-3" />
                  Solicitar
                </Button>
              </div>

              {/* Signatures List */}
              <div className="space-y-2">
                <div className="text-center py-6 text-muted-foreground bg-muted/20 rounded-lg border border-dashed border-muted-foreground/30">
                  <FileSignature className="h-6 w-6 mx-auto mb-1 opacity-20" />
                  <p className="text-[10px]">Nenhuma assinatura pendente.</p>
                </div>
              </div>
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* Task Dialog */}
      <TaskDialog
        task={null}
        dealId={selectedDeal?.id}
        contactPhone={contactPhone}
        contactName={contactName}
        open={showTaskDialog}
        onOpenChange={setShowTaskDialog}
      />

      {/* Meeting Dialog */}
      <MeetingScheduleDialog
        open={showMeetingDialog}
        onOpenChange={setShowMeetingDialog}
        dealId={selectedDeal?.id}
        contactName={contactName}
        contactPhone={contactPhone}
      />

      {/* Email Dialog */}
      <SendEmailDialog
        open={showEmailDialog}
        onOpenChange={setShowEmailDialog}
        toName={contactName || undefined}
        contextType={selectedDeal ? "deal" : "chat"}
        contextId={selectedDeal?.id || conversationId}
        variables={{
          nome: contactName || "",
          telefone: contactPhone || "",
          empresa: company?.name || "",
        }}
      />

      {/* Deal Detail Dialog */}
      <DealDetailDialog
        deal={selectedDeal || null}
        open={showDealDetailDialog}
        onOpenChange={(open) => {
          setShowDealDetailDialog(open);
          if (!open) {
            refetchDeals();
          }
        }}
      />

      {/* Enroll in Sequence Dialog */}
      <EnrollSequenceDialog
        open={showSequenceDialog}
        onOpenChange={setShowSequenceDialog}
        contactPhone={contactPhone}
        contactName={contactName}
        conversationId={conversationId}
        dealId={selectedDeal?.id}
      />

      {/* Company Creation Dialog */}
      <CompanyDialog
        company={null}
        open={showCompanyDialog}
        onOpenChange={setShowCompanyDialog}
        onCreated={handleCreateAndAssignCompany}
      />
    </div>
  );
}
