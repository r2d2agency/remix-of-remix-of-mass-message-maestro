import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

// Types
export interface CRMTaskType {
  id: string;
  organization_id?: string;
  name: string;
  icon: string;
  color: string;
  is_global: boolean;
  is_active: boolean;
  position: number;
  created_at: string;
}

export interface CRMSegment {
  id: string;
  organization_id?: string;
  name: string;
  color: string;
  description?: string;
  is_global: boolean;
  is_active: boolean;
  position: number;
  deals_count?: number;
  created_at: string;
}

export interface CRMCustomField {
  id: string;
  organization_id?: string;
  entity_type: 'deal' | 'company' | 'task';
  field_name: string;
  field_label: string;
  field_type: 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'boolean';
  options?: string[];
  is_required: boolean;
  is_global: boolean;
  is_active: boolean;
  position: number;
  created_at: string;
}

// Task Types
export function useCRMTaskTypes() {
  return useQuery({
    queryKey: ["crm-task-types"],
    queryFn: async () => {
      return api<CRMTaskType[]>("/api/crm/config/task-types");
    },
  });
}

export function useCRMTaskTypeMutations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createTaskType = useMutation({
    mutationFn: async (data: Partial<CRMTaskType>) => {
      return api<CRMTaskType>("/api/crm/config/task-types", { method: "POST", body: data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-task-types"] });
      toast({ title: "Tipo de tarefa criado" });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao criar tipo", description: error.message, variant: "destructive" });
    },
  });

  const updateTaskType = useMutation({
    mutationFn: async ({ id, ...data }: Partial<CRMTaskType> & { id: string }) => {
      return api<CRMTaskType>(`/api/crm/config/task-types/${id}`, { method: "PUT", body: data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-task-types"] });
      toast({ title: "Tipo de tarefa atualizado" });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao atualizar tipo", description: error.message, variant: "destructive" });
    },
  });

  const deleteTaskType = useMutation({
    mutationFn: async (id: string) => {
      return api<void>(`/api/crm/config/task-types/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-task-types"] });
      toast({ title: "Tipo de tarefa excluído" });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao excluir tipo", description: error.message, variant: "destructive" });
    },
  });

  const cleanupDuplicates = useMutation({
    mutationFn: async () => {
      return api<{ success: boolean; deleted_count: number }>("/api/crm/config/task-types/cleanup", { method: "POST" });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["crm-task-types"] });
      toast({ title: "Limpeza concluída", description: `${data.deleted_count} tipo(s) duplicado(s) removido(s)` });
    },
    onError: (error: any) => {
      toast({ title: "Erro na limpeza", description: error.message, variant: "destructive" });
    },
  });

  return { createTaskType, updateTaskType, deleteTaskType, cleanupDuplicates };
}

// Segments
export function useCRMSegments() {
  return useQuery({
    queryKey: ["crm-segments"],
    queryFn: async () => {
      return api<CRMSegment[]>("/api/crm/config/segments");
    },
  });
}

export function useCRMSegmentMutations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createSegment = useMutation({
    mutationFn: async (data: Partial<CRMSegment>) => {
      return api<CRMSegment>("/api/crm/config/segments", { method: "POST", body: data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-segments"] });
      toast({ title: "Segmento criado" });
    },
  });

  const updateSegment = useMutation({
    mutationFn: async ({ id, ...data }: Partial<CRMSegment> & { id: string }) => {
      return api<CRMSegment>(`/api/crm/config/segments/${id}`, { method: "PUT", body: data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-segments"] });
      toast({ title: "Segmento atualizado" });
    },
  });

  const deleteSegment = useMutation({
    mutationFn: async (id: string) => {
      return api<void>(`/api/crm/config/segments/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-segments"] });
      toast({ title: "Segmento excluído" });
    },
  });

  const addSegmentToDeal = useMutation({
    mutationFn: async ({ dealId, segmentId }: { dealId: string; segmentId: string }) => {
      return api<any>(`/api/crm/deals/${dealId}/segments`, { method: "POST", body: { segment_id: segmentId } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-deal"] });
    },
  });

  const removeSegmentFromDeal = useMutation({
    mutationFn: async ({ dealId, segmentId }: { dealId: string; segmentId: string }) => {
      return api<void>(`/api/crm/deals/${dealId}/segments/${segmentId}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-deal"] });
    },
  });

  return { createSegment, updateSegment, deleteSegment, addSegmentToDeal, removeSegmentFromDeal };
}

// Custom Fields
export function useCRMCustomFields(entityType?: string) {
  return useQuery({
    queryKey: ["crm-custom-fields", entityType],
    queryFn: async () => {
      const params = entityType ? `?entity_type=${entityType}` : "";
      return api<CRMCustomField[]>(`/api/crm/config/custom-fields${params}`);
    },
  });
}

export function useCRMCustomFieldMutations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createCustomField = useMutation({
    mutationFn: async (data: Partial<CRMCustomField>) => {
      return api<CRMCustomField>("/api/crm/config/custom-fields", { method: "POST", body: data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-custom-fields"] });
      toast({ title: "Campo personalizado criado" });
    },
  });

  const updateCustomField = useMutation({
    mutationFn: async ({ id, ...data }: Partial<CRMCustomField> & { id: string }) => {
      return api<CRMCustomField>(`/api/crm/config/custom-fields/${id}`, { method: "PUT", body: data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-custom-fields"] });
      toast({ title: "Campo atualizado" });
    },
  });

  const deleteCustomField = useMutation({
    mutationFn: async (id: string) => {
      return api<void>(`/api/crm/config/custom-fields/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-custom-fields"] });
      toast({ title: "Campo excluído" });
    },
  });

  return { createCustomField, updateCustomField, deleteCustomField };
}

// Loss Reasons
export interface CRMLossReason {
  id: string;
  organization_id?: string;
  name: string;
  description?: string;
  is_active: boolean;
  position: number;
  usage_count: number;
  created_at: string;
}

export function useCRMLossReasons() {
  return useQuery({
    queryKey: ["crm-loss-reasons"],
    queryFn: async () => {
      return api<CRMLossReason[]>("/api/crm/config/loss-reasons");
    },
  });
}

export function useCRMLossReasonMutations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createLossReason = useMutation({
    mutationFn: async (data: Partial<CRMLossReason>) => {
      return api<CRMLossReason>("/api/crm/config/loss-reasons", { method: "POST", body: data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-loss-reasons"] });
      toast({ title: "Motivo de perda criado" });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao criar motivo", description: error.message, variant: "destructive" });
    },
  });

  const updateLossReason = useMutation({
    mutationFn: async ({ id, ...data }: Partial<CRMLossReason> & { id: string }) => {
      return api<CRMLossReason>(`/api/crm/config/loss-reasons/${id}`, { method: "PUT", body: data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-loss-reasons"] });
      toast({ title: "Motivo atualizado" });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao atualizar motivo", description: error.message, variant: "destructive" });
    },
  });

  const deleteLossReason = useMutation({
    mutationFn: async (id: string) => {
      return api<void>(`/api/crm/config/loss-reasons/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-loss-reasons"] });
      toast({ title: "Motivo excluído" });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao excluir motivo", description: error.message, variant: "destructive" });
    },
  });

  const resetToDefaults = useMutation({
    mutationFn: async () => {
      return api<CRMLossReason[]>("/api/crm/config/loss-reasons/reset-defaults", { method: "POST" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-loss-reasons"] });
      toast({ title: "Motivos resetados para padrão" });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao resetar motivos", description: error.message, variant: "destructive" });
    },
  });

  return { createLossReason, updateLossReason, deleteLossReason, resetToDefaults };
}
