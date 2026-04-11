import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Meeting, useMeetingTasks } from "@/hooks/use-meetings";
import { MeetingAuditPanel } from "./MeetingAuditPanel";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CalendarDays, Clock, User, FileText, CheckSquare, AlertTriangle,
  Sparkles, Plus, Trash2, MessageSquare, ListChecks, Shield,
  BookOpen, Target, Lightbulb, Scale, Pencil, ClipboardList, Volume2
} from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meeting: Meeting;
  onUpdate: (data: Partial<Meeting> & { id: string }) => void;
  onEdit: (meeting: Meeting) => void;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  aguardando_transcricao: { label: "Aguardando Transcrição", color: "bg-yellow-500/20 text-yellow-700" },
  transcrevendo: { label: "Transcrevendo", color: "bg-blue-500/20 text-blue-700" },
  resumo_gerado: { label: "Resumo Gerado", color: "bg-green-500/20 text-green-700" },
  pendente_revisao: { label: "Pendente de Revisão", color: "bg-orange-500/20 text-orange-700" },
  finalizado: { label: "Finalizado", color: "bg-emerald-500/20 text-emerald-700" },
  com_pendencias: { label: "Com Pendências", color: "bg-red-500/20 text-red-700" },
};

const MEETING_TYPE_LABELS: Record<string, string> = {
  atendimento_inicial: "Atendimento Inicial",
  reuniao_cliente: "Reunião com Cliente",
  audiencia_remota: "Audiência Remota",
  reuniao_estrategica: "Reunião Estratégica",
  reuniao_interna: "Reunião Interna",
  alinhamento_processual: "Alinhamento Processual",
  outro: "Outro",
};

const AI_ACTIONS = [
  { label: "Organizar reunião com IA", icon: Sparkles },
  { label: "Gerar pontos de atenção", icon: AlertTriangle },
  { label: "Criar tarefas da reunião", icon: CheckSquare },
  { label: "Resumir para o processo", icon: FileText },
  { label: "Preparar base para tese", icon: Target },
  { label: "Preparar base para defesa", icon: Shield },
  { label: "Preparar base para contrato", icon: Scale },
];

