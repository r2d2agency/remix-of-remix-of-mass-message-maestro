import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { CRMTask, useCRMTaskMutations } from "@/hooks/use-crm";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGoogleCalendarStatus } from "@/hooks/use-google-calendar";
import { toast } from "sonner";
import { Video, Users, Calendar, X, Plus, Mail, Loader2, ExternalLink, Bell, MessageSquare } from "lucide-react";
import { Switch } from "@/components/ui/switch";

interface TaskDialogProps {
  task: CRMTask | null;
  dealId?: string;
  companyId?: string;
  contactPhone?: string | null;
  contactName?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: Date | null;
}

interface OrgMember {
  user_id: string;
  name: string;
  email: string;
  role: string;
}

// Fetch organization members for assignment
function useOrgMembers(orgId: string | null) {
  return useQuery({
    queryKey: ["org-members", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const data = await api<OrgMember[]>(`/api/organizations/${orgId}/members`);
      return data;
    },
    enabled: !!orgId,
  });
}

// Create meeting with Google Meet
function useCreateMeetingWithMeet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      title: string;
      description?: string;
      startDateTime: string;
      endDateTime: string;
      addMeet: boolean;
      attendees: string[];
      dealId?: string;
    }) => {
      return api<{ success: boolean; eventId: string; htmlLink: string; meetLink?: string }>(
        "/api/google-calendar/events-with-meet",
        { method: "POST", body: data }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["google-calendar-status"] });
      queryClient.invalidateQueries({ queryKey: ["google-calendar-events"] });
      queryClient.invalidateQueries({ queryKey: ["crm-tasks"] });
    },
  });
}

