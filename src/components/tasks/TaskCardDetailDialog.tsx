import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { FileUploadInput } from "@/components/ui/file-upload-input";
import { TaskCard, TaskBoard, ChecklistItem, useTaskCardMutations, useTaskChecklists, useTaskChecklistMutations, useChecklistTemplates } from "@/hooks/use-task-boards";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganizations } from "@/hooks/use-organizations";
import { useCRMCompanies } from "@/hooks/use-crm";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  CalendarIcon, User, Tag, Paperclip, CheckSquare, Trash2, Plus, X,
  AlertTriangle, Clock, ArrowUp, ArrowDown, Minus, FileText, Link2,
  Building2, Briefcase, Users, Ban, Copy, ArrowRightLeft, StickyNote
} from "lucide-react";
import { format, parseISO, differenceInDays, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface TaskCardDetailDialogProps {
  card: TaskCard | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boardType: 'global' | 'personal';
  boards?: TaskBoard[];
  onDuplicate?: (card: TaskCard) => void;
  onMigrate?: (card: TaskCard) => void;
}

export function TaskCardDetailDialog({ card, open, onOpenChange, boardType, boards, onDuplicate, onMigrate }: TaskCardDetailDialogProps) {
  const { user } = useAuth();
  const { getMembers } = useOrganizations();
  const { updateCard, deleteCard } = useTaskCardMutations();
  const { data: checklists } = useTaskChecklists(card?.id);
  const { createChecklist, updateChecklist, deleteChecklist } = useTaskChecklistMutations();
  const { data: templates } = useChecklistTemplates();
  const { data: deals } = useQuery({
    queryKey: ["crm-deals-all-for-tasks"],
    queryFn: () => api<any[]>('/api/crm/deals?search=__all__'),
    staleTime: 60000,
  });
  const { data: companies } = useCRMCompanies("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>("medium");
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [assignedTo, setAssignedTo] = useState<string>("__none__");
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [attachments, setAttachments] = useState<{ url: string; name: string; type: string }[]>([]);
  const [coverColor, setCoverColor] = useState<string>("");
  const [orgMembers, setOrgMembers] = useState<any[]>([]);
  const [newChecklistTitle, setNewChecklistTitle] = useState("");
  const [newCheckItemTexts, setNewCheckItemTexts] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");

  const [dealId, setDealId] = useState<string>("__none__");
  const [contactId, setContactId] = useState<string>("__none__");
  const [companyId, setCompanyId] = useState<string>("__none__");

  // Status
  const [status, setStatus] = useState<'open' | 'completed' | 'archived'>('open');

  useEffect(() => {
    if (card) {
      setTitle(card.title);
      setDescription(card.description || "");
      setPriority(card.priority);
      setDueDate(card.due_date ? parseISO(card.due_date) : undefined);
      setAssignedTo(card.assigned_to || "__none__");
      setTags(card.tags || []);
      setAttachments(card.attachments || []);
      setCoverColor(card.cover_color || "");
      setDealId(card.deal_id || "__none__");
      setContactId(card.contact_id || "__none__");
      setCompanyId(card.company_id || "__none__");
      setStatus(card.status);
      setNotes((card as any).notes || "");
    }
  }, [card]);

  useEffect(() => {
    if (user?.organization_id && boardType === 'global') {
      getMembers(user.organization_id).then(setOrgMembers);
    }
  }, [user?.organization_id, boardType]);

  // Collect contacts from deals
  const dealContacts = useMemo(() => {
    const contacts: any[] = [];
    (deals || []).forEach((deal: any) => {
      deal.contacts?.forEach((c: any) => {
        if (!contacts.find(x => x.id === c.id)) contacts.push(c);
      });
    });
    return contacts;
  }, [deals]);

  // Check if all checklists are complete
  const allChecklistsComplete = useMemo(() => {
    if (!checklists || checklists.length === 0) return true;
    return checklists.every(cl => cl.items.length === 0 || cl.items.every(i => i.checked));
  }, [checklists]);

  const checklistTimelineItems = useMemo(() => {
    const flat = (checklists || []).flatMap((cl) =>
      (cl.items || [])
        .filter((item) => !!item.due_date)
        .map((item) => ({
          checklistTitle: cl.title,
          text: item.text,
          checked: item.checked,
          dueDate: parseISO(item.due_date as string),
        }))
    );
    return flat.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  }, [checklists]);

  const handleSave = () => {
    if (!card) return;
    updateCard.mutate({
      id: card.id,
      title,
      description,
      priority,
      due_date: dueDate?.toISOString(),
      assigned_to: assignedTo === "__none__" ? undefined : assignedTo || undefined,
      deal_id: dealId === "__none__" ? null : dealId,
      contact_id: contactId === "__none__" ? null : contactId,
      company_id: companyId === "__none__" ? null : companyId,
      tags,
      attachments,
      cover_color: coverColor || undefined,
      status,
    } as any);
    toast.success("Tarefa atualizada!");
  };

  const handleDelete = () => {
    if (!card) return;
    if (confirm("Excluir esta tarefa?")) {
      deleteCard.mutate(card.id);
      onOpenChange(false);
    }
  };

  const handleStatusChange = (newStatus: 'open' | 'completed' | 'archived') => {
    if (newStatus === 'completed' && !allChecklistsComplete) {
      toast.error("Complete todos os itens dos checklists antes de concluir a tarefa!");
      return;
    }
    setStatus(newStatus);
    if (card) {
      updateCard.mutate({ id: card.id, status: newStatus });
      toast.success(
        newStatus === 'completed' ? "Tarefa concluída!" :
        newStatus === 'archived' ? "Tarefa finalizada!" :
        "Tarefa reaberta!"
      );
    }
  };

  const handleAddTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()]);
      setNewTag("");
    }
  };

  const handleAddAttachment = (url: string) => {
    if (url) {
      const name = url.split('/').pop() || 'arquivo';
      setAttachments([...attachments, { url, name, type: 'file' }]);
    }
  };

  const handleAddChecklist = (templateId?: string) => {
    if (!card) return;
    createChecklist.mutate({
      cardId: card.id,
      title: newChecklistTitle || 'Checklist',
      template_id: templateId,
    });
    setNewChecklistTitle("");
  };

  const handleToggleCheckItem = (checklist: any, itemIdx: number) => {
    const items = [...checklist.items];
    items[itemIdx] = { ...items[itemIdx], checked: !items[itemIdx].checked };
    updateChecklist.mutate({ id: checklist.id, items });
  };

  const handleAddCheckItem = (checklistId: string, checklist: any) => {
    const text = newCheckItemTexts[checklistId]?.trim();
    if (!text) return;
    const items: ChecklistItem[] = [...checklist.items, { text, checked: false }];
    updateChecklist.mutate({ id: checklistId, items });
    setNewCheckItemTexts(prev => ({ ...prev, [checklistId]: "" }));
  };

  const handleRemoveCheckItem = (checklist: any, itemIdx: number) => {
    const items = checklist.items.filter((_: any, i: number) => i !== itemIdx);
    updateChecklist.mutate({ id: checklist.id, items });
  };

  const handleSetCheckItemDueDate = (checklist: any, itemIdx: number, date: Date | undefined) => {
    const items = [...checklist.items];
    items[itemIdx] = { ...items[itemIdx], due_date: date?.toISOString() };
    updateChecklist.mutate({ id: checklist.id, items });
  };

  const priorityConfig: Record<string, { label: string; color: string; icon: any }> = {
    low: { label: "Baixa", color: "bg-muted text-muted-foreground", icon: ArrowDown },
    medium: { label: "Média", color: "bg-yellow-100 text-yellow-700", icon: Minus },
    high: { label: "Alta", color: "bg-orange-100 text-orange-700", icon: ArrowUp },
    urgent: { label: "Urgente", color: "bg-red-100 text-red-700", icon: AlertTriangle },
  };

  const coverColors = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#6366f1'];

  if (!card) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>{card.title}</DialogTitle>
        </DialogHeader>
        {coverColor && (
          <div className="h-8 rounded-t-lg" style={{ backgroundColor: coverColor }} />
        )}

        <ScrollArea className="max-h-[85vh]">
          <div className="p-6 space-y-6">
            {/* Title */}
            <div className="space-y-2">
              <Input
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="text-xl font-bold border-none shadow-none px-0 focus-visible:ring-0"
                placeholder="Título da tarefa"
              />
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {card.created_by_name && <span>Criada por {card.created_by_name}</span>}
                {card.created_at && <span>• {format(parseISO(card.created_at), "dd/MM/yyyy", { locale: ptBR })}</span>}
              </div>
            </div>

            {/* Status + Priority row */}
            <div className="flex flex-wrap gap-3">
              {/* Status selector */}
              <Select value={status} onValueChange={(v) => handleStatusChange(v as any)}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">
                    <div className="flex items-center gap-2"><Clock className="h-3 w-3 text-blue-500" /> Em andamento</div>
                  </SelectItem>
                  <SelectItem value="completed">
                    <div className="flex items-center gap-2"><CheckSquare className="h-3 w-3 text-green-500" /> Concluída</div>
                  </SelectItem>
                  <SelectItem value="archived">
                    <div className="flex items-center gap-2"><Ban className="h-3 w-3 text-muted-foreground" /> Finalizada</div>
                  </SelectItem>
                </SelectContent>
              </Select>

              {!allChecklistsComplete && status !== 'completed' && (
                <span className="text-xs text-amber-600 flex items-center gap-1">
                  <Ban className="h-3 w-3" /> Checklists pendentes
                </span>
              )}

              <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(priorityConfig).map(([key, cfg]) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        <cfg.icon className="h-3 w-3" />
                        {cfg.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Duplicate / Migrate */}
              {onDuplicate && (
                <Button variant="outline" size="sm" onClick={() => onDuplicate(card)}>
                  <Copy className="h-3 w-3 mr-1" /> Duplicar
                </Button>
              )}
              {onMigrate && (
                <Button variant="outline" size="sm" onClick={() => onMigrate(card)}>
                  <ArrowRightLeft className="h-3 w-3 mr-1" /> Migrar
                </Button>
              )}
            </div>

            <Separator />

            {/* Meta fields grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Due date */}
              <div className="space-y-1">
                <label className="text-sm font-medium flex items-center gap-1">
                  <CalendarIcon className="h-3.5 w-3.5" /> Prazo
                </label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start", !dueDate && "text-muted-foreground")}>
                      {dueDate ? format(dueDate, "dd/MM/yyyy", { locale: ptBR }) : "Sem prazo"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={dueDate} onSelect={setDueDate} initialFocus className="pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Assigned to */}
              <div className="space-y-1">
                <label className="text-sm font-medium flex items-center gap-1">
                  <User className="h-3.5 w-3.5" /> Responsável
                </label>
                {boardType === 'global' ? (
                  <Select value={assignedTo} onValueChange={setAssignedTo}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar responsável" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sem responsável</SelectItem>
                      {orgMembers.filter(m => m.user_id).map(m => (
                        <SelectItem key={m.user_id} value={m.user_id}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="text-sm text-muted-foreground p-2 border rounded-md bg-muted/50">
                    {user?.name || "Você"}
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* CRM Linking */}
            <div className="space-y-3">
              <label className="text-sm font-medium flex items-center gap-1">
                <Link2 className="h-3.5 w-3.5" /> Vínculos CRM
              </label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground flex items-center gap-1">
                    <Briefcase className="h-3 w-3" /> Negociação
                  </label>
                  <Select value={dealId} onValueChange={setDealId}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Selecionar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Nenhuma</SelectItem>
                      {(deals || []).filter(d => d.id).map(d => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.title} {d.company_name ? `(${d.company_name})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground flex items-center gap-1">
                    <Building2 className="h-3 w-3" /> Empresa
                  </label>
                  <Select value={companyId} onValueChange={setCompanyId}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Selecionar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Nenhuma</SelectItem>
                      {(companies || []).filter(c => c.id).map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground flex items-center gap-1">
                    <Users className="h-3 w-3" /> Contato
                  </label>
                  <Select value={contactId} onValueChange={setContactId}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Selecionar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Nenhum</SelectItem>
                      {dealContacts.filter(c => c.id).map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {card.deal_title && dealId !== "__none__" && (
                  <Badge variant="outline" className="text-xs">🤝 {card.deal_title}</Badge>
                )}
                {card.company_name && companyId !== "__none__" && (
                  <Badge variant="outline" className="text-xs">🏢 {card.company_name}</Badge>
                )}
                {card.contact_name && contactId !== "__none__" && (
                  <Badge variant="outline" className="text-xs">👤 {card.contact_name}</Badge>
                )}
              </div>
            </div>

            {/* Cover color */}
            <div className="space-y-1">
              <label className="text-sm font-medium">Cor da capa</label>
              <div className="flex items-center gap-2 flex-wrap">
                {coverColors.map(c => (
                  <button
                    key={c}
                    className={cn("w-8 h-6 rounded-md border-2 transition-all", coverColor === c ? "border-foreground scale-110" : "border-transparent")}
                    style={{ backgroundColor: c }}
                    onClick={() => setCoverColor(coverColor === c ? "" : c)}
                  />
                ))}
                {coverColor && (
                  <Button variant="ghost" size="sm" onClick={() => setCoverColor("")}>
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>

            <Separator />

            {/* Description */}
            <div className="space-y-1">
              <label className="text-sm font-medium flex items-center gap-1">
                <FileText className="h-3.5 w-3.5" /> Descrição / Notas
              </label>
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Adicione uma descrição, anotações ou observações..."
                className="min-h-[100px]"
              />
            </div>

            {/* Tags */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1">
                <Tag className="h-3.5 w-3.5" /> Etiquetas
              </label>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag, i) => (
                  <Badge key={i} variant="secondary" className="gap-1">
                    {tag}
                    <X className="h-3 w-3 cursor-pointer" onClick={() => setTags(tags.filter((_, idx) => idx !== i))} />
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={newTag}
                  onChange={e => setNewTag(e.target.value)}
                  placeholder="Nova etiqueta"
                  className="flex-1"
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                />
                <Button variant="outline" size="sm" onClick={handleAddTag}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <Separator />

            {/* Checklists */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium flex items-center gap-1">
                  <CheckSquare className="h-3.5 w-3.5" /> Checklists
                </label>
                <div className="flex gap-2">
                  {templates && templates.length > 0 && (
                    <Select onValueChange={id => handleAddChecklist(id)}>
                      <SelectTrigger className="w-[160px] h-8 text-xs">
                        <SelectValue placeholder="Usar template" />
                      </SelectTrigger>
                      <SelectContent>
                        {templates.map(t => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Button variant="outline" size="sm" onClick={() => handleAddChecklist()}>
                    <Plus className="h-3 w-3 mr-1" /> Checklist
                  </Button>
                </div>
              </div>

              {checklists?.map(cl => {
                const total = cl.items.length;
                const done = cl.items.filter((i: ChecklistItem) => i.checked).length;
                const pct = total > 0 ? (done / total) * 100 : 0;

                return (
                  <div key={cl.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{cl.title}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{done}/{total}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteChecklist.mutate(cl.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <Progress value={pct} className="h-1.5" />
                    <div className="space-y-1">
                      {cl.items.map((item: ChecklistItem, idx: number) => (
                        <div key={idx} className="flex items-center gap-2 group">
                          <Checkbox
                            checked={item.checked}
                            onCheckedChange={() => handleToggleCheckItem(cl, idx)}
                          />
                          <span className={cn("text-sm flex-1", item.checked && "line-through text-muted-foreground")}>
                            {item.text}
                          </span>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" title="Prazo do item">
                                <CalendarIcon className={cn("h-3 w-3", item.due_date ? "text-primary" : "text-muted-foreground opacity-0 group-hover:opacity-100")} />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                              <Calendar
                                mode="single"
                                selected={item.due_date ? parseISO(item.due_date) : undefined}
                                onSelect={(d) => handleSetCheckItemDueDate(cl, idx, d)}
                                initialFocus
                                className="pointer-events-auto"
                              />
                            </PopoverContent>
                          </Popover>
                          {item.due_date && (
                            <span className="text-[10px] text-muted-foreground shrink-0">
                              {format(parseISO(item.due_date), "dd/MM", { locale: ptBR })}
                            </span>
                          )}
                          <Button
                            variant="ghost" size="icon"
                            className="h-5 w-5 opacity-0 group-hover:opacity-100"
                            onClick={() => handleRemoveCheckItem(cl, idx)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={newCheckItemTexts[cl.id] || ""}
                        onChange={e => setNewCheckItemTexts(prev => ({ ...prev, [cl.id]: e.target.value }))}
                        placeholder="Novo item..."
                        className="flex-1 h-8 text-sm"
                        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddCheckItem(cl.id, cl))}
                      />
                      <Button variant="outline" size="sm" className="h-8" onClick={() => handleAddCheckItem(cl.id, cl)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {checklistTimelineItems.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <label className="text-sm font-medium">Gantt do card (itens com prazo)</label>
                  <div className="space-y-1.5">
                    {checklistTimelineItems.map((item, idx) => {
                      const days = Math.max(0, Math.min(30, differenceInDays(startOfDay(item.dueDate), startOfDay(new Date()))));
                      const widthPct = Math.max(8, (days / 30) * 100);
                      return (
                        <div key={`${item.checklistTitle}-${idx}`} className="text-xs space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className={cn("truncate", item.checked && "line-through text-muted-foreground")}>{item.text}</span>
                            <span className="text-muted-foreground">{format(item.dueDate, "dd/MM", { locale: ptBR })}</span>
                          </div>
                          <div className="h-2 bg-muted rounded overflow-hidden">
                            <div
                              className={cn("h-2", item.checked ? "bg-primary/40" : days <= 2 ? "bg-red-500" : "bg-primary")}
                              style={{ width: `${widthPct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            <Separator />

            {/* Attachments */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1">
                <Paperclip className="h-3.5 w-3.5" /> Anexos
              </label>
              {attachments.map((att, i) => (
                <div key={i} className="flex items-center gap-2 p-2 border rounded-md">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <a href={att.url} target="_blank" rel="noopener" className="text-sm flex-1 truncate hover:underline">
                    {att.name}
                  </a>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setAttachments(attachments.filter((_, idx) => idx !== i))}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <FileUploadInput
                value=""
                onChange={handleAddAttachment}
                accept="*"
                placeholder="Upload ou cole URL do anexo"
                showPreview={false}
              />
            </div>

            <Separator />

            {/* Actions */}
            <div className="flex justify-between">
              <Button variant="destructive" size="sm" onClick={handleDelete}>
                <Trash2 className="h-4 w-4 mr-1" /> Excluir
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                <Button onClick={handleSave}>Salvar</Button>
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