export function MeetingDetailDialog({ open, onOpenChange, meeting, onUpdate, onEdit }: Props) {
  const { tasks, createTask, updateTask, deleteTask } = useMeetingTasks(meeting.id);
  const [newTaskDesc, setNewTaskDesc] = useState("");
  const [editingTranscript, setEditingTranscript] = useState(false);
  const [transcript, setTranscript] = useState(meeting.transcript || "");

  const statusInfo = STATUS_MAP[meeting.status] || STATUS_MAP.aguardando_transcricao;

  useEffect(() => {
    setTranscript(meeting.transcript || "");
    setEditingTranscript(false);
    setNewTaskDesc("");
  }, [meeting]);

  const handleStatusChange = (status: string) => {
    onUpdate({ id: meeting.id, status });
  };

  const handleSaveTranscript = () => {
    onUpdate({ id: meeting.id, transcript });
    setEditingTranscript(false);
  };

  const handleAddTask = () => {
    if (!newTaskDesc.trim()) return;
    createTask.mutate({ description: newTaskDesc });
    setNewTaskDesc("");
  };

  const renderList = (items: string[] | undefined, icon: React.ReactNode, emptyText: string) => {
    if (!items || items.length === 0) return <p className="text-sm text-muted-foreground italic">{emptyText}</p>;
    return (
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            {icon}
            <span>{item}</span>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-lg">{meeting.title}</DialogTitle>
              <div className="flex flex-wrap items-center gap-2 mt-2 text-sm text-muted-foreground">
                <Badge variant="outline">{MEETING_TYPE_LABELS[meeting.meeting_type] || meeting.meeting_type}</Badge>
                <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
                <span className="flex items-center gap-1">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {format(new Date(meeting.scheduled_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </span>
                {meeting.duration_minutes && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {meeting.duration_minutes}min
                  </span>
                )}
                {meeting.lawyer_name && (
                  <span className="flex items-center gap-1">
                    <User className="h-3.5 w-3.5" />
                    {meeting.lawyer_name}
                  </span>
                )}
              </div>
              {meeting.process_number && (
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <FileText className="h-3 w-3" /> Processo: {meeting.process_number}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => onEdit(meeting)}>
                <Pencil className="h-4 w-4 mr-2" />
                Editar
              </Button>
              <Select value={meeting.status} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_MAP).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="resumo" className="mt-4">
          <TabsList className="w-full flex-wrap h-auto">
            <TabsTrigger value="resumo">Resumo</TabsTrigger>
            <TabsTrigger value="transcricao">Transcrição</TabsTrigger>
            <TabsTrigger value="pontos">Pontos</TabsTrigger>
            <TabsTrigger value="tarefas">Tarefas ({tasks.length})</TabsTrigger>
            <TabsTrigger value="auditoria" className="gap-1"><ClipboardList className="h-3.5 w-3.5" /> Auditoria</TabsTrigger>
            <TabsTrigger value="ia">Ações IA</TabsTrigger>
            <TabsTrigger value="notas">Notas</TabsTrigger>
          </TabsList>

          <TabsContent value="resumo" className="space-y-4 mt-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-3">
                <h4 className="font-medium flex items-center gap-2 text-sm"><MessageSquare className="h-4 w-4 text-primary" /> Solicitações do Cliente</h4>
                {renderList(meeting.client_requests as string[], <span className="text-primary mt-0.5">•</span>, "Nenhuma solicitação registrada")}
              </div>
              <div className="space-y-3">
                <h4 className="font-medium flex items-center gap-2 text-sm"><Lightbulb className="h-4 w-4 text-primary" /> Orientações do Advogado</h4>
                {renderList(meeting.lawyer_guidance as string[], <span className="text-primary mt-0.5">•</span>, "Nenhuma orientação registrada")}
              </div>
            </div>
            <div>
              <h4 className="font-medium flex items-center gap-2 text-sm mb-2"><Target className="h-4 w-4 text-primary" /> Próximos Passos</h4>
              {renderList(meeting.next_steps as string[], <span className="text-emerald-600 mt-0.5">→</span>, "Nenhum próximo passo definido")}
            </div>
            {(meeting.risks as string[])?.length > 0 && (
              <div className="p-3 bg-destructive/10 rounded-lg">
                <h4 className="font-medium flex items-center gap-2 text-sm mb-2"><AlertTriangle className="h-4 w-4 text-destructive" /> Riscos e Cuidados</h4>
                {renderList(meeting.risks as string[], <span className="text-destructive mt-0.5">⚠</span>, "")}
              </div>
            )}
          </TabsContent>

          <TabsContent value="transcricao" className="mt-4">
            <div className="flex justify-between items-center mb-2">
              <h4 className="font-medium text-sm flex items-center gap-2"><BookOpen className="h-4 w-4" /> Transcrição</h4>
              <Button variant="ghost" size="sm" onClick={() => setEditingTranscript(!editingTranscript)}>
                {editingTranscript ? "Cancelar" : "Editar"}
              </Button>
            </div>
            {editingTranscript ? (
              <div className="space-y-2">
                <Textarea value={transcript} onChange={e => setTranscript(e.target.value)} rows={15} className="font-mono text-xs" />
                <Button size="sm" onClick={handleSaveTranscript}>Salvar Transcrição</Button>
              </div>
            ) : (
              <div className="p-4 bg-muted/50 rounded-lg text-sm whitespace-pre-wrap max-h-96 overflow-y-auto">
                {meeting.transcript || <span className="text-muted-foreground italic">Nenhuma transcrição disponível. Capture o áudio da reunião para gerar a transcrição automaticamente.</span>}
              </div>
            )}
          </TabsContent>

          <TabsContent value="pontos" className="space-y-4 mt-4">
            <div>
              <h4 className="font-medium flex items-center gap-2 text-sm mb-2"><ListChecks className="h-4 w-4 text-primary" /> Pontos Principais</h4>
              {renderList(meeting.key_points as string[], <span className="text-primary mt-0.5">✓</span>, "Nenhum ponto registrado")}
            </div>
            <div>
              <h4 className="font-medium flex items-center gap-2 text-sm mb-2"><Shield className="h-4 w-4 text-amber-600" /> Pontos Sensíveis</h4>
              {renderList(meeting.sensitive_points as string[], <span className="text-amber-600 mt-0.5">!</span>, "Nenhum ponto sensível")}
            </div>
            <div>
              <h4 className="font-medium flex items-center gap-2 text-sm mb-2"><FileText className="h-4 w-4" /> Documentos Citados</h4>
              {renderList(meeting.cited_documents as string[], <span className="text-muted-foreground mt-0.5">📄</span>, "Nenhum documento citado")}
            </div>
          </TabsContent>

          <TabsContent value="tarefas" className="mt-4 space-y-3">
            <div className="flex gap-2">
              <Input value={newTaskDesc} onChange={e => setNewTaskDesc(e.target.value)} placeholder="Nova tarefa..." onKeyDown={e => e.key === 'Enter' && handleAddTask()} className="flex-1" />
              <Button size="sm" onClick={handleAddTask} disabled={!newTaskDesc.trim()}>
                <Plus className="h-4 w-4 mr-1" /> Adicionar
              </Button>
            </div>
            {tasks.length === 0 ? (
              <p className="text-sm text-muted-foreground italic text-center py-6">Nenhuma tarefa criada para esta reunião</p>
            ) : (
              <div className="space-y-2">
                {tasks.map(task => (
                  <div key={task.id} className="flex items-center gap-3 p-2.5 rounded-lg border bg-card">
                    <button
                      className={`h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${task.status === 'done' ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/30'}`}
                      onClick={() => updateTask.mutate({ id: task.id, status: task.status === 'done' ? 'pending' : 'done' })}
                    >
                      {task.status === 'done' && <span className="text-xs">✓</span>}
                    </button>
                    <span className={`flex-1 text-sm ${task.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>{task.description}</span>
                    <Badge variant="outline" className="text-xs capitalize">{task.priority}</Badge>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => deleteTask.mutate(task.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="ia" className="mt-4">
            <p className="text-sm text-muted-foreground mb-4">Utilize inteligência artificial para processar o conteúdo desta reunião e gerar insights automatizados.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {AI_ACTIONS.map((action, i) => (
                <Button key={i} variant="outline" className="justify-start h-auto py-3 px-4" onClick={() => {}}>
                  <action.icon className="h-4 w-4 mr-3 text-primary shrink-0" />
                  <span className="text-sm">{action.label}</span>
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3 italic">* Funções de IA serão ativadas em breve. A estrutura já está preparada para processamento inteligente.</p>
          </TabsContent>

          <TabsContent value="notas" className="mt-4">
            <h4 className="font-medium text-sm mb-2">Observações Internas</h4>
            <div className="p-4 bg-muted/50 rounded-lg text-sm whitespace-pre-wrap min-h-[100px]">
              {meeting.internal_notes || <span className="text-muted-foreground italic">Sem observações internas</span>}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
