import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, API_URL, getAuthToken } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export interface Meeting {
  id: string;
  title: string;
  meeting_type: string;
  scheduled_at: string;
  duration_minutes?: number;
  status: string;
  lawyer_user_id?: string;
  lawyer_name?: string;
  team_member_ids?: string[];
  contact_id?: string;
  company_id?: string;
  whatsapp_contact_id?: string;
  process_number?: string;
  deal_id?: string;
  meeting_link?: string;
  transcript?: string;
  summary?: Record<string, any>;
  key_points?: string[];
  client_requests?: string[];
  lawyer_guidance?: string[];
  sensitive_points?: string[];
  risks?: string[];
  cited_documents?: string[];
  next_steps?: string[];
  internal_notes?: string;
  audio_url?: string;
  audio_expires_at?: string;
  recording_duration_seconds?: number;
  speakers?: { label: string; identified: boolean }[];
  created_by?: string;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

export interface MeetingAuditLog {
  id: string;
  meeting_id: string;
  action: string;
  description: string;
  metadata: Record<string, any>;
  created_by?: string;
  user_name?: string;
  created_at: string;
}

export interface MeetingTask {
  id: string;
  meeting_id: string;
  description: string;
  assigned_to?: string;
  assigned_to_name?: string;
  due_date?: string;
  priority: string;
  status: string;
  created_at: string;
}

export interface MeetingFilters {
  contact_id?: string;
  company_id?: string;
  lawyer_id?: string;
  meeting_type?: string;
  status?: string;
  process_number?: string;
  search?: string;
}

export interface DashboardStats {
  recent_count: number;
  by_status: { status: string; count: string }[];
  pending_tasks: number;
  by_lawyer: { name: string; count: string }[];
}

export function useMeetings(filters?: MeetingFilters) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const params = new URLSearchParams();
  if (filters) {
    Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
  }
  const qs = params.toString();

  const meetingsQuery = useQuery<Meeting[]>({
    queryKey: ["meetings", qs],
    queryFn: () => api(`/api/meetings${qs ? `?${qs}` : ""}`),
  });

  const statsQuery = useQuery<DashboardStats>({
    queryKey: ["meetings-stats"],
    queryFn: () => api("/api/meetings/stats/dashboard"),
  });

  const createMeeting = useMutation({
    mutationFn: (data: Partial<Meeting>) => api<Meeting>("/api/meetings", { method: "POST", body: data }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["meetings"] }); qc.invalidateQueries({ queryKey: ["meetings-stats"] }); toast({ title: "Reunião criada com sucesso" }); },
    onError: (e: any) => toast({ title: "Erro ao criar reunião", description: e.message, variant: "destructive" }),
  });

  const updateMeeting = useMutation({
    mutationFn: ({ id, ...data }: Partial<Meeting> & { id: string }) => api<Meeting>(`/api/meetings/${id}`, { method: "PUT", body: data }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["meetings"] }); qc.invalidateQueries({ queryKey: ["meetings-stats"] }); toast({ title: "Reunião atualizada" }); },
    onError: (e: any) => toast({ title: "Erro ao atualizar", description: e.message, variant: "destructive" }),
  });

  const deleteMeeting = useMutation({
    mutationFn: (id: string) => api(`/api/meetings/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["meetings"] }); qc.invalidateQueries({ queryKey: ["meetings-stats"] }); toast({ title: "Reunião removida" }); },
    onError: (e: any) => toast({ title: "Erro ao remover", description: e.message, variant: "destructive" }),
  });

  return { meetings: meetingsQuery.data || [], isLoading: meetingsQuery.isLoading, stats: statsQuery.data, createMeeting, updateMeeting, deleteMeeting };
}

export function useMeetingDetail(id?: string) {
  return useQuery<Meeting>({
    queryKey: ["meeting", id],
    queryFn: () => api(`/api/meetings/${id}`),
    enabled: !!id,
    refetchInterval: (query) => {
      const meeting = query.state.data;
      return meeting && ["transcrevendo", "aguardando_transcricao"].includes(meeting.status) ? 4000 : false;
    },
  });
}

export function useMeetingTasks(meetingId?: string) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const tasksQuery = useQuery<MeetingTask[]>({
    queryKey: ["meeting-tasks", meetingId],
    queryFn: () => api(`/api/meetings/${meetingId}/tasks`),
    enabled: !!meetingId,
  });

  const createTask = useMutation({
    mutationFn: (data: Partial<MeetingTask>) => api(`/api/meetings/${meetingId}/tasks`, { method: "POST", body: data }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["meeting-tasks", meetingId] }); qc.invalidateQueries({ queryKey: ["meetings-stats"] }); },
    onError: (e: any) => toast({ title: "Erro ao criar tarefa", description: e.message, variant: "destructive" }),
  });

  const updateTask = useMutation({
    mutationFn: ({ id, ...data }: Partial<MeetingTask> & { id: string }) => api(`/api/meetings/${meetingId}/tasks/${id}`, { method: "PUT", body: data }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["meeting-tasks", meetingId] }); qc.invalidateQueries({ queryKey: ["meetings-stats"] }); },
  });

  const deleteTask = useMutation({
    mutationFn: (id: string) => api(`/api/meetings/${meetingId}/tasks/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["meeting-tasks", meetingId] }); },
  });

  return { tasks: tasksQuery.data || [], isLoading: tasksQuery.isLoading, createTask, updateTask, deleteTask };
}

