import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { 
  FileText, Brain, Clock, Users, Play, Pause, Mic, 
  CheckCircle2, AlertCircle, Download, Trash2, 
  MessageSquare, Target, Shield, ListTodo, FileAudio,
  Loader2, RefreshCw, Upload, Sparkles, ExternalLink,
  Calendar, Video, Plus, Wand2, Copy, Save
} from "lucide-react";
import { useMeetingDetail, useMeetingTasks, useMeetingAudit, useUploadMeetingAudio, useReprocessMeetingAudio, useMeetingAIAnalysis } from "@/hooks/use-meetings";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";


interface MeetingDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meetingId: string;
}

export function MeetingDetailDialog({ open, onOpenChange, meetingId }: MeetingDetailDialogProps) {
  const { data: meeting, isLoading: loadingMeeting } = useMeetingDetail(meetingId);
  const { tasks, isLoading: loadingTasks } = useMeetingTasks(meetingId);
  const { logs } = useMeetingAudit(meetingId);
  const uploadAudio = useUploadMeetingAudio(meetingId);
  const reprocessAudio = useReprocessMeetingAudio(meetingId);
  const aiAnalysis = useMeetingAIAnalysis(meetingId);
  
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<any>(null);

  const standardPrompts = [
    {
      id: 'ata',
      title: 'Gerar Ata de Reunião',
      description: 'Cria um documento formal com tópicos, decisões e participantes.',
      prompt: 'Gere uma ata de reunião formal baseada nesta transcrição, incluindo: 1. Participantes mencionados, 2. Tópicos discutidos, 3. Decisões tomadas, 4. Próximos passos.'
    },
    {
      id: 'tasks',
      title: 'Extrair Tarefas',
      description: 'Identifica compromissos e responsáveis citados no áudio.',
      prompt: 'Analise a transcrição e extraia todas as tarefas e compromissos mencionados. Para cada tarefa, tente identificar o responsável e o prazo se disponível. Formate como uma lista.'
    },
    {
      id: 'summary',
      title: 'Resumo para Advogados',
      description: 'Focado em pontos jurídicos e orientações dadas.',
      prompt: 'Crie um resumo técnico focado nos pontos jurídicos discutidos, orientações fornecidas ao cliente e riscos legais identificados.'
    }
  ];

  const handleRunAnalysis = async (prompt: string) => {
    try {
      const result = await aiAnalysis.mutateAsync({ prompt }) as any;
      if (result && result.analysis) {
        setAnalysisResult(result.analysis);
        toast.success("Análise concluída com sucesso!");
      } else if (result && result.result) {
        setAnalysisResult(result.result);
        toast.success("Análise concluída com sucesso!");
      }
    } catch (error) {
      console.error("Analysis error:", error);
    }
  };

  // Audio recording logic
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      
      const chunks: BlobPart[] = [];
      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        setAudioBlob(blob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordDuration(0);
      timerRef.current = setInterval(() => {
        setRecordDuration(prev => prev + 1);
      }, 1000);
      
      toast.info("Gravação iniciada");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao acessar microfone");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerRef.current);
      toast.success("Gravação concluída");
    }
  };

  const handleUploadAudio = () => {
    if (audioBlob) {
      uploadAudio.mutate({ audioBlob, durationSeconds: recordDuration });
      setAudioBlob(null);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadAudio.mutate({ audioBlob: file, durationSeconds: 0 });
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loadingMeeting || !meeting) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden" aria-describedby={undefined}>
        <DialogHeader className="p-6 pb-2 border-b">
          <div className="flex justify-between items-start pr-8">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <DialogTitle className="text-xl">{meeting.title}</DialogTitle>
                {meeting.status === 'resumo_gerado' && <Sparkles className="h-5 w-5 text-purple-500 fill-purple-500" />}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {format(new Date(meeting.scheduled_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </span>
                {meeting.lawyer_name && (
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {meeting.lawyer_name}
                  </span>
                )}
                {meeting.meeting_link && (
                  <a 
                    href={meeting.meeting_link} 
                    target="_blank" 
                    rel="noreferrer"
                    className="flex items-center gap-1 text-primary hover:underline"
                  >
                    <Video className="h-3 w-3" />
                    Entrar na Sala
                  </a>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Badge variant={meeting.status === 'resumo_gerado' ? 'default' : 'outline'} className={cn(
                meeting.status === 'resumo_gerado' ? 'bg-purple-500 hover:bg-purple-600' : ''
              )}>
                {meeting.status.replace('_', ' ').toUpperCase()}
              </Badge>
              {meeting.status === 'transcrevendo' && (
                <div className="flex items-center gap-2 text-[10px] text-blue-600 animate-pulse font-medium">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  IA TRANSCREVENDO...
                </div>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          {/* Main Content Areas */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <Tabs defaultValue="transcript" className="flex-1 flex flex-col">
              <div className="px-6 border-b bg-muted/20">
                <TabsList className="bg-transparent border-none p-0 h-12 gap-6 overflow-x-auto no-scrollbar flex-nowrap">
                  <TabsTrigger value="transcript" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none shadow-none h-full px-0 whitespace-nowrap">
                    <FileText className="h-4 w-4 mr-2" />
                    Transcrição
                  </TabsTrigger>
                  <TabsTrigger value="intelligence" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none shadow-none h-full px-0 whitespace-nowrap">
                    <Brain className="h-4 w-4 mr-2" />
                    Inteligência IA
                  </TabsTrigger>
                  {meeting.transcript && (
                    <TabsTrigger value="analysis" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none shadow-none h-full px-0 whitespace-nowrap">
                      <Sparkles className="h-4 w-4 mr-2" />
                      Análise de Prompt
                    </TabsTrigger>
                  )}
                  <TabsTrigger value="tasks" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none shadow-none h-full px-0 whitespace-nowrap">
                    <ListTodo className="h-4 w-4 mr-2" />
                    Tarefas ({tasks.length})
                  </TabsTrigger>
                </TabsList>
              </div>

              <div className="flex-1 overflow-hidden">
                <TabsContent value="transcript" className="h-full m-0 p-0">
                  <ScrollArea className="h-full p-6">
                    {meeting.transcript ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none space-y-4">
                        {meeting.transcript.split('\n').map((line, i) => (
                          <p key={i} className="text-sm leading-relaxed">{line}</p>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full py-12 text-center">
                        <FileAudio className="h-16 w-16 text-muted-foreground/30 mb-4" />
                        <h3 className="text-lg font-medium text-foreground">Transcrição Indisponível</h3>
                        <p className="text-muted-foreground text-sm max-w-xs mx-auto mb-6">
                          O áudio desta reunião ainda não foi processado. Grave o áudio ou faça upload de um arquivo.
                        </p>
                        
                        <div className="flex items-center gap-3">
                          {!isRecording && !audioBlob && (
                            <Button onClick={startRecording} variant="outline" className="gap-2 border-primary/50 text-primary hover:bg-primary/5">
                              <Mic className="h-4 w-4" />
                              Gravar Agora
                            </Button>
                          )}
                          {isRecording && (
                            <Button onClick={stopRecording} variant="destructive" className="gap-2 animate-pulse">
                              <div className="h-2 w-2 rounded-full bg-white mr-1" />
                              Parar ({formatTime(recordDuration)})
                            </Button>
                          )}
                          {audioBlob && !uploadAudio.isPending && (
                            <div className="flex flex-col items-center gap-2 bg-background p-3 rounded-lg border shadow-sm">
                              <p className="text-xs font-medium text-muted-foreground uppercase">Prévia da Gravação</p>
                              <audio 
                                src={URL.createObjectURL(audioBlob)} 
                                controls 
                                className="h-10 w-64"
                              />
                              <div className="flex gap-2 w-full">
                                <Button 
                                  onClick={() => setAudioBlob(null)} 
                                  variant="ghost" 
                                  size="sm" 
                                  className="flex-1 h-8 text-xs text-destructive"
                                >
                                  Descartar
                                </Button>
                                <Button 
                                  onClick={handleUploadAudio} 
                                  size="sm"
                                  className="flex-1 h-8 text-xs bg-green-600 hover:bg-green-700 gap-1"
                                >
                                  <Upload className="h-3 w-3" />
                                  Enviar para Transcrição
                                </Button>
                              </div>
                            </div>
                          )}

                          <div className="relative">
                            <input
                              type="file"
                              accept="audio/*"
                              onChange={handleFileUpload}
                              className="absolute inset-0 opacity-0 cursor-pointer"
                              disabled={uploadAudio.isPending}
                            />
                            <Button variant="outline" className="gap-2">
                              <FileAudio className="h-4 w-4" />
                              Upload de Arquivo
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="intelligence" className="h-full m-0 p-0">
                  <ScrollArea className="h-full p-6">
                    {!meeting.summary ? (
                      <div className="flex flex-col items-center justify-center py-20 text-center">
                        <Brain className="h-16 w-16 text-purple-300 mb-4" />
                        <h3 className="text-lg font-medium">Aguardando Transcrição</h3>
                        <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                          A inteligência artificial analisará a reunião automaticamente assim que a transcrição estiver pronta.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {/* Summary Section */}
                        <section className="space-y-2">
                          <h4 className="text-sm font-bold flex items-center gap-2 text-primary uppercase tracking-wider">
                            <FileText className="h-4 w-4" />
                            Resumo Executivo
                          </h4>
                          <div className="bg-muted/30 p-4 rounded-lg border border-border/50 text-sm leading-relaxed">
                            {String(meeting.summary)}
                          </div>
                        </section>

                        {/* Key Points */}
                        {meeting.key_points && meeting.key_points.length > 0 && (
                          <section className="space-y-2">
                            <h4 className="text-sm font-bold flex items-center gap-2 text-green-600 uppercase tracking-wider">
                              <Target className="h-4 w-4" />
                              Pontos Chave
                            </h4>
                            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {meeting.key_points.map((point, i) => (
                                <li key={i} className="flex gap-2 text-sm bg-green-50/50 dark:bg-green-900/10 p-2 rounded border border-green-100 dark:border-green-900/30">
                                  <div className="h-1.5 w-1.5 rounded-full bg-green-500 mt-1.5 shrink-0" />
                                  {point}
                                </li>
                              ))}
                            </ul>
                          </section>
                        )}

                        {/* Risks & Sensitive points */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {meeting.risks && meeting.risks.length > 0 && (
                            <section className="space-y-2">
                              <h4 className="text-sm font-bold flex items-center gap-2 text-destructive uppercase tracking-wider">
                                <AlertCircle className="h-4 w-4" />
                                Riscos Identificados
                              </h4>
                              <div className="space-y-2">
                                {meeting.risks.map((risk, i) => (
                                  <div key={i} className="text-sm bg-destructive/5 p-2 rounded border border-destructive/10 text-destructive flex gap-2">
                                    <AlertCircle className="h-4 w-4 shrink-0" />
                                    {risk}
                                  </div>
                                ))}
                              </div>
                            </section>
                          )}

                          {meeting.next_steps && meeting.next_steps.length > 0 && (
                            <section className="space-y-2">
                              <h4 className="text-sm font-bold flex items-center gap-2 text-blue-600 uppercase tracking-wider">
                                <ListTodo className="h-4 w-4" />
                                Próximos Passos
                              </h4>
                              <div className="space-y-2">
                                {meeting.next_steps.map((step, i) => (
                                  <div key={i} className="text-sm bg-blue-50/50 dark:bg-blue-900/10 p-2 rounded border border-blue-100 dark:border-blue-900/30 flex gap-2">
                                    <div className="h-5 w-5 rounded-full bg-blue-500 text-white flex items-center justify-center text-[10px] shrink-0">{i+1}</div>
                                    {step}
                                  </div>
                                ))}
                              </div>
                            </section>
                          )}
                        </div>
                      </div>
                    )}
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="tasks" className="h-full m-0 p-0">
                  <ScrollArea className="h-full p-6">
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <h4 className="text-sm font-semibold">Tarefas Geradas na Reunião</h4>
                        <Button size="sm" variant="outline" className="h-8 gap-1">
                          <Plus className="h-3 w-3" />
                          Nova Tarefa
                        </Button>
                      </div>

                      {tasks.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                          <ListTodo className="h-8 w-8 mx-auto mb-2 opacity-30" />
                          <p className="text-sm">Nenhuma tarefa vinculada a esta reunião.</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {tasks.map((task) => (
                            <Card key={task.id} className="p-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className={cn(
                                    "h-4 w-4 rounded border",
                                    task.status === 'completed' ? "bg-green-500 border-green-500" : "border-muted-foreground/30"
                                  )}>
                                    {task.status === 'completed' && <CheckCircle2 className="h-3 w-3 text-white" />}
                                  </div>
                                  <div>
                                    <p className={cn("text-sm font-medium", task.status === 'completed' && "line-through text-muted-foreground")}>
                                      {task.description}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground">
                                      Para: {task.assigned_to_name || "Sem atribuição"} • {task.due_date ? format(new Date(task.due_date), "dd/MM/yyyy") : "Sem data"}
                                    </p>
                                  </div>
                                </div>
                                <Badge variant={task.priority === 'high' ? 'destructive' : 'outline'} className="text-[10px]">
                                  {task.priority.toUpperCase()}
                                </Badge>
                              </div>
                            </Card>
                          ))}
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>
              </div>
            </Tabs>
          </div>

          {/* Sidebar: Audit & Metadata */}
          <div className="w-full md:w-72 bg-muted/20 border-l flex flex-col overflow-hidden">
            <div className="p-4 border-b bg-background/50">
              <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">Metadados</h4>
              <div className="space-y-3">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-muted-foreground uppercase">Duração Gravada</span>
                  <span className="text-sm font-medium">{meeting.recording_duration_seconds ? formatTime(meeting.recording_duration_seconds) : "--:--"}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-muted-foreground uppercase">Processo</span>
                  <span className="text-sm font-medium truncate">{meeting.process_number || "Não vinculado"}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-muted-foreground uppercase">Participantes (Equipe)</span>
                  <div className="flex flex-wrap gap-1">
                    {meeting.team_member_ids?.length ? (
                      meeting.team_member_ids.map(id => (
                         <Badge key={id} variant="secondary" className="text-[10px]">{id.slice(0, 8)}</Badge>
                      ))
                    ) : <span className="text-xs text-muted-foreground">Somente responsável</span>}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-2">
                <Button variant="outline" size="sm" className="w-full h-8 text-xs gap-2" onClick={() => reprocessAudio.mutate()} disabled={reprocessAudio.isPending}>
                  <RefreshCw className={cn("h-3 w-3", reprocessAudio.isPending && "animate-spin")} />
                  Reprocessar IA
                </Button>
                <Button variant="outline" size="sm" className="w-full h-8 text-xs gap-2">
                  <Download className="h-3 w-3" />
                  Baixar Transcrição
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col">
              <div className="p-4 border-b">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Histórico de Audit</h4>
              </div>
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                  {logs.map((log) => (
                    <div key={log.id} className="relative pl-4 border-l-2 border-muted pb-4 last:pb-0">
                      <div className="absolute -left-[5px] top-0 h-2 w-2 rounded-full bg-muted-foreground/30" />
                      <p className="text-[11px] font-semibold text-foreground uppercase tracking-tight">{log.action.replace('_', ' ')}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{log.description}</p>
                      <p className="text-[9px] text-muted-foreground/60 mt-1">
                        {format(new Date(log.created_at), "HH:mm:ss", { locale: ptBR })} • {log.user_name || "Sistema"}
                      </p>
                    </div>
                  ))}
                  {logs.length === 0 && <p className="text-center text-[10px] text-muted-foreground py-8">Sem logs disponíveis</p>}
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>

        <DialogFooter className="p-4 border-t bg-muted/10 flex-shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="sm:mr-auto">Fechar</Button>
          <div className="flex gap-2">
            <Button variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10">
              <Trash2 className="h-4 w-4 mr-2" />
              Excluir Reunião
            </Button>
            {meeting.meeting_link && (
              <Button onClick={() => window.open(meeting.meeting_link, "_blank")} className="bg-green-600 hover:bg-green-700">
                <Video className="h-4 w-4 mr-2" />
                Abrir Sala Virtual
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}