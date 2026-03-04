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
import { TaskCard, useTaskCardMutations, useTaskChecklists, useTaskChecklistMutations, useChecklistTemplates } from "@/hooks/use-task-boards";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganizations } from "@/hooks/use-organizations";
import {
  CalendarIcon, User, Tag, Paperclip, CheckSquare, Trash2, Plus, X,
  AlertTriangle, Clock, ArrowUp, ArrowDown, Minus, FileText, Link2
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface TaskCardDetailDialogProps {
  card: TaskCard | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boardType: 'global' | 'personal';
}

export function TaskCardDetailDialog({ card, open, onOpenChange, boardType }: TaskCardDetailDialogProps) {
  const { user } = useAuth();
  const { getMembers } = useOrganizations();
  const { updateCard, deleteCard } = useTaskCardMutations();
  const { data: checklists } = useTaskChecklists(card?.id);
  const { createChecklist, updateChecklist, deleteChecklist } = useTaskChecklistMutations();
  const { data: templates } = useChecklistTemplates();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>("medium");
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [assignedTo, setAssignedTo] = useState<string>("");
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [attachments, setAttachments] = useState<{ url: string; name: string; type: string }[]>([]);
  const [coverColor, setCoverColor] = useState<string>("");
  const [orgMembers, setOrgMembers] = useState<any[]>([]);
  const [newChecklistTitle, setNewChecklistTitle] = useState("");
  const [newCheckItemTexts, setNewCheckItemTexts] = useState<Record<string, string>>({});

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
    }
  }, [card]);

  useEffect(() => {
    if (user?.organization_id && boardType === 'global') {
      getMembers(user.organization_id).then(setOrgMembers);
    }
  }, [user?.organization_id, boardType]);

  const handleSave = () => {
    if (!card) return;
    updateCard.mutate({
      id: card.id,
      title,
      description,
      priority,
      due_date: dueDate?.toISOString(),
      assigned_to: assignedTo === "__none__" ? undefined : assignedTo || undefined,
      tags,
      attachments,
      cover_color: coverColor || undefined,
    });
    toast.success("Tarefa atualizada!");
  };

  const handleDelete = () => {
    if (!card) return;
    if (confirm("Excluir esta tarefa?")) {
      deleteCard.mutate(card.id);
      onOpenChange(false);
    }
  };

  const handleToggleComplete = () => {
    if (!card) return;
    const newStatus = card.status === 'completed' ? 'open' : 'completed';
    updateCard.mutate({ id: card.id, status: newStatus });
    toast.success(newStatus === 'completed' ? "Tarefa concluída!" : "Tarefa reaberta!");
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
    const items = [...checklist.items, { text, checked: false }];
    updateChecklist.mutate({ id: checklistId, items });
    setNewCheckItemTexts(prev => ({ ...prev, [checklistId]: "" }));
  };

  const handleRemoveCheckItem = (checklist: any, itemIdx: number) => {
    const items = checklist.items.filter((_: any, i: number) => i !== itemIdx);
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
        {/* Cover color */}
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
              <Button
                variant={card.status === 'completed' ? "default" : "outline"}
                size="sm"
                onClick={handleToggleComplete}
                className={cn(card.status === 'completed' && "bg-green-600 hover:bg-green-700")}
              >
                <CheckSquare className="h-4 w-4 mr-1" />
                {card.status === 'completed' ? 'Concluída' : 'Marcar como concluída'}
              </Button>

              <Select value={priority} onValueChange={(v) => setPriority(v as 'low' | 'medium' | 'high' | 'urgent')}>
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
                      {orgMembers.map(m => (
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
                <FileText className="h-3.5 w-3.5" /> Descrição
              </label>
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Adicione uma descrição detalhada..."
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
                const done = cl.items.filter(i => i.checked).length;
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
                      {cl.items.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-2 group">
                          <Checkbox
                            checked={item.checked}
                            onCheckedChange={() => handleToggleCheckItem(cl, idx)}
                          />
                          <span className={cn("text-sm flex-1", item.checked && "line-through text-muted-foreground")}>
                            {item.text}
                          </span>
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

            {/* Linked deal/contact */}
            {(card.deal_title || card.contact_name) && (
              <>
                <Separator />
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-1">
                    <Link2 className="h-3.5 w-3.5" /> Vínculos
                  </label>
                  {card.deal_title && (
                    <Badge variant="outline">
                      🤝 Negociação: {card.deal_title}
                    </Badge>
                  )}
                  {card.contact_name && (
                    <Badge variant="outline">
                      👤 Contato: {card.contact_name}
                    </Badge>
                  )}
                </div>
              </>
            )}

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
