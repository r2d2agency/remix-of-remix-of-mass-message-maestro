import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Plus, Search, Calendar, Clock, Video, FileText, 
  BarChart3, Users, Play, CheckCircle2, AlertCircle,
  MoreVertical, Download, Trash2, Filter, Settings,
  Brain, Mic, Headphones
} from "lucide-react";
import { useMeetings, Meeting } from "@/hooks/use-meetings";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MeetingScheduleDialog } from "@/components/chat/MeetingScheduleDialog";
import { MeetingDetailDialog } from "@/components/meetings/MeetingDetailDialog";

export default function Meetings() {
  const [search, setSearch] = useState("");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  
  const { meetings, isLoading, stats, deleteMeeting } = useMeetings({ search });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "aguardando_transcricao":
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Aguardando Áudio</Badge>;
      case "transcrevendo":
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 animate-pulse">Transcrevendo...</Badge>;
      case "resumo_gerado":
        return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">Analisado</Badge>;
      case "finalizado":
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Finalizado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getMeetingTypeLabel = (type: string) => {
    const types: Record<string, string> = {
      atendimento_inicial: "Atendimento Inicial",
      reuniao_cliente: "Reunião com Cliente",
      audiencia_remota: "Audiência Remota",
      reuniao_estrategica: "Reunião Estratégica",
      reuniao_interna: "Reunião Interna",
      alinhamento_processual: "Alinhamento Processual",
      outro: "Outro"
    };
    return types[type] || type;
  };

  return (
    <MainLayout>
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2 text-foreground">
              <Headphones className="h-7 w-7 text-primary" />
              Inteligência de Reuniões
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Agende, grave, transcreva e analise reuniões jurídicas com IA
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2">
              <Settings className="h-4 w-4" />
              Configurar IA
            </Button>
            <Button onClick={() => setScheduleOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Nova Reunião
            </Button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-card shadow-sm border-border/50">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-2 rounded-lg bg-primary/10">
                <Calendar className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total de Reuniões</p>
                <p className="text-2xl font-bold">{meetings.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card shadow-sm border-border/50">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Video className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Próximas (7 dias)</p>
                <p className="text-2xl font-bold">{stats?.recent_count || 0}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card shadow-sm border-border/50">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <Brain className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Analisadas por IA</p>
                <p className="text-2xl font-bold">
                  {meetings.filter(m => m.status === 'resumo_gerado' || m.status === 'finalizado').length}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card shadow-sm border-border/50">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-2 rounded-lg bg-orange-500/10">
                <Clock className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tarefas Pendentes</p>
                <p className="text-2xl font-bold text-orange-500">{stats?.pending_tasks || 0}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters and List */}
        <Card className="bg-card shadow-sm border-border/50 overflow-hidden">
          <CardHeader className="pb-3 border-b border-border/50 bg-muted/20">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar reuniões por título, cliente ou processo..."
                  className="pl-10 bg-background"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" className="gap-2">
                  <Filter className="h-4 w-4" />
                  Filtrar
                </Button>
                <Button variant="ghost" size="sm" className="gap-2">
                  <Download className="h-4 w-4" />
                  Exportar
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[600px]">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <Loader2 className="h-10 w-10 animate-spin text-primary opacity-50" />
                  <p className="text-muted-foreground">Carregando reuniões...</p>
                </div>
              ) : meetings.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
                  <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center">
                    <Calendar className="h-10 w-10 text-muted-foreground" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">Nenhuma reunião encontrada</h3>
                    <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                      Agende sua primeira reunião para começar a usar a inteligência de transcrição e análise.
                    </p>
                  </div>
                  <Button onClick={() => setScheduleOpen(true)}>
                    Agendar Agora
                  </Button>
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {meetings.map((meeting) => (
                    <div 
                      key={meeting.id} 
                      className="p-4 hover:bg-muted/30 transition-colors flex items-center justify-between group cursor-pointer"
                      onClick={() => {
                        setSelectedMeeting(meeting);
                        setDetailOpen(true);
                      }}
                    >
                      <div className="flex items-start gap-4 flex-1 min-w-0">
                        <div className={cn(
                          "h-12 w-12 rounded-xl flex items-center justify-center shrink-0 shadow-sm border border-border/50",
                          meeting.meeting_link ? "bg-green-50" : "bg-primary/5"
                        )}>
                          {meeting.meeting_link ? (
                            <Video className="h-6 w-6 text-green-600" />
                          ) : (
                            <Users className="h-6 w-6 text-primary" />
                          )}
                        </div>
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-foreground truncate max-w-md">
                              {meeting.title}
                            </h3>
                            {getStatusBadge(meeting.status)}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                            <span className="flex items-center gap-1 font-medium text-primary">
                              {getMeetingTypeLabel(meeting.meeting_type)}
                            </span>
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
                            {meeting.process_number && (
                              <span className="bg-muted px-1.5 py-0.5 rounded text-[10px]">
                                Proc: {meeting.process_number}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 ml-4">
                        <div className="hidden sm:flex flex-col items-end gap-1">
                          {meeting.meeting_link && (
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="h-8 text-xs gap-1 border-green-200 hover:bg-green-50 hover:text-green-700"
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(meeting.meeting_link, "_blank");
                              }}
                            >
                              <Play className="h-3 w-3" />
                              Entrar
                            </Button>
                          )}
                          {meeting.status === 'resumo_gerado' && (
                            <div className="flex items-center gap-1 text-[10px] text-purple-600 font-medium bg-purple-50 px-2 py-0.5 rounded-full">
                              <Brain className="h-3 w-3" />
                              IA Analisou
                            </div>
                          )}
                        </div>
                        
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => {
                              setSelectedMeeting(meeting);
                              setDetailOpen(true);
                            }}>
                              <Eye className="h-4 w-4 mr-2" />
                              Ver Detalhes
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => window.open(meeting.meeting_link, "_blank")} disabled={!meeting.meeting_link}>
                              <Video className="h-4 w-4 mr-2" />
                              Entrar na Sala
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive" onClick={(e) => {
                              e.stopPropagation();
                              if (confirm("Tem certeza que deseja excluir esta reunião?")) {
                                deleteMeeting.mutate(meeting.id);
                              }
                            }}>
                              <Trash2 className="h-4 w-4 mr-2" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Dialogs */}
      <MeetingScheduleDialog 
        open={scheduleOpen} 
        onOpenChange={setScheduleOpen} 
      />
      
      {selectedMeeting && (
        <MeetingDetailDialog
          open={detailOpen}
          onOpenChange={setDetailOpen}
          meetingId={selectedMeeting.id}
        />
      )}
    </MainLayout>
  );
}

// Minimal icons used in fallback if not in lucide-react (though they should be)
import { Eye } from "lucide-react";
