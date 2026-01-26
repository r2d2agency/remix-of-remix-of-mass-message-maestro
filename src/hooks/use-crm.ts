import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

// Types
export interface CRMGroup {
  id: string;
  name: string;
  description?: string;
  member_count: number;
  created_at: string;
}

export interface CRMGroupMember {
  id: string;
  group_id: string;
  user_id: string;
  is_supervisor: boolean;
  name: string;
  email: string;
}

export interface CRMStage {
  id?: string;
  funnel_id?: string;
  name: string;
  color: string;
  position: number;
  inactivity_hours: number;
  inactivity_color: string;
  is_final: boolean;
}

export interface CRMFunnel {
  id: string;
  name: string;
  description?: string;
  color: string;
  is_active: boolean;
  open_deals: number;
  total_value: number;
  stages?: CRMStage[];
  created_at: string;
}

export interface CRMCompany {
  id: string;
  name: string;
  cnpj?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  notes?: string;
  custom_fields?: Record<string, any>;
  deals_count: number;
  created_by_name?: string;
  created_at: string;
}

export interface CRMDealContact {
  id: string;
  name: string;
  phone: string;
  is_primary: boolean;
  role?: string;
}

export interface CRMDeal {
  id: string;
  funnel_id: string;
  stage_id: string;
  company_id: string;
  company_name: string;
  owner_id?: string;
  owner_name?: string;
  group_id?: string;
  group_name?: string;
  title: string;
  value: number;
  probability: number;
  expected_close_date?: string;
  status: 'open' | 'won' | 'lost';
  description?: string;
  tags?: string[];
  stage_name?: string;
  stage_color?: string;
  inactivity_hours?: number;
  inactivity_color?: string;
  pending_tasks: number;
  contacts?: CRMDealContact[];
  last_activity_at: string;
  last_opened_at: string;
  created_at: string;
}

export interface CRMTask {
  id: string;
  deal_id?: string;
  company_id?: string;
  deal_title?: string;
  company_name?: string;
  assigned_to?: string;
  assigned_to_name?: string;
  created_by?: string;
  created_by_name?: string;
  title: string;
  description?: string;
  type: 'task' | 'call' | 'email' | 'meeting' | 'follow_up';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  due_date?: string;
  reminder_at?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  completed_at?: string;
  created_at: string;
}

export interface TaskCounts {
  today: number;
  week: number;
  month: number;
  overdue: number;
  pending: number;
  completed: number;
}

// Groups
export function useCRMGroups() {
  return useQuery({
    queryKey: ["crm-groups"],
    queryFn: async () => {
      const response = await api.get("/api/crm/groups");
      return response.data as CRMGroup[];
    },
  });
}

export function useCRMGroupMembers(groupId: string | null) {
  return useQuery({
    queryKey: ["crm-group-members", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const response = await api.get(`/api/crm/groups/${groupId}/members`);
      return response.data as CRMGroupMember[];
    },
    enabled: !!groupId,
  });
}

export function useCRMGroupMutations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createGroup = useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      const response = await api.post("/api/crm/groups", data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-groups"] });
      toast({ title: "Grupo criado com sucesso" });
    },
  });

  const updateGroup = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; name: string; description?: string }) => {
      const response = await api.put(`/api/crm/groups/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-groups"] });
      toast({ title: "Grupo atualizado" });
    },
  });

  const deleteGroup = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/crm/groups/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-groups"] });
      toast({ title: "Grupo excluído" });
    },
  });

  const addMember = useMutation({
    mutationFn: async ({ groupId, userId, isSupervisor }: { groupId: string; userId: string; isSupervisor: boolean }) => {
      const response = await api.post(`/api/crm/groups/${groupId}/members`, { user_id: userId, is_supervisor: isSupervisor });
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["crm-group-members", variables.groupId] });
      queryClient.invalidateQueries({ queryKey: ["crm-groups"] });
    },
  });

  const removeMember = useMutation({
    mutationFn: async ({ groupId, userId }: { groupId: string; userId: string }) => {
      await api.delete(`/api/crm/groups/${groupId}/members/${userId}`);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["crm-group-members", variables.groupId] });
      queryClient.invalidateQueries({ queryKey: ["crm-groups"] });
    },
  });

  return { createGroup, updateGroup, deleteGroup, addMember, removeMember };
}

// Funnels
export function useCRMFunnels() {
  return useQuery({
    queryKey: ["crm-funnels"],
    queryFn: async () => {
      const response = await api.get("/api/crm/funnels");
      return response.data as CRMFunnel[];
    },
  });
}

export function useCRMFunnel(id: string | null) {
  return useQuery({
    queryKey: ["crm-funnel", id],
    queryFn: async () => {
      if (!id) return null;
      const response = await api.get(`/api/crm/funnels/${id}`);
      return response.data as CRMFunnel & { stages: CRMStage[] };
    },
    enabled: !!id,
  });
}

export function useCRMFunnelMutations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createFunnel = useMutation({
    mutationFn: async (data: { name: string; description?: string; color?: string; stages?: Partial<CRMStage>[] }) => {
      const response = await api.post("/api/crm/funnels", data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-funnels"] });
      toast({ title: "Funil criado com sucesso" });
    },
  });

  const updateFunnel = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; name?: string; description?: string; color?: string; is_active?: boolean; stages?: CRMStage[] }) => {
      const response = await api.put(`/api/crm/funnels/${id}`, data);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["crm-funnels"] });
      queryClient.invalidateQueries({ queryKey: ["crm-funnel", variables.id] });
      toast({ title: "Funil atualizado" });
    },
  });

  const deleteFunnel = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/crm/funnels/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-funnels"] });
      toast({ title: "Funil excluído" });
    },
  });

  return { createFunnel, updateFunnel, deleteFunnel };
}

// Companies
export function useCRMCompanies(search?: string) {
  return useQuery({
    queryKey: ["crm-companies", search],
    queryFn: async () => {
      const params = search ? `?search=${encodeURIComponent(search)}` : "";
      const response = await api.get(`/api/crm/companies${params}`);
      return response.data as CRMCompany[];
    },
  });
}

export function useCRMCompany(id: string | null) {
  return useQuery({
    queryKey: ["crm-company", id],
    queryFn: async () => {
      if (!id) return null;
      const response = await api.get(`/api/crm/companies/${id}`);
      return response.data as CRMCompany;
    },
    enabled: !!id,
  });
}

export function useCRMCompanyMutations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createCompany = useMutation({
    mutationFn: async (data: Partial<CRMCompany>) => {
      const response = await api.post("/api/crm/companies", data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-companies"] });
      toast({ title: "Empresa criada com sucesso" });
    },
  });

  const updateCompany = useMutation({
    mutationFn: async ({ id, ...data }: Partial<CRMCompany> & { id: string }) => {
      const response = await api.put(`/api/crm/companies/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-companies"] });
      toast({ title: "Empresa atualizada" });
    },
  });

  const deleteCompany = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/crm/companies/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-companies"] });
      toast({ title: "Empresa excluída" });
    },
  });

  const importCompanies = useMutation({
    mutationFn: async (companies: Partial<CRMCompany>[]) => {
      const response = await api.post("/api/crm/companies/import", { companies });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["crm-companies"] });
      toast({ title: `${data.imported} empresas importadas` });
    },
  });

  return { createCompany, updateCompany, deleteCompany, importCompanies };
}

