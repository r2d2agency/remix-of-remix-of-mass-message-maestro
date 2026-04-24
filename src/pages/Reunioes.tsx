import { useState, useCallback } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMeetings, MeetingFilters, Meeting, useMeetingDetail, useUploadMeetingAudio } from "@/hooks/use-meetings";
import { MeetingCard } from "@/components/meetings/MeetingCard";
import { MeetingFormDialog } from "@/components/meetings/MeetingFormDialog";
import { MeetingDetailDialog } from "@/components/meetings/MeetingDetailDialog";
import { MeetingRecordingDialog } from "@/components/meetings/MeetingRecordingDialog";
import { MeetingCalendarView } from "@/components/meetings/MeetingCalendarView";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Search, CalendarDays, ListChecks, BarChart3, Users,
  FileText, Clock, CheckSquare, AlertTriangle, Calendar
} from "lucide-react";

const STATUS_OPTIONS = [
  { value: "all", label: "Todos os Status" },
  { value: "aguardando_transcricao", label: "Aguard. Transcrição" },
  { value: "transcrevendo", label: "Transcrevendo" },
  { value: "resumo_gerado", label: "Resumo Gerado" },
  { value: "pendente_revisao", label: "Pend. Revisão" },
  { value: "finalizado", label: "Finalizado" },
  { value: "com_pendencias", label: "Com Pendências" },
];

const TYPE_OPTIONS = [
  { value: "all", label: "Todos os Tipos" },
  { value: "atendimento_inicial", label: "Atendimento Inicial" },
  { value: "reuniao_cliente", label: "Reunião Cliente" },
  { value: "audiencia_remota", label: "Audiência Remota" },
  { value: "reuniao_estrategica", label: "Estratégica" },
  { value: "reuniao_interna", label: "Interna" },
  { value: "alinhamento_processual", label: "Alinhamento" },
  { value: "outro", label: "Outro" },
];

