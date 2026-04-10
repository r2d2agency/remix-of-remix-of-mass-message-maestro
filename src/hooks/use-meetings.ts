import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
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
  created_by?: string;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
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