// Deals
export function useCRMDeals(funnelId: string | null) {
  return useQuery({
    queryKey: ["crm-deals", funnelId],
    queryFn: async () => {
      if (!funnelId) return {};
      const response = await api.get(`/api/crm/funnels/${funnelId}/deals`);
      return response.data as Record<string, CRMDeal[]>;
    },
    enabled: !!funnelId,
  });
}

export function useCRMDeal(id: string | null) {
  return useQuery({
    queryKey: ["crm-deal", id],
    queryFn: async () => {
      if (!id) return null;
      const response = await api.get(`/api/crm/deals/${id}`);
      return response.data;
    },
    enabled: !!id,
  });
}

export function useCRMDealMutations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createDeal = useMutation({
    mutationFn: async (data: Partial<CRMDeal> & { contact_ids?: string[] }) => {
      const response = await api.post("/api/crm/deals", data);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["crm-deals", variables.funnel_id] });
      toast({ title: "Negociação criada com sucesso" });
    },
  });

  const updateDeal = useMutation({
    mutationFn: async ({ id, ...data }: Partial<CRMDeal> & { id: string }) => {
      const response = await api.put(`/api/crm/deals/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-deals"] });
      queryClient.invalidateQueries({ queryKey: ["crm-deal"] });
      toast({ title: "Negociação atualizada" });
    },
  });

  const moveDeal = useMutation({
    mutationFn: async ({ id, stage_id }: { id: string; stage_id: string }) => {
      const response = await api.post(`/api/crm/deals/${id}/move`, { stage_id });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-deals"] });
    },
  });

  const addContact = useMutation({
    mutationFn: async ({ dealId, contactId, role, isPrimary }: { dealId: string; contactId: string; role?: string; isPrimary?: boolean }) => {
      const response = await api.post(`/api/crm/deals/${dealId}/contacts`, { contact_id: contactId, role, is_primary: isPrimary });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-deal"] });
    },
  });

  const removeContact = useMutation({
    mutationFn: async ({ dealId, contactId }: { dealId: string; contactId: string }) => {
      await api.delete(`/api/crm/deals/${dealId}/contacts/${contactId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-deal"] });
    },
  });

  return { createDeal, updateDeal, moveDeal, addContact, removeContact };
}

// Tasks
export function useCRMTasks(filters?: { period?: string; status?: string; assigned_to?: string; deal_id?: string }) {
  const params = new URLSearchParams();
  if (filters?.period) params.append("period", filters.period);
  if (filters?.status) params.append("status", filters.status);
  if (filters?.assigned_to) params.append("assigned_to", filters.assigned_to);
  if (filters?.deal_id) params.append("deal_id", filters.deal_id);

  return useQuery({
    queryKey: ["crm-tasks", filters],
    queryFn: async () => {
      const response = await api.get(`/api/crm/tasks?${params.toString()}`);
      return response.data as CRMTask[];
    },
  });
}

export function useCRMTaskCounts() {
  return useQuery({
    queryKey: ["crm-task-counts"],
    queryFn: async () => {
      const response = await api.get("/api/crm/tasks/counts");
      return response.data as TaskCounts;
    },
  });
}

export function useCRMTaskMutations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createTask = useMutation({
    mutationFn: async (data: Partial<CRMTask>) => {
      const response = await api.post("/api/crm/tasks", data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["crm-task-counts"] });
      queryClient.invalidateQueries({ queryKey: ["crm-deal"] });
      toast({ title: "Tarefa criada com sucesso" });
    },
  });

  const updateTask = useMutation({
    mutationFn: async ({ id, ...data }: Partial<CRMTask> & { id: string }) => {
      const response = await api.put(`/api/crm/tasks/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["crm-task-counts"] });
      toast({ title: "Tarefa atualizada" });
    },
  });

  const completeTask = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.post(`/api/crm/tasks/${id}/complete`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["crm-task-counts"] });
      toast({ title: "Tarefa concluída" });
    },
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/crm/tasks/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["crm-task-counts"] });
      toast({ title: "Tarefa excluída" });
    },
  });

  return { createTask, updateTask, completeTask, deleteTask };
}