export default function Reunioes() {
  const [filters, setFilters] = useState<MeetingFilters>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [editMeeting, setEditMeeting] = useState<Meeting | null>(null);
  const [recordingMeeting, setRecordingMeeting] = useState<Meeting | null>(null);
  const { toast } = useToast();

  const { meetings, isLoading, stats, createMeeting, updateMeeting, deleteMeeting } = useMeetings(filters);
  const { data: selectedMeetingDetail } = useMeetingDetail(selectedMeeting?.id);

  const handleFormOpenChange = (open: boolean) => {
    setShowForm(open);
    if (!open) setEditMeeting(null);
  };

  const openCreateForm = () => {
    setSelectedMeeting(null);
    setEditMeeting(null);
    setShowForm(true);
  };

  const openEditForm = (meeting: Meeting) => {
    setSelectedMeeting(null);
    setEditMeeting(meeting);
    setShowForm(true);
  };

  const handleSearch = (term: string) => {
    setSearchTerm(term);
    setFilters(prev => ({ ...prev, search: term || undefined }));
  };

  const handleFormSubmit = (data: Partial<Meeting>) => {
    if (editMeeting) {
      updateMeeting.mutate(
        { id: editMeeting.id, ...data },
        {
          onSuccess: (updatedMeeting) => {
            setEditMeeting(null);
            setShowForm(false);
            setSelectedMeeting(updatedMeeting);
          },
        }
      );
      return;
    }

    createMeeting.mutate(data, {
      onSuccess: () => {
        setShowForm(false);
        setEditMeeting(null);
      },
    });
  };

  const handleUpdate = (data: Partial<Meeting> & { id: string }) => {
    updateMeeting.mutate(data, {
      onSuccess: (updatedMeeting) => {
        if (selectedMeeting?.id === updatedMeeting.id) setSelectedMeeting(updatedMeeting);
        if (editMeeting?.id === updatedMeeting.id) setEditMeeting(updatedMeeting);
      },
    });
  };

  const uploadAudio = useUploadMeetingAudio(recordingMeeting?.id);

  const handleRecordingComplete = useCallback((audioBlob: Blob, durationSeconds: number) => {
    if (!recordingMeeting) return;
    uploadAudio.mutate({ audioBlob, durationSeconds }, {
      onSuccess: () => {
        // After upload, open the detail dialog to show audit trail
        setSelectedMeeting(recordingMeeting);
      },
    });
  }, [recordingMeeting, uploadAudio]);

  return (
    <MainLayout>
      <div className="p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <CalendarDays className="h-7 w-7 text-primary" />
              Atendimento Online
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Central operacional de reuniões, audiências e atendimentos</p>
          </div>
          <Button onClick={openCreateForm} className="gap-2">
            <Plus className="h-4 w-4" /> Nova Reunião
          </Button>
        </div>

        <Tabs defaultValue="cards">
          <TabsList>
            <TabsTrigger value="cards" className="gap-1"><ListChecks className="h-4 w-4" /> Cards</TabsTrigger>
            <TabsTrigger value="calendario" className="gap-1"><Calendar className="h-4 w-4" /> Calendário</TabsTrigger>
            <TabsTrigger value="dashboard" className="gap-1"><BarChart3 className="h-4 w-4" /> Dashboard</TabsTrigger>
          </TabsList>

          <TabsContent value="cards" className="space-y-4 mt-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={searchTerm} onChange={e => handleSearch(e.target.value)} placeholder="Buscar reuniões..." className="pl-9" />
              </div>
              <Select value={filters.status || "all"} onValueChange={v => setFilters(p => ({ ...p, status: v === "all" ? undefined : v }))}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>{STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={filters.meeting_type || "all"} onValueChange={v => setFilters(p => ({ ...p, meeting_type: v === "all" ? undefined : v }))}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>{TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {/* Meeting Cards Grid */}
            {isLoading ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[1,2,3,4,5,6].map(i => <Card key={i} className="h-32 animate-pulse bg-muted" />)}
              </div>
            ) : meetings.length === 0 ? (
              <Card className="p-12 text-center">
                <CalendarDays className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                <h3 className="font-medium text-lg">Nenhuma reunião encontrada</h3>
                <p className="text-muted-foreground text-sm mt-1">Crie sua primeira reunião para começar o prontuário operacional</p>
                <Button className="mt-4" onClick={openCreateForm}>
                  <Plus className="h-4 w-4 mr-2" /> Nova Reunião
                </Button>
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {meetings.map(m => (
                  <MeetingCard
                    key={m.id}
                    meeting={m}
                    onClick={() => setSelectedMeeting(m)}
                    onEdit={() => openEditForm(m)}
                    onStartRecording={() => setRecordingMeeting(m)}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="calendario" className="mt-4">
            <MeetingCalendarView
              meetings={meetings}
              onMeetingClick={setSelectedMeeting}
            />
          </TabsContent>

          <TabsContent value="dashboard" className="mt-4">
            {stats ? (
              <div className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Card className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <CalendarDays className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{stats.recent_count}</p>
                        <p className="text-xs text-muted-foreground">Reuniões (30 dias)</p>
                      </div>
                    </div>
                  </Card>
                  <Card className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
                        <CheckSquare className="h-5 w-5 text-orange-600" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{stats.pending_tasks}</p>
                        <p className="text-xs text-muted-foreground">Tarefas Pendentes</p>
                      </div>
                    </div>
                  </Card>
                  <Card className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                        <FileText className="h-5 w-5 text-green-600" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">
                          {stats.by_status.find(s => s.status === 'finalizado')?.count || 0}
                        </p>
                        <p className="text-xs text-muted-foreground">Finalizadas</p>
                      </div>
                    </div>
                  </Card>
                  <Card className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                        <AlertTriangle className="h-5 w-5 text-red-600" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">
                          {stats.by_status.find(s => s.status === 'com_pendencias')?.count || 0}
                        </p>
                        <p className="text-xs text-muted-foreground">Com Pendências</p>
                      </div>
                    </div>
                  </Card>
                </div>

                <Card className="p-4">
                  <h3 className="font-medium mb-3 flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Por Status</h3>
                  <div className="flex flex-wrap gap-2">
                    {stats.by_status.map(s => (
                      <Badge key={s.status} variant="secondary" className="text-sm px-3 py-1">
                        {s.status.replace(/_/g, ' ')}: {s.count}
                      </Badge>
                    ))}
                  </div>
                </Card>

                {stats.by_lawyer.length > 0 && (
                  <Card className="p-4">
                    <h3 className="font-medium mb-3 flex items-center gap-2"><Users className="h-4 w-4" /> Reuniões por Advogado</h3>
                    <div className="space-y-2">
                      {stats.by_lawyer.map((l, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <span>{l.name}</span>
                          <Badge variant="outline">{l.count}</Badge>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </div>
            ) : (
              <Card className="p-12 text-center text-muted-foreground">Carregando estatísticas...</Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialogs */}
      <MeetingFormDialog
        open={showForm}
        onOpenChange={handleFormOpenChange}
        meeting={editMeeting}
        onSubmit={handleFormSubmit}
        isLoading={createMeeting.isPending || updateMeeting.isPending}
      />

      {selectedMeeting && (
        <MeetingDetailDialog
          open={!!selectedMeeting}
          onOpenChange={open => !open && setSelectedMeeting(null)}
          meeting={selectedMeetingDetail || selectedMeeting}
          onUpdate={handleUpdate}
          onEdit={openEditForm}
          onDelete={(id) => { deleteMeeting.mutate(id); setSelectedMeeting(null); }}
        />
      )}

      {recordingMeeting && (
        <MeetingRecordingDialog
          open={!!recordingMeeting}
          onOpenChange={open => !open && setRecordingMeeting(null)}
          meeting={recordingMeeting}
          onRecordingComplete={handleRecordingComplete}
        />
      )}
    </MainLayout>
  );
}
