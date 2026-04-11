import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Meeting } from "@/hooks/use-meetings";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, Clock, User, FileText, CheckSquare, Play, Pencil, Mic, Loader2 } from "lucide-react";

interface Props {
  meeting: Meeting;
  onClick: () => void;
  onEdit?: () => void;
  onStartRecording?: () => void;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  aguardando_transcricao: { label: "Aguard. Transcrição", color: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400" },
  transcrevendo: { label: "Transcrevendo", color: "bg-blue-500/20 text-blue-700 dark:text-blue-400" },
  resumo_gerado: { label: "Resumo Gerado", color: "bg-green-500/20 text-green-700 dark:text-green-400" },
  pendente_revisao: { label: "Pend. Revisão", color: "bg-orange-500/20 text-orange-700 dark:text-orange-400" },
  finalizado: { label: "Finalizado", color: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400" },
  com_pendencias: { label: "Com Pendências", color: "bg-red-500/20 text-red-700 dark:text-red-400" },
};

const TYPE_LABELS: Record<string, string> = {
  atendimento_inicial: "Atendimento Inicial",
  reuniao_cliente: "Reunião Cliente",
  audiencia_remota: "Audiência Remota",
  reuniao_estrategica: "Estratégica",
  reuniao_interna: "Interna",
  alinhamento_processual: "Alinhamento",
  outro: "Outro",
};

export function MeetingCard({ meeting, onClick, onEdit, onStartRecording }: Props) {
  const statusInfo = STATUS_MAP[meeting.status] || STATUS_MAP.aguardando_transcricao;
  const hasTranscript = !!meeting.transcript;
  const nextStepsCount = (meeting.next_steps as string[])?.length || 0;
  const showActions = !!onEdit || (!hasTranscript && !!onStartRecording);

  return (
    <Card className="p-4 cursor-pointer hover:shadow-md transition-all hover:border-primary/30 group" onClick={onClick}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm truncate group-hover:text-primary transition-colors">{meeting.title}</h3>
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">{TYPE_LABELS[meeting.meeting_type] || meeting.meeting_type}</Badge>
            <Badge className={`text-[10px] px-1.5 py-0 ${statusInfo.color}`}>{statusInfo.label}</Badge>
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground shrink-0">
          <div className="flex items-center gap-1">
            <CalendarDays className="h-3 w-3" />
            {format(new Date(meeting.scheduled_at), "dd/MM/yy", { locale: ptBR })}
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <Clock className="h-3 w-3" />
            {format(new Date(meeting.scheduled_at), "HH:mm")}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-muted-foreground">
        {meeting.lawyer_name && (
          <span className="flex items-center gap-1"><User className="h-3 w-3" />{meeting.lawyer_name}</span>
        )}
        {meeting.process_number && (
          <span className="flex items-center gap-1"><FileText className="h-3 w-3" />{meeting.process_number.slice(0, 20)}...</span>
        )}
        {hasTranscript && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">📝 Transcrito</Badge>
        )}
        {meeting.status === 'transcrevendo' && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 animate-pulse">
            <Loader2 className="h-2.5 w-2.5 animate-spin mr-1" />Processando...
          </Badge>
        )}
        {meeting.recording_duration_seconds && (
          <span className="flex items-center gap-1"><Mic className="h-3 w-3" />{Math.floor(meeting.recording_duration_seconds / 60)}min</span>
        )}
        {nextStepsCount > 0 && (
          <span className="flex items-center gap-1"><CheckSquare className="h-3 w-3" />{nextStepsCount} passos</span>
        )}
      </div>

      {showActions && (
        <div className="mt-3 pt-3 border-t flex gap-2">
          {onEdit && (
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-2 text-xs"
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
            >
              <Pencil className="h-3.5 w-3.5" />
              Editar
            </Button>
          )}
          {!hasTranscript && onStartRecording && (
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-2 text-xs"
              onClick={(e) => { e.stopPropagation(); onStartRecording(); }}
            >
              <Play className="h-3.5 w-3.5" />
              Iniciar Captura
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