export function useMeetingAudit(meetingId?: string) {
  const qc = useQueryClient();

  const auditQuery = useQuery<MeetingAuditLog[]>({
    queryKey: ["meeting-audit", meetingId],
    queryFn: () => api(`/api/meetings/${meetingId}/audit`),
    enabled: !!meetingId,
    refetchInterval: 5000, // poll every 5s during processing
  });

  return { logs: auditQuery.data || [], isLoading: auditQuery.isLoading, refetch: auditQuery.refetch };
}

export function useReprocessMeetingAudio(meetingId?: string) {
  const { toast } = useToast();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: () => api(`/api/meetings/${meetingId}/audio/reprocess`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meeting", meetingId] });
      qc.invalidateQueries({ queryKey: ["meeting-audit", meetingId] });
      qc.invalidateQueries({ queryKey: ["meetings"] });
      toast({ title: "Reprocessamento iniciado" });
    },
    onError: (e: any) => toast({ title: "Erro ao reprocessar áudio", description: e.message, variant: "destructive" }),
  });
}

export function useUploadMeetingAudio(meetingId?: string) {
  const { toast } = useToast();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ audioBlob, durationSeconds }: { audioBlob: Blob; durationSeconds: number }) => {
      const formData = new FormData();
      formData.append("audio", audioBlob, "meeting.webm");
      formData.append("duration_seconds", String(durationSeconds));

      const token = getAuthToken();
      const res = await fetch(`${API_URL}/api/meetings/${meetingId}/audio`, {
        method: "POST",
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: formData,
      });
      if (!res.ok) throw new Error((await res.json()).error || "Erro ao enviar áudio");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meetings"] });
      qc.invalidateQueries({ queryKey: ["meeting", meetingId] });
      qc.invalidateQueries({ queryKey: ["meeting-audit", meetingId] });
      qc.invalidateQueries({ queryKey: ["meetings-stats"] });
      toast({ title: "Áudio enviado", description: "Processamento iniciado automaticamente." });
    },
    onError: (e: any) => toast({ title: "Erro ao enviar áudio", description: e.message, variant: "destructive" }),
  });
}

export function useMeetingAIAnalysis(meetingId?: string) {
  const { toast } = useToast();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (data: { prompt: string; type?: string }) => 
      api(`/api/meetings/${meetingId}/analyze`, { method: "POST", body: data }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["meeting", meetingId] });
      toast({ title: "Análise concluída" });
      return data;
    },
    onError: (e: any) => toast({ title: "Erro na análise", description: e.message, variant: "destructive" }),
  });
}
