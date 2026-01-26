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
import { CRMDeal, CRMTask, CRMStage, useCRMDeal, useCRMDealMutations, useCRMTaskMutations, useCRMFunnel, useCRMCompanies } from "@/hooks/use-crm";
import { useContacts, Contact, ContactList } from "@/hooks/use-contacts";
import { Building2, User, Phone, Calendar as CalendarIcon, Clock, CheckCircle, Plus, Trash2, Paperclip, MessageSquare, ChevronRight, Edit2, Save, X, FileText, Image, Loader2, Upload, Search, UserPlus } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useUpload } from "@/hooks/use-upload";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

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

  // Scheduling states
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState<Date | undefined>(undefined);
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [scheduleNote, setScheduleNote] = useState("");

  // Company edit states
  const [isEditingCompany, setIsEditingCompany] = useState(false);
  const [companySearchOpen, setCompanySearchOpen] = useState(false);
  const [companySearch, setCompanySearch] = useState("");

  // Contact states
  const [contactLists, setContactLists] = useState<ContactList[]>([]);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [listContacts, setListContacts] = useState<Contact[]>([]);
  const [contactSearchOpen, setContactSearchOpen] = useState(false);
  const [contactSearch, setContactSearch] = useState("");

  const { data: fullDeal, isLoading } = useCRMDeal(deal?.id || null);
  const { data: funnelData } = useCRMFunnel(deal?.funnel_id || null);
  const { data: companies } = useCRMCompanies(companySearch);
  const { updateDeal, moveDeal, addContact, removeContact } = useCRMDealMutations();
  const { createTask, completeTask, deleteTask } = useCRMTaskMutations();
  const { uploadFile, isUploading } = useUpload();
  const contactsApi = useContacts();

  // Load contact lists
  useEffect(() => {
    if (open) {
      contactsApi.getLists().then(setContactLists).catch(console.error);
    }
  }, [open]);

  // Load contacts when list is selected
  useEffect(() => {
    if (selectedListId) {
      contactsApi.getContacts(selectedListId).then(setListContacts).catch(console.error);
    }
  }, [selectedListId]);

  const currentDeal = fullDeal || deal;
  const stages = funnelData?.stages || [];

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

  const handleScheduleReturn = () => {
    if (!scheduleDate || !currentDeal?.contacts?.length) {
      toast.error("Selecione uma data e certifique-se de que há contatos vinculados");
      return;
    }

    // Create a follow-up task
    const [hours, minutes] = scheduleTime.split(":").map(Number);
    const scheduledDate = new Date(scheduleDate);
    scheduledDate.setHours(hours, minutes, 0, 0);

    createTask.mutate({
      deal_id: deal.id,
      title: scheduleNote || "Retorno agendado",
      type: "follow_up",
      due_date: scheduledDate.toISOString(),
    });

    toast.success("Retorno agendado!");
    setScheduleOpen(false);
    setScheduleDate(undefined);
    setScheduleTime("09:00");
    setScheduleNote("");
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

                {/* Schedule Return Card */}
                <Card className="p-4 col-span-2">
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <CalendarIcon className="h-4 w-4" />
                    Agendar Retorno
                  </h4>
                  <div className="flex gap-3 flex-wrap">
                    <Popover open={scheduleOpen} onOpenChange={setScheduleOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn(!scheduleDate && "text-muted-foreground")}>
                          <CalendarIcon className="h-4 w-4 mr-2" />
                          {scheduleDate ? format(scheduleDate, "dd/MM/yyyy", { locale: ptBR }) : "Selecionar data"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 z-[100]" align="start">
                        <Calendar
                          mode="single"
                          selected={scheduleDate}
                          onSelect={(d) => {
                            setScheduleDate(d);
                          }}
                          disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                          locale={ptBR}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <Input
                      type="time"
                      value={scheduleTime}
                      onChange={(e) => setScheduleTime(e.target.value)}
                      className="w-28"
                    />
                    <Input
                      placeholder="Nota do retorno..."
                      value={scheduleNote}
                      onChange={(e) => setScheduleNote(e.target.value)}
                      className="flex-1 min-w-[200px]"
                    />
                    <Button onClick={handleScheduleReturn} disabled={!scheduleDate}>
                      Agendar
                    </Button>
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
                  Vincular Contato
                </h4>
                
                <div className="space-y-3">
                  {/* Select contact list */}
                  <div className="space-y-2">
                    <Label className="text-sm">Lista de Contatos</Label>
                    <Select
                      value={selectedListId || "none"}
                      onValueChange={(v) => setSelectedListId(v === "none" ? null : v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione uma lista" />
                      </SelectTrigger>
                      <SelectContent className="z-[200]">
                        <SelectItem value="none">Selecione...</SelectItem>
                        {contactLists.map((list) => (
                          <SelectItem key={list.id} value={list.id}>
                            {list.name} ({list.contact_count} contatos)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Search and select contacts */}
                  {selectedListId && (
                    <Popover open={contactSearchOpen} onOpenChange={setContactSearchOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start">
                          <Search className="h-4 w-4 mr-2" />
                          Buscar contato na lista...
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
                              {listContacts
                                .filter((c) => {
                                  const search = contactSearch.toLowerCase();
                                  return (
                                    c.name.toLowerCase().includes(search) ||
                                    c.phone.includes(search)
                                  );
                                })
                                .filter((c) => !fullDeal?.contacts?.some((dc: any) => dc.phone === c.phone))
                                .slice(0, 10)
                                .map((contact) => (
                                  <CommandItem
                                    key={contact.id}
                                    value={`${contact.name} ${contact.phone}`}
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
                                        <p className="font-medium">{contact.name}</p>
                                        <p className="text-xs text-muted-foreground">
                                          {contact.phone}
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
                  )}
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
  );
}
