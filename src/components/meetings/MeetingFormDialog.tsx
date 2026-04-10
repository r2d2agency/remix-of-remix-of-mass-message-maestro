import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Meeting } from "@/hooks/use-meetings";
import { CalendarDays, Link as LinkIcon, User, Building2, FileText } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Partial<Meeting>) => void;
  meeting?: Meeting | null;
  isLoading?: boolean;
}

const MEETING_TYPES = [
  { value: "atendimento_inicial", label: "Atendimento Inicial" },
  { value: "reuniao_cliente", label: "Reunião com Cliente" },
  { value: "audiencia_remota", label: "Audiência Remota" },
  { value: "reuniao_estrategica", label: "Reunião Estratégica" },
  { value: "reuniao_interna", label: "Reunião Interna" },
  { value: "alinhamento_processual", label: "Alinhamento Processual" },
  { value: "outro", label: "Outro" },
];

export function MeetingFormDialog({ open, onOpenChange, onSubmit, meeting, isLoading }: Props) {
  const [title, setTitle] = useState(meeting?.title || "");
  const [meetingType, setMeetingType] = useState(meeting?.meeting_type || "reuniao_cliente");
  const [scheduledAt, setScheduledAt] = useState(meeting?.scheduled_at ? new Date(meeting.scheduled_at).toISOString().slice(0, 16) : "");
  const [durationMinutes, setDurationMinutes] = useState(meeting?.duration_minutes?.toString() || "60");
  const [meetingLink, setMeetingLink] = useState(meeting?.meeting_link || "");
  const [processNumber, setProcessNumber] = useState(meeting?.process_number || "");
  const [internalNotes, setInternalNotes] = useState(meeting?.internal_notes || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      title,
      meeting_type: meetingType,
      scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : new Date().toISOString(),
      duration_minutes: parseInt(durationMinutes) || 60,
      meeting_link: meetingLink || undefined,
      process_number: processNumber || undefined,
      internal_notes: internalNotes || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            {meeting ? "Editar Reunião" : "Nova Reunião"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Título *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Reunião inicial - Caso Silva" required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo</Label>
              <Select value={meetingType} onValueChange={setMeetingType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MEETING_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Duração (min)</Label>
              <Input type="number" value={durationMinutes} onChange={e => setDurationMinutes(e.target.value)} min="5" />
            </div>
          </div>

          <div>
            <Label>Data e Hora *</Label>
            <Input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} required />
          </div>

          <div>
            <Label className="flex items-center gap-1"><LinkIcon className="h-3 w-3" /> Link da Reunião</Label>
            <Input value={meetingLink} onChange={e => setMeetingLink(e.target.value)} placeholder="https://meet.google.com/..." />
          </div>

          <div>
            <Label className="flex items-center gap-1"><FileText className="h-3 w-3" /> Nº do Processo</Label>
            <Input value={processNumber} onChange={e => setProcessNumber(e.target.value)} placeholder="0000000-00.0000.0.00.0000" />
          </div>

          <div>
            <Label>Observações Internas</Label>
            <Textarea value={internalNotes} onChange={e => setInternalNotes(e.target.value)} rows={3} placeholder="Anotações internas sobre esta reunião..." />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={isLoading || !title || !scheduledAt}>
              {meeting ? "Salvar" : "Criar Reunião"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
