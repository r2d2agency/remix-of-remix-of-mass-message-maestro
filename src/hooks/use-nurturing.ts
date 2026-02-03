import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";

// Types
export interface NurturingSequence {
  id: string;
  organization_id: string;
  name: string;
  description?: string;
  trigger_type: 'manual' | 'deal_stage' | 'tag_added' | 'form_submitted' | 'webhook';
  trigger_config: Record<string, any>;
  is_active: boolean;
  pause_on_reply: boolean;
  pause_on_deal_won: boolean;
  exit_on_reply: boolean;
  contacts_enrolled: number;
  contacts_completed: number;
  contacts_converted: number;
  steps_count?: number;
  created_by?: string;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
  steps?: NurturingStep[];
}

export interface NurturingStep {
  id: string;
  sequence_id: string;
  step_order: number;
  delay_value: number;
  delay_unit: 'minutes' | 'hours' | 'days';
  channel: 'whatsapp' | 'email';
  whatsapp_content?: string;
  whatsapp_media_url?: string;
  whatsapp_media_type?: string;
  email_subject?: string;
  email_body?: string;
  email_template_id?: string;
  conditions: Record<string, any>;
  skip_if_replied: boolean;
  sent_count: number;
  opened_count: number;
  clicked_count: number;
  replied_count: number;
  created_at: string;
  updated_at: string;
}

export interface NurturingEnrollment {
  id: string;
  sequence_id: string;
  organization_id: string;
  contact_phone?: string;
  contact_email?: string;
  contact_name?: string;
  conversation_id?: string;
  deal_id?: string;
  current_step: number;
  status: 'active' | 'paused' | 'completed' | 'exited' | 'converted';
  pause_reason?: string;
  next_step_at?: string;
  enrolled_at: string;
  paused_at?: string;
  completed_at?: string;
  last_activity_at: string;
  variables: Record<string, any>;
  steps_executed?: number;
  created_at: string;
  updated_at: string;
}

export interface SequenceStats {
  enrollments: {
    total: number;
    active: number;
    paused: number;
    completed: number;
    exited: number;
    converted: number;
  };
  steps: Array<{
    id: string;
    step_order: number;
    channel: string;
    sent_count: number;
    opened_count: number;
    clicked_count: number;
    replied_count: number;
  }>;
}

// Hooks

export function useNurturingSequences() {
  return useQuery({
    queryKey: ["nurturing-sequences"],
    queryFn: () => api<NurturingSequence[]>("/api/nurturing"),
  });
}

export function useNurturingSequence(id: string | null) {
  return useQuery({
    queryKey: ["nurturing-sequence", id],
    queryFn: () => api<NurturingSequence>(`/api/nurturing/${id}`),
    enabled: !!id,
  });
}

export function useSequenceEnrollments(sequenceId: string | null, status?: string) {
  return useQuery({
    queryKey: ["nurturing-enrollments", sequenceId, status],
    queryFn: () => {
      let url = `/api/nurturing/${sequenceId}/enrollments`;
      if (status) url += `?status=${status}`;
      return api<NurturingEnrollment[]>(url);
    },
    enabled: !!sequenceId,
  });
}

export function useSequenceStats(sequenceId: string | null) {
  return useQuery({
    queryKey: ["nurturing-stats", sequenceId],
    queryFn: () => api<SequenceStats>(`/api/nurturing/${sequenceId}/stats`),
    enabled: !!sequenceId,
  });
}

