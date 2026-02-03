import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { CRMDeal, CRMTask, CRMStage, useCRMDeal, useCRMDealMutations, useCRMTaskMutations, useCRMFunnel, useCRMCompanies } from "@/hooks/use-crm";
import { api } from "@/lib/api";
import { Building2, User, Phone, Calendar as CalendarIcon, Clock, CheckCircle, Plus, Trash2, Paperclip, MessageSquare, ChevronRight, Edit2, Save, X, FileText, Image, Loader2, Upload, Search, UserPlus, Building, Mail, Video, Send, ClipboardList } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useUpload } from "@/hooks/use-upload";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { CompanyDialog } from "./CompanyDialog";
import { SendEmailDialog } from "@/components/email/SendEmailDialog";
import { useAuth } from "@/contexts/AuthContext";
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface ChatContact {
  id: string;
  name: string | null;
  phone: string | null;
  jid: string | null;
  connection_id: string;
  connection_name: string | null;
}

interface DealDetailDialogProps {
  deal: CRMDeal | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface DealAttachment {
  id: string;
  name: string;
  url: string;
  mimetype: string;
  size: number;
  created_at: string;
}

export function DealDetailDialog({ deal, open, onOpenChange }: DealDetailDialogProps) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("details");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskType, setNewTaskType] = useState<string>("task");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [description, setDescription] = useState("");
  const [attachments, setAttachments] = useState<DealAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Task scheduling states (replacing "Agendar Retorno")
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState<Date | undefined>(undefined);
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [scheduleEndTime, setScheduleEndTime] = useState("10:00");
  const [scheduleTaskTitle, setScheduleTaskTitle] = useState("");
  const [scheduleTaskType, setScheduleTaskType] = useState<string>("follow_up");
  const [addMeetToSchedule, setAddMeetToSchedule] = useState(false);
  const [sendWhatsAppAfter, setSendWhatsAppAfter] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  
  // WhatsApp scheduled message states
  const [showScheduleWhatsApp, setShowScheduleWhatsApp] = useState(false);
  const [whatsAppDate, setWhatsAppDate] = useState<Date | undefined>(undefined);
  const [whatsAppTime, setWhatsAppTime] = useState("09:00");
  const [whatsAppContent, setWhatsAppContent] = useState("");
  const [whatsAppCalendarOpen, setWhatsAppCalendarOpen] = useState(false);
  const [isSchedulingWhatsApp, setIsSchedulingWhatsApp] = useState(false);
  const [scheduledWhatsAppMessages, setScheduledWhatsAppMessages] = useState<any[]>([]);

  // Company edit states
  const [isEditingCompany, setIsEditingCompany] = useState(false);
  const [companySearchOpen, setCompanySearchOpen] = useState(false);
  const [companySearch, setCompanySearch] = useState("");
  const [newCompanyDialogOpen, setNewCompanyDialogOpen] = useState(false);

  // Contact states
  const [agendaContacts, setAgendaContacts] = useState<ChatContact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [contactSearchOpen, setContactSearchOpen] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [showEmailDialog, setShowEmailDialog] = useState(false);

  const { data: fullDeal, isLoading } = useCRMDeal(deal?.id || null);
  const { data: funnelData } = useCRMFunnel(deal?.funnel_id || null);
  const { data: companies } = useCRMCompanies(companySearch);
  const { updateDeal, moveDeal, addContact, removeContact } = useCRMDealMutations();
  const { createTask, completeTask, deleteTask } = useCRMTaskMutations();
  const { uploadFile, isUploading } = useUpload();

  const currentDeal = fullDeal || deal;
  const stages = funnelData?.stages || [];

  // Load scheduled messages for deal's primary contact
  const loadScheduledMessages = async () => {
    const primaryContact = currentDeal?.contacts?.find(c => c.is_primary) || currentDeal?.contacts?.[0];
    if (!primaryContact?.phone) {
      setScheduledWhatsAppMessages([]);
      return;
    }
    try {
      const messages = await api<any[]>(`/api/chat/scheduled-messages-by-phone?phone=${encodeURIComponent(primaryContact.phone)}`);
      setScheduledWhatsAppMessages(messages.filter(m => m.status === 'pending'));
    } catch (error) {
      console.error("Error loading scheduled messages:", error);
      setScheduledWhatsAppMessages([]);
    }
  };

  // Load agenda contacts
  useEffect(() => {
    if (open) {
      setLoadingContacts(true);
      api<ChatContact[]>('/api/chat/contacts')
        .then(setAgendaContacts)
        .catch(console.error)
        .finally(() => setLoadingContacts(false));
      
      // Load scheduled WhatsApp messages for this deal's contacts
      loadScheduledMessages();
    }
  }, [open, currentDeal?.contacts]);

  // Sync description with deal
  useEffect(() => {
    if (currentDeal?.description) {
      setDescription(currentDeal.description);
    }
  }, [currentDeal?.description]);

  if (!deal) return null;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const handleStatusChange = (status: string) => {
    updateDeal.mutate({ 
      id: deal.id, 
      status: status as 'open' | 'won' | 'lost'
    });
  };

  const handleStageChange = (stageId: string) => {
    if (stageId !== currentDeal?.stage_id) {
      moveDeal.mutate({ id: deal.id, stage_id: stageId });
      toast.success("Etapa alterada com sucesso!");
    }
  };

  const handleSaveDescription = () => {
    updateDeal.mutate({ id: deal.id, description });
    setIsEditingDescription(false);
    toast.success("Descrição salva!");
  };

  const handleChangeCompany = (companyId: string, companyName: string) => {
    updateDeal.mutate({ id: deal.id, company_id: companyId } as any);
    setCompanySearchOpen(false);
    setIsEditingCompany(false);
    setCompanySearch("");
    toast.success(`Empresa alterada para ${companyName}`);
  };

  const handleAddTask = () => {
    if (!newTaskTitle.trim()) return;
    
    createTask.mutate({
      deal_id: deal.id,
      title: newTaskTitle,
      type: newTaskType as CRMTask['type'],
      due_date: newTaskDueDate || undefined,
    });
    
    setNewTaskTitle("");
    setNewTaskType("task");
    setNewTaskDueDate("");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const url = await uploadFile(file);
      if (url) {
        const newAttachment: DealAttachment = {
          id: crypto.randomUUID(),
          name: file.name,
          url,
          mimetype: file.type,
          size: file.size,
          created_at: new Date().toISOString(),
        };
        setAttachments(prev => [...prev, newAttachment]);
        toast.success("Arquivo anexado!");
      }
    } catch (error) {
      toast.error("Erro ao anexar arquivo");
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  const handleScheduleReturn = async () => {
    if (!scheduleDate || !deal) {
      toast.error("Selecione uma data");
      return;
    }

    setIsScheduling(true);
    
    try {
      const [hours, minutes] = scheduleTime.split(":").map(Number);
      const scheduledDate = new Date(scheduleDate);
      scheduledDate.setHours(hours, minutes, 0, 0);

      // If adding to Google Meet
      if (addMeetToSchedule) {
        const [endHours, endMinutes] = scheduleEndTime.split(":").map(Number);
        const endDate = new Date(scheduleDate);
        endDate.setHours(endHours, endMinutes, 0, 0);

        // Create meeting with Google Meet
        await api<{ success: boolean; meetLink?: string }>(
          "/api/google-calendar/events-with-meet",
          {
            method: "POST",
            body: {
              title: scheduleTaskTitle || `Reunião - ${currentDeal?.title}`,
              description: `Reunião agendada para a negociação: ${currentDeal?.title}`,
              startDateTime: scheduledDate.toISOString(),
              endDateTime: endDate.toISOString(),
              addMeet: true,
              attendees: [],
              dealId: deal.id,
            },
          }
        );
        
        toast.success("Reunião agendada no Google Calendar!");
      } else {
        // Create a task
        createTask.mutate({
          deal_id: deal.id,
          title: scheduleTaskTitle || "Tarefa agendada",
          type: scheduleTaskType as CRMTask['type'],
          due_date: scheduledDate.toISOString(),
        });
        
        toast.success("Tarefa agendada!");
      }

      // Reset form
      setScheduleOpen(false);
      setScheduleDate(undefined);
      setScheduleTime("09:00");
      setScheduleEndTime("10:00");
      setScheduleTaskTitle("");
      setScheduleTaskType("follow_up");
      setAddMeetToSchedule(false);
      
      // If user wants to send WhatsApp, navigate to chat
      if (sendWhatsAppAfter) {
        const primaryContact = currentDeal?.contacts?.find(c => c.is_primary) || currentDeal?.contacts?.[0];
        if (primaryContact?.phone) {
          onOpenChange(false);
          navigate(`/chat?phone=${primaryContact.phone}`);
        } else {
          toast.info("Nenhum contato vinculado para enviar WhatsApp");
        }
        setSendWhatsAppAfter(false);
      }
    } catch (error: any) {
      toast.error(error.message || "Erro ao agendar retorno");
    } finally {
      setIsScheduling(false);
    }
  };

  const handleOpenChat = () => {
    const primaryContact = currentDeal?.contacts?.find(c => c.is_primary) || currentDeal?.contacts?.[0];
    if (primaryContact?.phone) {
      // Navigate to chat with the contact
      onOpenChange(false);
      navigate(`/chat?phone=${primaryContact.phone}`);
    } else {
      toast.error("Nenhum contato vinculado");
    }
  };

  const taskTypeLabels: Record<string, string> = {
    task: "Tarefa",
    call: "Ligação",
    email: "Email",
    meeting: "Reunião",
    follow_up: "Follow-up",
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const getFileIcon = (mimetype: string) => {
    if (mimetype.startsWith("image/")) return <Image className="h-4 w-4" />;
    return <FileText className="h-4 w-4" />;
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col" aria-describedby={undefined}>
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-xl">{currentDeal?.title}</DialogTitle>
              <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                <Building2 className="h-4 w-4" />
                {isEditingCompany ? (
                  <Popover open={companySearchOpen} onOpenChange={setCompanySearchOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-7 gap-2">
                        <Search className="h-3 w-3" />
                        {currentDeal?.company_name || "Selecionar empresa"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[300px] p-0" align="start">
                      <Command>
                        <div className="p-2 border-b">
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full justify-start"
                            onClick={() => {
                              setNewCompanyDialogOpen(true);
                              setCompanySearchOpen(false);
                            }}
                          >
                            <Building className="h-4 w-4 mr-2" />
                            Criar nova empresa
                          </Button>
                        </div>
                        <CommandInput
                          placeholder="Buscar empresa..."
                          value={companySearch}
                          onValueChange={setCompanySearch}
                        />
                        <CommandList>
                          <CommandEmpty>Nenhuma empresa encontrada.</CommandEmpty>
                          <CommandGroup>
                            {companies?.slice(0, 10).map((company) => (
                              <CommandItem
                                key={company.id}
                                value={company.name}
                                onSelect={() => handleChangeCompany(company.id, company.name)}
                              >
                                <Building2 className="h-4 w-4 mr-2" />
                                <div>
                                  <p className="font-medium">{company.name}</p>
                                  {company.cnpj && (
                                    <p className="text-xs text-muted-foreground">{company.cnpj}</p>
                                  )}
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                ) : (
                  <button 
                    onClick={() => setIsEditingCompany(true)}
                    className="hover:underline flex items-center gap-1"
                  >
                    {currentDeal?.company_name}
                    <Edit2 className="h-3 w-3 opacity-50" />
                  </button>
                )}
                <span>•</span>
                <span className="font-semibold text-foreground">
                  {formatCurrency(currentDeal?.value || 0)}
                </span>
                {isEditingCompany && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 w-6 p-0"
                    onClick={() => setIsEditingCompany(false)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowEmailDialog(true)}>
                <Mail className="h-4 w-4 mr-2" />
                Email
              </Button>
              <Button variant="outline" size="sm" onClick={handleOpenChat}>
                <MessageSquare className="h-4 w-4 mr-2" />
                Chat
              </Button>
              <Select value={currentDeal?.status} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Em aberto</SelectItem>
                  <SelectItem value="won">Ganho</SelectItem>
                  <SelectItem value="lost">Perdido</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </DialogHeader>

        {/* Stage Pipeline */}
        <div className="py-4 border-b">
          <Label className="text-xs text-muted-foreground mb-2 block">Etapa do Funil</Label>
          <div className="flex items-center gap-1 overflow-x-auto pb-2">
            {stages.map((stage, index) => {
              const isActive = stage.id === currentDeal?.stage_id;
              const isPast = stages.findIndex(s => s.id === currentDeal?.stage_id) > index;
              
              return (
                <div key={stage.id} className="flex items-center">
                  <button
                    onClick={() => handleStageChange(stage.id!)}
                    className={cn(
                      "px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap",
                      isActive && "ring-2 ring-offset-2",
                      isPast && "opacity-60"
                    )}
                    style={{
                      backgroundColor: isActive ? stage.color : `${stage.color}20`,
                      color: isActive ? "#fff" : stage.color,
                      borderColor: stage.color,
                    }}
                  >
                    {stage.name}
                  </button>
                  {index < stages.length - 1 && (
                    <ChevronRight className="h-4 w-4 mx-1 text-muted-foreground flex-shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList>
            <TabsTrigger value="details">Detalhes</TabsTrigger>
            <TabsTrigger value="tasks">
              Tarefas
              {fullDeal?.tasks && fullDeal.tasks.filter(t => t.status === 'pending').length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">
                  {fullDeal.tasks.filter(t => t.status === 'pending').length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="contacts">Contatos</TabsTrigger>
            <TabsTrigger value="attachments">
              Arquivos
              {attachments.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">
                  {attachments.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="history">Histórico</TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 mt-4">
            <TabsContent value="details" className="m-0">
              <div className="grid grid-cols-2 gap-4">
                <Card className="p-4">
                  <h4 className="font-medium mb-3">Informações</h4>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Probabilidade</span>
                      <Badge variant="outline">{currentDeal?.probability}%</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Etapa</span>
                      <span>{currentDeal?.stage_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Responsável</span>
                      <span>{currentDeal?.owner_name || "Não definido"}</span>
                    </div>
                    {currentDeal?.expected_close_date && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Fechamento previsto</span>
                        <span>{format(parseISO(currentDeal.expected_close_date), "dd/MM/yyyy")}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Criado em</span>
                      <span>{format(parseISO(currentDeal?.created_at || new Date().toISOString()), "dd/MM/yyyy", { locale: ptBR })}</span>
                    </div>
                  </div>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium">Descrição</h4>
                    {!isEditingDescription ? (
                      <Button variant="ghost" size="sm" onClick={() => setIsEditingDescription(true)}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    ) : (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setIsEditingDescription(false)}>
                          <X className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={handleSaveDescription}>
                          <Save className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                  {isEditingDescription ? (
                    <Textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Adicione uma descrição..."
                      rows={4}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {currentDeal?.description || "Clique para adicionar uma descrição"}
                    </p>
                  )}
                  {currentDeal?.tags && currentDeal.tags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {currentDeal.tags.map((tag, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </Card>

                {/* Ações Rápidas Card */}
                <Card className="p-4 col-span-2">
                  <h4 className="font-medium mb-4 flex items-center gap-2">
                    <ClipboardList className="h-4 w-4" />
                    Ações Rápidas
                  </h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Agendar Tarefa Section */}
                    <div className="space-y-3 p-3 bg-muted/30 rounded-lg">
                      <h5 className="text-sm font-medium flex items-center gap-2">
                        <CalendarIcon className="h-4 w-4" />
                        Agendar Tarefa
                      </h5>
                      
                      <div className="space-y-2">
                        <Input
                          placeholder="Título da tarefa..."
                          value={scheduleTaskTitle}
                          onChange={(e) => setScheduleTaskTitle(e.target.value)}
                          className="text-sm"
                        />
                        
                        <div className="flex gap-2">
                          <Select value={scheduleTaskType} onValueChange={(val) => {
                            setScheduleTaskType(val);
                            // Auto enable Meet for meetings
                            if (val === "meeting") {
                              setAddMeetToSchedule(true);
                            } else {
                              setAddMeetToSchedule(false);
                            }
                          }}>
                            <SelectTrigger className="flex-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="follow_up">Follow-up</SelectItem>
                              <SelectItem value="call">Ligação</SelectItem>
                              <SelectItem value="meeting">Reunião</SelectItem>
                              <SelectItem value="email">Email</SelectItem>
                              <SelectItem value="task">Tarefa</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        
                        <div className="flex gap-2 flex-wrap">
                          <Popover open={scheduleOpen} onOpenChange={setScheduleOpen}>
                            <PopoverTrigger asChild>
                              <Button variant="outline" size="sm" className={cn("flex-1", !scheduleDate && "text-muted-foreground")}>
                                <CalendarIcon className="h-4 w-4 mr-2" />
                                {scheduleDate ? format(scheduleDate, "dd/MM", { locale: ptBR }) : "Data"}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0 z-[100]" align="start">
                              <Calendar
                                mode="single"
                                selected={scheduleDate}
                                onSelect={(d) => {
                                  setScheduleDate(d);
                                  setScheduleOpen(false);
                                }}
                                disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                                locale={ptBR}
                                initialFocus
                                className="p-3 pointer-events-auto"
                              />
                            </PopoverContent>
                          </Popover>
                          
                          <Input
                            type="time"
                            value={scheduleTime}
                            onChange={(e) => setScheduleTime(e.target.value)}
                            className="w-24"
                          />
                          
                          {scheduleTaskType === "meeting" && (
                            <>
                              <span className="text-muted-foreground text-sm self-center">até</span>
                              <Input
                                type="time"
                                value={scheduleEndTime}
                                onChange={(e) => setScheduleEndTime(e.target.value)}
                                className="w-24"
                              />
                            </>
                          )}
                        </div>
                        
                        {/* Meeting options - only show for meeting type */}
                        {scheduleTaskType === "meeting" && (
                          <div className="flex items-center gap-2 pt-1">
                            <Checkbox
                              id="add-meet"
                              checked={addMeetToSchedule}
                              onCheckedChange={(checked) => setAddMeetToSchedule(checked as boolean)}
                            />
                            <label htmlFor="add-meet" className="flex items-center gap-1.5 text-sm cursor-pointer">
                              <Video className="h-4 w-4 text-green-600" />
                              Google Meet
                            </label>
                          </div>
                        )}
                        
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="send-whats-after"
                            checked={sendWhatsAppAfter}
                            onCheckedChange={(checked) => setSendWhatsAppAfter(checked as boolean)}
                          />
                          <label htmlFor="send-whats-after" className="flex items-center gap-1.5 text-xs cursor-pointer text-muted-foreground">
                            Ir para chat após agendar
                          </label>
                        </div>
                        
                        <Button 
                          onClick={handleScheduleReturn} 
                          disabled={!scheduleDate || !scheduleTaskTitle.trim() || isScheduling}
                          className="w-full"
                          size="sm"
                        >
                          {isScheduling ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : scheduleTaskType === "meeting" && addMeetToSchedule ? (
                            <Video className="h-4 w-4 mr-2" />
                          ) : (
                            <CalendarIcon className="h-4 w-4 mr-2" />
                          )}
                          {scheduleTaskType === "meeting" && addMeetToSchedule ? "Agendar Reunião" : "Agendar Tarefa"}
                        </Button>
                      </div>
                    </div>
                    
                    {/* Agendar Mensagem WhatsApp Section */}
                    <div className="space-y-3 p-3 bg-muted/30 rounded-lg">
                      <h5 className="text-sm font-medium flex items-center gap-2">
                        <Send className="h-4 w-4 text-green-600" />
                        Agendar Mensagem WhatsApp
                      </h5>
                      
                      <div className="space-y-2">
                        <Textarea
                          placeholder="Digite a mensagem..."
                          value={whatsAppContent}
                          onChange={(e) => setWhatsAppContent(e.target.value)}
                          rows={2}
                          className="text-sm resize-none"
                        />
                        
                        <div className="flex gap-2 flex-wrap">
                          <Popover open={whatsAppCalendarOpen} onOpenChange={setWhatsAppCalendarOpen}>
                            <PopoverTrigger asChild>
                              <Button variant="outline" size="sm" className={cn("flex-1", !whatsAppDate && "text-muted-foreground")}>
                                <CalendarIcon className="h-4 w-4 mr-2" />
                                {whatsAppDate ? format(whatsAppDate, "dd/MM", { locale: ptBR }) : "Data"}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0 z-[100]" align="start">
                              <Calendar
                                mode="single"
                                selected={whatsAppDate}
                                onSelect={(d) => {
                                  setWhatsAppDate(d);
                                  setWhatsAppCalendarOpen(false);
                                }}
                                disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                                locale={ptBR}
                                initialFocus
                                className="p-3 pointer-events-auto"
                              />
                            </PopoverContent>
                          </Popover>
                          
                          <Input
                            type="time"
                            value={whatsAppTime}
                            onChange={(e) => setWhatsAppTime(e.target.value)}
                            className="w-24"
                          />
                        </div>
                        
                        <Button 
                          onClick={async () => {
                            if (!whatsAppDate || !whatsAppContent.trim()) {
                              toast.error("Preencha a mensagem e selecione uma data");
                              return;
                            }
                            
                            const primaryContact = currentDeal?.contacts?.find(c => c.is_primary) || currentDeal?.contacts?.[0];
                            if (!primaryContact?.phone) {
                              toast.error("Nenhum contato vinculado à negociação");
                              return;
                            }
                            
                            setIsSchedulingWhatsApp(true);
                            try {
                              const [hours, minutes] = whatsAppTime.split(":").map(Number);
                              const scheduledDate = new Date(whatsAppDate);
                              scheduledDate.setHours(hours, minutes, 0, 0);
                              
                              await api("/api/chat/schedule-message-by-phone", {
                                method: "POST",
                                body: {
                                  phone: primaryContact.phone,
                                  content: whatsAppContent,
                                  scheduled_at: scheduledDate.toISOString(),
                                },
                              });
                              
                              toast.success("Mensagem agendada!");
                              setWhatsAppContent("");
                              setWhatsAppDate(undefined);
                              setWhatsAppTime("09:00");
                              
                              // Reload scheduled messages
                              loadScheduledMessages();
                            } catch (error: any) {
                              toast.error(error.message || "Erro ao agendar mensagem");
                            } finally {
                              setIsSchedulingWhatsApp(false);
                            }
                          }}
                          disabled={!whatsAppDate || !whatsAppContent.trim() || isSchedulingWhatsApp || !currentDeal?.contacts?.length}
                          className="w-full"
                          size="sm"
                        >
                          {isSchedulingWhatsApp ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <Send className="h-4 w-4 mr-2" />
                          )}
                          Agendar Mensagem
                        </Button>
                        
                        {!currentDeal?.contacts?.length && (
                          <p className="text-xs text-muted-foreground text-center">
                            Vincule um contato para agendar mensagens
                          </p>
                        )}
                      </div>
                      
                      {/* Scheduled WhatsApp messages list */}
                      {scheduledWhatsAppMessages.length > 0 && (
                        <div className="mt-3 pt-3 border-t space-y-2">
                          <p className="text-xs text-muted-foreground">Mensagens agendadas:</p>
                          {scheduledWhatsAppMessages.slice(0, 3).map((msg) => (
                            <div key={msg.id} className="flex items-center gap-2 text-xs p-2 bg-background rounded">
                              <Send className="h-3 w-3 text-green-600" />
                              <span className="font-medium">
                                {format(parseISO(msg.scheduled_at), "dd/MM HH:mm", { locale: ptBR })}
                              </span>
                              <span className="text-muted-foreground truncate flex-1">
                                {msg.content?.slice(0, 30)}...
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="tasks" className="m-0">
              {/* New task form */}
              <Card className="p-4 mb-4">
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Nova Tarefa
                </h4>
                <div className="flex gap-2 flex-wrap">
                  <Input
                    placeholder="Título da tarefa"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    className="flex-1 min-w-[200px]"
                  />
                  <Select value={newTaskType} onValueChange={setNewTaskType}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="task">Tarefa</SelectItem>
                      <SelectItem value="call">Ligação</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="meeting">Reunião</SelectItem>
                      <SelectItem value="follow_up">Follow-up</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="datetime-local"
                    value={newTaskDueDate}
                    onChange={(e) => setNewTaskDueDate(e.target.value)}
                    className="w-48"
                  />
                  <Button onClick={handleAddTask} disabled={!newTaskTitle.trim()}>
                    Adicionar
                  </Button>
                </div>
              </Card>

              {/* Task list */}
              <div className="space-y-2">
                {fullDeal?.tasks?.map((task: CRMTask) => (
                  <Card key={task.id} className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => {
                            if (task.status === 'pending') {
                              completeTask.mutate(task.id);
                            }
                          }}
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            task.status === 'completed' 
                              ? 'bg-green-500 border-green-500 text-white' 
                              : 'border-muted-foreground hover:border-primary'
                          }`}
                        >
                          {task.status === 'completed' && <CheckCircle className="h-3 w-3" />}
                        </button>
                        <div>
                          <p className={`text-sm font-medium ${task.status === 'completed' ? 'line-through text-muted-foreground' : ''}`}>
                            {task.title}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="outline" className="text-[10px]">
                              {taskTypeLabels[task.type]}
                            </Badge>
                            {task.due_date && (
                              <span className="flex items-center gap-1">
                                <CalendarIcon className="h-3 w-3" />
                                {format(parseISO(task.due_date), "dd/MM HH:mm")}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteTask.mutate(task.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </Card>
                ))}
                {(!fullDeal?.tasks || fullDeal.tasks.length === 0) && (
                  <p className="text-center text-muted-foreground py-8">
                    Nenhuma tarefa vinculada
                  </p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="contacts" className="m-0">
              {/* Add contact section */}
              <Card className="p-4 mb-4">
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <UserPlus className="h-4 w-4" />
                  Vincular Contato da Agenda
                </h4>
                
                <div className="space-y-3">
                  {/* Search agenda contacts */}
                  <Popover open={contactSearchOpen} onOpenChange={setContactSearchOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start">
                        <Search className="h-4 w-4 mr-2" />
                        {loadingContacts ? "Carregando..." : "Buscar contato na agenda..."}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[350px] p-0 z-[200]" align="start">
                      <Command>
                        <CommandInput
                          placeholder="Buscar por nome ou telefone..."
                          value={contactSearch}
                          onValueChange={setContactSearch}
                        />
                        <CommandList>
                          <CommandEmpty>Nenhum contato encontrado.</CommandEmpty>
                          <CommandGroup>
                            {agendaContacts
                              .filter((c) => {
                                const search = contactSearch.toLowerCase();
                                const name = c.name || c.phone || "";
                                const phone = c.phone || "";
                                return (
                                  name.toLowerCase().includes(search) ||
                                  phone.includes(search)
                                );
                              })
                              .filter((c) => !fullDeal?.contacts?.some((dc: any) => dc.phone === c.phone))
                              .slice(0, 15)
                              .map((contact) => (
                                <CommandItem
                                  key={contact.id}
                                  value={`${contact.name || ""} ${contact.phone || ""}`}
                                  onSelect={() => {
                                    addContact.mutate({
                                      dealId: deal.id,
                                      contactId: contact.id,
                                      isPrimary: !fullDeal?.contacts?.length,
                                    });
                                    setContactSearchOpen(false);
                                    setContactSearch("");
                                    toast.success("Contato vinculado!");
                                  }}
                                >
                                  <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                                      <User className="h-4 w-4" />
                                    </div>
                                    <div>
                                      <p className="font-medium">{contact.name || contact.phone}</p>
                                      <p className="text-xs text-muted-foreground">
                                        {contact.phone} {contact.connection_name && `• ${contact.connection_name}`}
                                      </p>
                                    </div>
                                  </div>
                                </CommandItem>
                              ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              </Card>

              {/* Contact list */}
              <div className="space-y-2">
                {fullDeal?.contacts?.map((contact: any) => (
                  <Card key={contact.id} className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">
                            {contact.name}
                            {contact.is_primary && (
                              <Badge variant="secondary" className="ml-2 text-[10px]">Principal</Badge>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {contact.phone}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            onOpenChange(false);
                            navigate(`/chat?phone=${contact.phone}`);
                          }}
                        >
                          <MessageSquare className="h-4 w-4 mr-1" />
                          Chat
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            removeContact.mutate({ dealId: deal.id, contactId: contact.id });
                            toast.success("Contato removido!");
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
                {(!fullDeal?.contacts || fullDeal.contacts.length === 0) && (
                  <p className="text-center text-muted-foreground py-8">
                    Nenhum contato vinculado. Selecione uma lista e busque contatos acima.
                  </p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="attachments" className="m-0">
              <Card className="p-4 mb-4">
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Anexar Arquivo
                </h4>
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="w-full"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Carregando...
                    </>
                  ) : (
                    <>
                      <Paperclip className="h-4 w-4 mr-2" />
                      Selecionar arquivo
                    </>
                  )}
                </Button>
              </Card>

              <div className="space-y-2">
                {attachments.map((attachment) => (
                  <Card key={attachment.id} className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                          {getFileIcon(attachment.mimetype)}
                        </div>
                        <div>
                          <a
                            href={attachment.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-sm hover:underline"
                          >
                            {attachment.name}
                          </a>
                          <p className="text-xs text-muted-foreground">
                            {formatFileSize(attachment.size)} • {format(parseISO(attachment.created_at), "dd/MM/yyyy HH:mm")}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => handleRemoveAttachment(attachment.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </Card>
                ))}
                {attachments.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">
                    Nenhum arquivo anexado
                  </p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="history" className="m-0">
              <div className="space-y-3">
                {fullDeal?.history?.map((item: any) => (
                  <div key={item.id} className="flex gap-3 text-sm">
                    <div className="w-2 h-2 rounded-full bg-primary mt-2" />
                    <div className="flex-1">
                      <p>
                        <span className="font-medium">{item.user_name || "Sistema"}</span>
                        {" "}
                        {item.action === 'created' && "criou a negociação"}
                        {item.action === 'stage_changed' && `moveu de "${item.from_value}" para "${item.to_value}"`}
                        {item.action === 'value_changed' && `alterou o valor de ${item.from_value} para ${item.to_value}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(parseISO(item.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                  </div>
                ))}
                {(!fullDeal?.history || fullDeal.history.length === 0) && (
                  <p className="text-center text-muted-foreground py-8">
                    Nenhum histórico disponível
                  </p>
                )}
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>

    <CompanyDialog
      company={null}
      open={newCompanyDialogOpen}
      onOpenChange={(open) => {
        setNewCompanyDialogOpen(open);
        if (!open) {
          setCompanySearch("");
        }
      }}
    />

    <SendEmailDialog
      open={showEmailDialog}
      onOpenChange={setShowEmailDialog}
      toName={currentDeal?.contacts?.[0]?.name || ""}
      contextType="deal"
      contextId={deal?.id}
      variables={{
        nome: currentDeal?.contacts?.[0]?.name || "",
        telefone: currentDeal?.contacts?.[0]?.phone || "",
        empresa: currentDeal?.company_name || "",
        deal_title: currentDeal?.title || "",
        valor: currentDeal?.value ? formatCurrency(currentDeal.value) : "",
        etapa: currentDeal?.stage_name || "",
      }}
    />
    </>
  );
}
