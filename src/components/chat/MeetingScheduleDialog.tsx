import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Video, Users, Calendar, Clock, Loader2, X, Plus, Mail } from "lucide-react";

interface MeetingScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId?: string;
  contactName?: string | null;
  contactPhone?: string | null;
}

interface OrgMember {
  user_id: string;
  name: string;
  email: string;
  role: string;
}

// Fetch organization members
function useOrgMembers(orgId: string | null) {
  return useQuery({
    queryKey: ["org-members", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      return api<OrgMember[]>(`/api/organizations/${orgId}/members`);
    },
    enabled: !!orgId,
  });
}

// Create meeting with Google Meet
function useCreateMeeting() {
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
      queryClient.invalidateQueries({ queryKey: ["crm-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["crm-deals"] });
      queryClient.invalidateQueries({ queryKey: ["crm-deals-by-phone"] });
    },
  });
}

export function MeetingScheduleDialog({
  open,
  onOpenChange,
  dealId,
  contactName,
  contactPhone,
}: MeetingScheduleDialogProps) {
  const { user } = useAuth();
  const { data: members = [] } = useOrgMembers(user?.organization_id || null);
  const createMeeting = useCreateMeeting();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [addMeet, setAddMeet] = useState(true);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [externalEmail, setExternalEmail] = useState("");
  const [externalEmails, setExternalEmails] = useState<string[]>([]);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      const today = new Date().toISOString().split("T")[0];
      setDate(today);
      setTitle(contactName ? `Reunião com ${contactName}` : "Reunião");
      setDescription("");
      setStartTime("09:00");
      setEndTime("10:00");
      setAddMeet(true);
      setSelectedMembers([]);
      setExternalEmails([]);
      setExternalEmail("");
    }
  }, [open, contactName]);

  const toggleMember = (userId: string) => {
    setSelectedMembers((prev) =>
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

  const handleSubmit = async () => {
    if (!title.trim() || !date || !startTime || !endTime) {
      toast.error("Preencha título, data e horários");
      return;
    }

    // Build attendee list (member emails + external emails)
    const memberEmails = members
      .filter((m) => selectedMembers.includes(m.user_id))
      .map((m) => m.email);
    const allAttendees = [...memberEmails, ...externalEmails];

    const startDateTime = `${date}T${startTime}:00`;
    const endDateTime = `${date}T${endTime}:00`;

    try {
      const result = await createMeeting.mutateAsync({
        title,
        description,
        startDateTime,
        endDateTime,
        addMeet,
        attendees: allAttendees,
        dealId,
      });

      toast.success("Reunião agendada!", {
        description: result.meetLink ? "Link do Meet criado" : "Evento criado no calendário",
        action: result.htmlLink
          ? {
              label: "Abrir",
              onClick: () => window.open(result.htmlLink, "_blank"),
            }
          : undefined,
      });

      onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro ao agendar reunião", {
        description: error.message || "Tente novamente",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col" aria-describedby={undefined}>
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Agendar Reunião
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2 min-h-0">
          <div className="space-y-4 pb-4">
            {/* Title */}
            <div className="space-y-2">
              <Label>Título *</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Título da reunião"
              />
            </div>

            {/* Date & Time */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Data *</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Início *</Label>
                <Input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Fim *</Label>
                <Input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>

            {/* Google Meet toggle */}
            <div className="flex items-center space-x-2 p-3 rounded-lg border bg-muted/30">
              <Checkbox
                id="add-meet"
                checked={addMeet}
                onCheckedChange={(checked) => setAddMeet(checked as boolean)}
              />
              <div className="flex items-center gap-2 flex-1">
                <Video className="h-4 w-4 text-green-600" />
                <Label htmlFor="add-meet" className="cursor-pointer flex-1">
                  Adicionar Google Meet
                </Label>
              </div>
            </div>

            {/* Participants section */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <Label>Participantes</Label>
              </div>

              {/* Organization members */}
              {members.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs text-muted-foreground">Equipe</span>
                  <div className="grid grid-cols-1 gap-1 max-h-32 overflow-y-auto">
                    {members.map((member) => (
                      <div
                        key={member.user_id}
                        className={`flex items-center gap-2 p-2 rounded-md cursor-pointer border transition-colors ${
                          selectedMembers.includes(member.user_id)
                            ? "border-primary bg-primary/5"
                            : "border-transparent hover:bg-muted/50"
                        }`}
                        onClick={() => toggleMember(member.user_id)}
                      >
                        <Checkbox
                          checked={selectedMembers.includes(member.user_id)}
                          onCheckedChange={() => toggleMember(member.user_id)}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{member.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                        </div>
                      </div>
                    ))}
                  </div>
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
                      className="pl-8"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
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

            {/* Description */}
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Pauta da reunião..."
                rows={3}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="flex-shrink-0 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createMeeting.isPending || !title.trim() || !date}
          >
            {createMeeting.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Agendando...
              </>
            ) : (
              <>
                <Calendar className="h-4 w-4 mr-2" />
                Agendar
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