export function TaskDialog({ task, dealId, companyId, contactPhone, contactName, open, onOpenChange, defaultDate }: TaskDialogProps) {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("task");
  const [priority, setPriority] = useState("medium");
  const [dueDate, setDueDate] = useState("");
  const [endTime, setEndTime] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  
  // Meeting-specific state
  const [addGoogleMeet, setAddGoogleMeet] = useState(false);
  const [selectedAttendees, setSelectedAttendees] = useState<string[]>([]);
  const [externalEmail, setExternalEmail] = useState("");
  const [externalEmails, setExternalEmails] = useState<string[]>([]);

  // Reminder state
  const [reminderMinutes, setReminderMinutes] = useState<string>("");
  const [reminderWhatsapp, setReminderWhatsapp] = useState(false);
  const [reminderPopup, setReminderPopup] = useState(true);

  const { data: members } = useOrgMembers(user?.organization_id || null);
  const { data: googleStatus } = useGoogleCalendarStatus();
  const { createTask, updateTask } = useCRMTaskMutations();
  const createMeeting = useCreateMeetingWithMeet();

  const isGoogleConnected = googleStatus?.connected === true;

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || "");
      setType(task.type);
      setPriority(task.priority);
      setDueDate(task.due_date ? task.due_date.slice(0, 16) : "");
      setEndTime("");
      setAssignedTo(task.assigned_to || "");
      setAddGoogleMeet(false);
      setSelectedAttendees([]);
      setExternalEmails([]);
      setReminderMinutes(task.reminder_minutes ? String(task.reminder_minutes) : "");
      setReminderWhatsapp(task.reminder_whatsapp ?? false);
      setReminderPopup(task.reminder_popup ?? true);
    } else {
      setTitle("");
      setDescription("");
      setType("task");
      setPriority("medium");
      // Set default date if provided
      if (defaultDate) {
        const dateStr = defaultDate.toISOString().slice(0, 16);
        setDueDate(dateStr);
        // Default end time = start + 1 hour
        const endDate = new Date(defaultDate.getTime() + 60 * 60 * 1000);
        setEndTime(endDate.toISOString().slice(0, 16));
      } else {
        setDueDate("");
        setEndTime("");
      }
      setAssignedTo(user?.id || "");
      setAddGoogleMeet(false);
      setSelectedAttendees([]);
      setExternalEmails([]);
      setExternalEmail("");
      setReminderMinutes("15");
      setReminderWhatsapp(false);
      setReminderPopup(true);
    }
  }, [task, open, user, defaultDate]);

  // When type changes to meeting and Google is connected, default to addGoogleMeet
  useEffect(() => {
    if (type === "meeting" && isGoogleConnected && !task) {
      setAddGoogleMeet(true);
    } else if (type !== "meeting") {
      setAddGoogleMeet(false);
      setSelectedAttendees([]);
      setExternalEmails([]);
    }
  }, [type, isGoogleConnected, task]);

  // When due date changes, auto-update end time
  useEffect(() => {
    if (dueDate && !endTime) {
      const start = new Date(dueDate);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      setEndTime(end.toISOString().slice(0, 16));
    }
  }, [dueDate]);

  const toggleAttendee = (userId: string) => {
    setSelectedAttendees((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const addExternalEmail = () => {
    const email = externalEmail.trim().toLowerCase();
    if (email && email.includes("@") && !externalEmails.includes(email)) {
      setExternalEmails([...externalEmails, email]);
      setExternalEmail("");
    }
  };

  const removeExternalEmail = (email: string) => {
    setExternalEmails(externalEmails.filter((e) => e !== email));
  };

  const handleSave = async () => {
    if (!title.trim()) return;

    // If it's a meeting with Google Meet, create via Google Calendar API
    if (type === "meeting" && addGoogleMeet && isGoogleConnected && dueDate) {
      try {
        // Build attendee list
        const memberEmails = members
          ?.filter((m) => selectedAttendees.includes(m.user_id))
          .map((m) => m.email) || [];
        const allAttendees = [...memberEmails, ...externalEmails];

        const startDateTime = dueDate.includes("T") ? dueDate : `${dueDate}T09:00`;
        const endDateTime = endTime || new Date(new Date(startDateTime).getTime() + 60 * 60 * 1000).toISOString().slice(0, 16);

        const result = await createMeeting.mutateAsync({
          title,
          description,
          startDateTime: `${startDateTime}:00`,
          endDateTime: `${endDateTime}:00`,
          addMeet: true,
          attendees: allAttendees,
          dealId,
        });

        toast.success("Reunião criada com Google Meet!", {
          description: result.meetLink ? "Link do Meet gerado" : "Evento criado no calendário",
          action: result.htmlLink
            ? {
                label: "Abrir",
                onClick: () => window.open(result.htmlLink, "_blank"),
              }
            : undefined,
        });

        onOpenChange(false);
        return;
      } catch (error: any) {
        toast.error("Erro ao criar reunião", {
          description: error.message || "Tente novamente",
        });
        return;
      }
    }

    // Otherwise, create as regular CRM task
    const reminderMins = reminderMinutes ? parseInt(reminderMinutes) : undefined;
    const data = {
      title,
      description,
      type: type as CRMTask['type'],
      priority: priority as CRMTask['priority'],
      due_date: dueDate || undefined,
      assigned_to: assignedTo || undefined,
      deal_id: dealId,
      company_id: companyId,
      reminder_minutes: reminderMins,
      reminder_whatsapp: reminderWhatsapp,
      reminder_popup: reminderPopup,
    };

    if (task) {
      updateTask.mutate({ id: task.id, ...data });
    } else {
      createTask.mutate(data);
    }

    onOpenChange(false);
  };

  const typeOptions = [
    { value: "task", label: "Tarefa" },
    { value: "call", label: "Ligação" },
    { value: "email", label: "Email" },
    { value: "meeting", label: "Reunião" },
    { value: "follow_up", label: "Follow-up" },
  ];

  const priorityOptions = [
    { value: "low", label: "Baixa" },
    { value: "medium", label: "Média" },
    { value: "high", label: "Alta" },
    { value: "urgent", label: "Urgente" },
  ];

  const isSaving = createTask.isPending || updateTask.isPending || createMeeting.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-hidden flex flex-col" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{task ? "Editar Tarefa" : "Novo Compromisso"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto flex-1 pr-1">
          <div className="space-y-2">
            <Label>Título *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="O que precisa ser feito?"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {typeOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Prioridade</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {priorityOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Responsável</Label>
            <Select value={assignedTo || "none"} onValueChange={(v) => setAssignedTo(v === "none" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um responsável" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem responsável</SelectItem>
                {members?.map((member) => (
                  <SelectItem key={member.user_id} value={member.user_id}>
                    {member.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Início</Label>
              <Input
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            {type === "meeting" && (
              <div className="space-y-2">
                <Label>Fim</Label>
                <Input
                  type="datetime-local"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            )}
          </div>

          {/* Google Meet option - only for meetings when Google is connected */}
          {type === "meeting" && isGoogleConnected && (
            <div className="space-y-3 p-3 rounded-lg border bg-muted/30">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="add-google-meet"
                  checked={addGoogleMeet}
                  onCheckedChange={(checked) => setAddGoogleMeet(checked as boolean)}
                />
                <div className="flex items-center gap-2 flex-1">
                  <Video className="h-4 w-4 text-green-600" />
                  <Label htmlFor="add-google-meet" className="cursor-pointer flex-1">
                    Adicionar Google Meet
                  </Label>
                </div>
              </div>

              {addGoogleMeet && (
                <>
                  {/* Participants section */}
                  <div className="space-y-2 pt-2 border-t">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <Label className="text-sm">Participantes</Label>
                    </div>

                    {/* Organization members */}
                    {members && members.length > 0 && (
                      <div className="grid grid-cols-1 gap-1 max-h-24 overflow-y-auto">
                        {members.map((member) => (
                          <div
                            key={member.user_id}
                            className={`flex items-center gap-2 p-2 rounded-md cursor-pointer border transition-colors text-sm ${
                              selectedAttendees.includes(member.user_id)
                                ? "border-primary bg-primary/5"
                                : "border-transparent hover:bg-muted/50"
                            }`}
                            onClick={() => toggleAttendee(member.user_id)}
                          >
                            <Checkbox
                              checked={selectedAttendees.includes(member.user_id)}
                              onCheckedChange={() => toggleAttendee(member.user_id)}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{member.name}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* External emails */}
                    <div className="space-y-2">
                      <span className="text-xs text-muted-foreground">Convidados externos</span>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                          <Input
                            type="email"
                            placeholder="email@exemplo.com"
                            value={externalEmail}
                            onChange={(e) => setExternalEmail(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                addExternalEmail();
                              }
                            }}
                            className="pl-8 h-9"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-9 w-9"
                          onClick={addExternalEmail}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                      {externalEmails.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {externalEmails.map((email) => (
                            <Badge
                              key={email}
                              variant="secondary"
                              className="text-xs gap-1"
                            >
                              {email}
                              <X
                                className="h-3 w-3 cursor-pointer hover:text-destructive"
                                onClick={() => removeExternalEmail(email)}
                              />
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Show hint if meeting but Google not connected */}
          {type === "meeting" && !isGoogleConnected && (
            <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-sm text-amber-700 dark:text-amber-300">
              <p className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Conecte o Google Calendar nas Configurações para criar reuniões com Meet
              </p>
            </div>
          )}

          {/* Reminder Section */}
          {dueDate && (
            <div className="space-y-3 p-3 rounded-lg border bg-muted/30">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary" />
                <Label className="font-medium">Lembrete</Label>
              </div>
              <div className="space-y-2">
                <Select value={reminderMinutes || "none"} onValueChange={(v) => setReminderMinutes(v === "none" ? "" : v)}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Sem lembrete" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem lembrete</SelectItem>
                    <SelectItem value="5">5 minutos antes</SelectItem>
                    <SelectItem value="10">10 minutos antes</SelectItem>
                    <SelectItem value="15">15 minutos antes</SelectItem>
                    <SelectItem value="30">30 minutos antes</SelectItem>
                    <SelectItem value="60">1 hora antes</SelectItem>
                    <SelectItem value="120">2 horas antes</SelectItem>
                    <SelectItem value="1440">1 dia antes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {reminderMinutes && (
                <div className="space-y-2 pt-2 border-t">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Bell className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm">Popup na tela</span>
                    </div>
                    <Switch checked={reminderPopup} onCheckedChange={setReminderPopup} />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm">Enviar WhatsApp</span>
                    </div>
                    <Switch checked={reminderWhatsapp} onCheckedChange={setReminderWhatsapp} />
                  </div>
                  {reminderWhatsapp && (
                    <p className="text-xs text-muted-foreground">
                      A mensagem será enviada no WhatsApp do responsável
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalhes..."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!title.trim() || isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Salvando...
              </>
            ) : type === "meeting" && addGoogleMeet ? (
              <>
                <Video className="h-4 w-4 mr-2" />
                Criar Reunião
              </>
            ) : task ? (
              "Salvar"
            ) : (
              "Criar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
