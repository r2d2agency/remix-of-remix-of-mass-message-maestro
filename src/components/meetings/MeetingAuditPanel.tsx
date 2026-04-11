import { useMeetingAudit } from "@/hooks/use-meetings";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Mic, Upload, FileText, Users, CheckCircle2, AlertCircle,
  Clock, Loader2, Shield, Play, Square
} from "lucide-react";

const ACTION_ICONS: Record<string, React.ReactNode> = {
  recording_started: <Play className="h-3.5 w-3.5 text-green-600" />,
  recording_completed: <Square className="h-3.5 w-3.5 text-blue-600" />,
  audio_uploaded: <Upload className="h-3.5 w-3.5 text-blue-600" />,
  transcription_started: <Loader2 className="h-3.5 w-3.5 text-amber-600 animate-spin" />,
  transcription_completed: <FileText className="h-3.5 w-3.5 text-green-600" />,
  transcription_error: <AlertCircle className="h-3.5 w-3.5 text-destructive" />,
  speaker_identification_started: <Users className="h-3.5 w-3.5 text-amber-600" />,
  speaker_identification_completed: <Users className="h-3.5 w-3.5 text-green-600" />,
  transcript_saved: <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />,
  processing_completed: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />,
  audio_expired: <Shield className="h-3.5 w-3.5 text-amber-600" />,
};

const ACTION_COLORS: Record<string, string> = {
  recording_started: "border-green-500/30 bg-green-500/5",
  recording_completed: "border-blue-500/30 bg-blue-500/5",
  transcription_started: "border-amber-500/30 bg-amber-500/5",
  transcription_completed: "border-green-500/30 bg-green-500/5",
  transcription_error: "border-destructive/30 bg-destructive/5",
  processing_completed: "border-emerald-500/30 bg-emerald-500/5",
  audio_expired: "border-amber-500/30 bg-amber-500/5",
};

interface Props {
  meetingId: string;
}

export function MeetingAuditPanel({ meetingId }: Props) {
  const { logs, isLoading } = useMeetingAudit(meetingId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        Carregando auditoria...
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm italic">
        <Clock className="h-8 w-8 mx-auto mb-2 opacity-30" />
        Nenhuma atividade registrada ainda.
        <br />
        Inicie uma gravação para ver o histórico de processamento.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border" />

        {logs.map((log, i) => (
          <div key={log.id} className="relative flex gap-3 py-2">
            {/* Timeline dot */}
            <div className={`relative z-10 flex items-center justify-center h-[30px] w-[30px] rounded-full border shrink-0 bg-background ${ACTION_COLORS[log.action] || "border-border"}`}>
              {ACTION_ICONS[log.action] || <Clock className="h-3.5 w-3.5 text-muted-foreground" />}
            </div>

            <div className="flex-1 min-w-0 pt-0.5">
              <p className="text-sm font-medium leading-tight">{log.description}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] text-muted-foreground">
                  {format(new Date(log.created_at), "dd/MM HH:mm:ss", { locale: ptBR })}
                </span>
                {log.user_name && (
                  <Badge variant="outline" className="text-[9px] px-1 py-0">{log.user_name}</Badge>
                )}
                {log.action === "recording_completed" && log.metadata?.file_size && (
                  <Badge variant="secondary" className="text-[9px] px-1 py-0">
                    {(log.metadata.file_size / 1024 / 1024).toFixed(1)}MB
                  </Badge>
                )}
                {log.action === "transcription_completed" && log.metadata?.length && (
                  <Badge variant="secondary" className="text-[9px] px-1 py-0">
                    {log.metadata.length} chars
                  </Badge>
                )}
                {log.action === "speaker_identification_completed" && log.metadata?.speakers && (
                  <Badge variant="secondary" className="text-[9px] px-1 py-0">
                    {log.metadata.speakers.length} falante(s)
                  </Badge>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
