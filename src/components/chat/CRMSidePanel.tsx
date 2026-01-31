import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
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
  AlertTriangle,
  Plus,
  ExternalLink,
  Trophy,
  XCircle,
  Pause,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { 
  useCRMDealsByPhone, 
  useCRMFunnels, 
  useCRMFunnel,
  useCRMDealMutations,
  useCRMCompany,
  CRMDeal,
  CRMStage,
} from "@/hooks/use-crm";
import { useChat, ConversationNote } from "@/hooks/use-chat";
import { toast } from "sonner";
import { format, differenceInHours, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";

interface CRMSidePanelProps {
  conversationId: string;
  contactPhone: string | null;
  contactName: string | null;
  isOpen: boolean;
  onToggle: () => void;
}

export function CRMSidePanel({ 
  conversationId, 
  contactPhone, 
  contactName,
  isOpen, 
  onToggle 
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
  const { data: company } = useCRMCompany(selectedDeal?.company_id || null);
  
  // Deal mutations
  const { moveDeal } = useCRMDealMutations();
  
  // Notes
  const [notes, setNotes] = useState<ConversationNote[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const { getNotes, createNote } = useChat();

  // Load notes when panel opens
  useEffect(() => {
    if (isOpen && conversationId) {
      loadNotes();
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

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 0,
    }).format(value);
  };

  const openDealInCRM = () => {
    if (selectedDeal) {
      navigate(`/crm/negociacoes?deal=${selectedDeal.id}`);
    }
  };

  const createNewDeal = () => {
    // Navigate to CRM with pre-filled contact info
    const params = new URLSearchParams();
    if (contactPhone) params.set('phone', contactPhone);
    if (contactName) params.set('name', contactName);
    params.set('new', 'true');
    navigate(`/crm/negociacoes?${params.toString()}`);
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
  const ToggleButton = () => (
    <Button
      variant="outline"
      size="icon"
      onClick={onToggle}
      className={cn(
        "absolute top-1/2 -translate-y-1/2 z-20 h-12 w-6 rounded-l-md rounded-r-none border-r-0 bg-background shadow-md hover:bg-muted",
        isOpen ? "-left-6" : "-left-6"
      )}
      title={isOpen ? "Fechar painel CRM" : "Abrir painel CRM"}
    >
      {isOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
    </Button>
  );

  if (!isOpen) {
    return (
      <div className="relative">
        <ToggleButton />
      </div>
    );
  }

  return (
    <div className={cn(
      "relative flex flex-col bg-card border-l",
      isMobile 
        ? "fixed inset-y-0 right-0 z-50 w-full max-w-sm shadow-xl" 
        : "w-80 h-full"
    )}>
      <ToggleButton />
      
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b bg-muted/30">
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
          {selectedDeal && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-7 text-xs gap-1"
              onClick={openDealInCRM}
            >
              <ExternalLink className="h-3 w-3" />
              Abrir
            </Button>
          )}
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-7 text-xs gap-1 text-primary"
            onClick={createNewDeal}
          >
            <Plus className="h-3 w-3" />
            Nova
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        {loadingDeals ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : deals.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
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
              onClick={createNewDeal}
            >
              <Plus className="h-3 w-3" />
              Criar negociação
            </Button>
          </div>
        ) : (
          <div className="p-2">
            {/* Deal selector if multiple deals */}
            {deals.length > 1 && (
              <div className="mb-3 p-2 bg-muted/30 rounded-lg">
                <label className="text-xs text-muted-foreground mb-1 block">Negociação:</label>
                <Select value={selectedDealId || deals[0]?.id} onValueChange={setSelectedDealId}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {deals.map(deal => (
                      <SelectItem key={deal.id} value={deal.id} className="text-xs">
                        {deal.title} - {formatCurrency(deal.value)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <Accordion type="multiple" defaultValue={["deal", "stage", "notes"]} className="space-y-1">
              {/* Deal Info */}
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
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="text-muted-foreground text-xs">Título:</span>
                        <p className="font-medium">{selectedDeal.title}</p>
                      </div>
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

              {/* Company */}
              <AccordionItem value="company" className="border rounded-lg px-3">
                <AccordionTrigger className="py-2 hover:no-underline">
                  <div className="flex items-center gap-2 text-sm">
                    <Building2 className="h-4 w-4 text-purple-600" />
                    <span>Empresa</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-3">
                  {company ? (
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="text-muted-foreground text-xs">Nome:</span>
                        <p className="font-medium">{company.name}</p>
                      </div>
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
                  ) : selectedDeal?.company_name ? (
                    <p className="text-sm">{selectedDeal.company_name}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">Sem empresa vinculada</p>
                  )}
                </AccordionContent>
              </AccordionItem>

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
            </Accordion>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