export function useNurturingMutations() {
  const queryClient = useQueryClient();

  const createSequence = useMutation({
    mutationFn: (data: Partial<NurturingSequence> & { steps?: Partial<NurturingStep>[] }) =>
      api<NurturingSequence>("/api/nurturing", { method: "POST", body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["nurturing-sequences"] });
      toast.success("Sequência criada com sucesso");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao criar sequência");
    },
  });

  const updateSequence = useMutation({
    mutationFn: ({ id, ...data }: Partial<NurturingSequence> & { id: string }) =>
      api<NurturingSequence>(`/api/nurturing/${id}`, { method: "PATCH", body: data }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["nurturing-sequences"] });
      queryClient.invalidateQueries({ queryKey: ["nurturing-sequence", variables.id] });
      toast.success("Sequência atualizada");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar sequência");
    },
  });

  const deleteSequence = useMutation({
    mutationFn: (id: string) =>
      api(`/api/nurturing/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["nurturing-sequences"] });
      toast.success("Sequência excluída");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao excluir sequência");
    },
  });

  const addStep = useMutation({
    mutationFn: ({ sequenceId, ...step }: Partial<NurturingStep> & { sequenceId: string }) =>
      api<NurturingStep>(`/api/nurturing/${sequenceId}/steps`, { method: "POST", body: step }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["nurturing-sequence", variables.sequenceId] });
      toast.success("Passo adicionado");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao adicionar passo");
    },
  });

  const updateStep = useMutation({
    mutationFn: ({ stepId, sequenceId, ...data }: Partial<NurturingStep> & { stepId: string; sequenceId: string }) =>
      api<NurturingStep>(`/api/nurturing/steps/${stepId}`, { method: "PATCH", body: data }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["nurturing-sequence", variables.sequenceId] });
      toast.success("Passo atualizado");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar passo");
    },
  });

  const deleteStep = useMutation({
    mutationFn: ({ stepId, sequenceId }: { stepId: string; sequenceId: string }) =>
      api(`/api/nurturing/steps/${stepId}`, { method: "DELETE" }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["nurturing-sequence", variables.sequenceId] });
      toast.success("Passo excluído");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao excluir passo");
    },
  });

  const enrollContact = useMutation({
    mutationFn: ({ sequenceId, ...data }: { 
      sequenceId: string;
      contact_phone?: string;
      contact_email?: string;
      contact_name?: string;
      conversation_id?: string;
      deal_id?: string;
      variables?: Record<string, any>;
    }) =>
      api<NurturingEnrollment>(`/api/nurturing/${sequenceId}/enroll`, { method: "POST", body: data }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["nurturing-enrollments", variables.sequenceId] });
      queryClient.invalidateQueries({ queryKey: ["nurturing-stats", variables.sequenceId] });
      toast.success("Contato inscrito na sequência");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao inscrever contato");
    },
  });

  const pauseEnrollment = useMutation({
    mutationFn: ({ enrollmentId, reason, sequenceId }: { enrollmentId: string; reason?: string; sequenceId: string }) =>
      api<NurturingEnrollment>(`/api/nurturing/enrollments/${enrollmentId}/pause`, { 
        method: "POST", 
        body: { reason } 
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["nurturing-enrollments", variables.sequenceId] });
      toast.success("Inscrição pausada");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao pausar inscrição");
    },
  });

  const resumeEnrollment = useMutation({
    mutationFn: ({ enrollmentId, sequenceId }: { enrollmentId: string; sequenceId: string }) =>
      api<NurturingEnrollment>(`/api/nurturing/enrollments/${enrollmentId}/resume`, { method: "POST" }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["nurturing-enrollments", variables.sequenceId] });
      toast.success("Inscrição retomada");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao retomar inscrição");
    },
  });

  const removeEnrollment = useMutation({
    mutationFn: ({ enrollmentId, sequenceId }: { enrollmentId: string; sequenceId: string }) =>
      api(`/api/nurturing/enrollments/${enrollmentId}`, { method: "DELETE" }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["nurturing-enrollments", variables.sequenceId] });
      queryClient.invalidateQueries({ queryKey: ["nurturing-stats", variables.sequenceId] });
      toast.success("Inscrição removida");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao remover inscrição");
    },
  });

  return {
    createSequence,
    updateSequence,
    deleteSequence,
    addStep,
    updateStep,
    deleteStep,
    enrollContact,
    pauseEnrollment,
    resumeEnrollment,
    removeEnrollment,
  };
}
