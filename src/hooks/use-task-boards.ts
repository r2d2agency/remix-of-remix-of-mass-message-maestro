import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";

export interface TaskBoard {
  id: string;
  organization_id: string;
  name: string;
  type: 'global' | 'personal';
  created_by: string;
  created_by_name?: string;
  is_default: boolean;
  color: string;
  card_count: number;
  created_at: string;
}

export interface TaskBoardColumn {
  id: string;
  board_id: string;
  name: string;
  color: string;
  position: number;
  is_final: boolean;
}

export interface TaskCard {
  id: string;
  board_id: string;
  column_id: string;
  title: string;
  description?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  due_date?: string;
  assigned_to?: string;
  assigned_to_name?: string;
  created_by?: string;
  created_by_name?: string;
  contact_id?: string;
  contact_name?: string;
  deal_id?: string;
  deal_title?: string;
  company_id?: string;
  company_name?: string;
  position: number;
  tags: string[];
  attachments: { url: string; name: string; type: string }[];
  cover_color?: string;
  status: 'open' | 'completed' | 'archived';
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface ChecklistItem {
  text: string;
  checked: boolean;
  due_date?: string;
}

export interface TaskChecklist {
  id: string;
  card_id: string;
  title: string;
  items: ChecklistItem[];
  template_id?: string;
  position: number;
}

export interface ChecklistTemplate {
  id: string;
  organization_id: string;
  name: string;
  items: ChecklistItem[];
  created_at: string;
}

// Boards
export function useTaskBoards() {
  return useQuery<TaskBoard[]>({
    queryKey: ['task-boards'],
    queryFn: () => api<TaskBoard[]>('/api/task-boards/boards'),
  });
}

export function useTaskBoardMutations() {
  const qc = useQueryClient();
  const inv = () => { qc.invalidateQueries({ queryKey: ['task-boards'] }); };

  const createBoard = useMutation({
    mutationFn: (data: Partial<TaskBoard> & { columns?: any[] }) =>
      api<TaskBoard>('/api/task-boards/boards', { method: 'POST', body: data }),
    onSuccess: () => { inv(); toast.success("Quadro criado!"); },
  });

  const updateBoard = useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<TaskBoard>) =>
      api<TaskBoard>(`/api/task-boards/boards/${id}`, { method: 'PUT', body: data }),
    onSuccess: () => { inv(); },
  });

  const deleteBoard = useMutation({
    mutationFn: (id: string) => api(`/api/task-boards/boards/${id}`, { method: 'DELETE' }),
    onSuccess: () => { inv(); toast.success("Quadro excluído!"); },
  });

  const ensureDefault = useMutation({
    mutationFn: () => api<{ board_id: string; created: boolean }>('/api/task-boards/ensure-default', { method: 'POST' }),
    onSuccess: () => { inv(); },
  });

  return { createBoard, updateBoard, deleteBoard, ensureDefault };
}

// Columns
export function useTaskBoardColumns(boardId?: string) {
  return useQuery<TaskBoardColumn[]>({
    queryKey: ['task-board-columns', boardId],
    queryFn: () => api<TaskBoardColumn[]>(`/api/task-boards/boards/${boardId}/columns`),
    enabled: !!boardId,
  });
}

export function useTaskColumnMutations() {
  const qc = useQueryClient();
  const inv = () => { qc.invalidateQueries({ queryKey: ['task-board-columns'] }); };

  const createColumn = useMutation({
    mutationFn: ({ boardId, ...data }: { boardId: string } & Partial<TaskBoardColumn>) =>
      api<TaskBoardColumn>(`/api/task-boards/boards/${boardId}/columns`, { method: 'POST', body: data }),
    onSuccess: () => { inv(); },
  });

  const updateColumn = useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<TaskBoardColumn>) =>
      api<TaskBoardColumn>(`/api/task-boards/columns/${id}`, { method: 'PUT', body: data }),
    onSuccess: () => { inv(); },
  });

  const deleteColumn = useMutation({
    mutationFn: (id: string) => api(`/api/task-boards/columns/${id}`, { method: 'DELETE' }),
    onSuccess: () => { inv(); },
  });

  const reorderColumns = useMutation({
    mutationFn: (columns: { id: string; position: number }[]) =>
      api('/api/task-boards/columns/reorder', { method: 'PUT', body: { columns } }),
    onSuccess: () => { inv(); },
  });

  return { createColumn, updateColumn, deleteColumn, reorderColumns };
}

// Cards
export function useTaskCards(boardId?: string, filters?: { filter_user?: string; date_from?: string; date_to?: string }) {
  const params = new URLSearchParams();
  if (filters?.filter_user && filters.filter_user !== 'all') params.set('filter_user', filters.filter_user);
  if (filters?.date_from) params.set('date_from', filters.date_from);
  if (filters?.date_to) params.set('date_to', filters.date_to);
  const qs = params.toString();
  
  return useQuery<TaskCard[]>({
    queryKey: ['task-cards', boardId, filters?.filter_user, filters?.date_from, filters?.date_to],
    queryFn: () => api<TaskCard[]>(`/api/task-boards/boards/${boardId}/cards${qs ? `?${qs}` : ''}`),
    enabled: !!boardId,
  });
}

// All cards across boards (for Gantt)
export function useAllTaskCards() {
  return useQuery<TaskCard[]>({
    queryKey: ['task-cards-all'],
    queryFn: () => api<TaskCard[]>('/api/task-boards/cards/all'),
  });
}

export function useTaskCardMutations() {
  const qc = useQueryClient();
  const inv = () => {
    qc.invalidateQueries({ queryKey: ['task-cards'] });
    qc.invalidateQueries({ queryKey: ['task-cards-all'] });
  };

  const createCard = useMutation({
    mutationFn: (data: Partial<TaskCard>) =>
      api<TaskCard>('/api/task-boards/cards', { method: 'POST', body: data }),
    onSuccess: () => { inv(); toast.success("Tarefa criada!"); },
  });

  const updateCard = useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<TaskCard>) =>
      api<TaskCard>(`/api/task-boards/cards/${id}`, { method: 'PUT', body: data }),
    onSuccess: () => { inv(); },
  });

  const moveCard = useMutation({
    mutationFn: ({ id, ...data }: { id: string; column_id?: string; board_id?: string; position?: number; over_card_id?: string }) =>
      api(`/api/task-boards/cards/${id}/move`, { method: 'PUT', body: data }),
    onSuccess: () => { inv(); },
  });

  const deleteCard = useMutation({
    mutationFn: (id: string) => api(`/api/task-boards/cards/${id}`, { method: 'DELETE' }),
    onSuccess: () => { inv(); toast.success("Tarefa excluída!"); },
  });

  return { createCard, updateCard, moveCard, deleteCard };
}

// Checklists
export function useTaskChecklists(cardId?: string) {
  return useQuery<TaskChecklist[]>({
    queryKey: ['task-checklists', cardId],
    queryFn: () => api<TaskChecklist[]>(`/api/task-boards/cards/${cardId}/checklists`),
    enabled: !!cardId,
  });
}

export function useTaskChecklistMutations() {
  const qc = useQueryClient();
  const inv = () => { qc.invalidateQueries({ queryKey: ['task-checklists'] }); };

  const createChecklist = useMutation({
    mutationFn: ({ cardId, ...data }: { cardId: string } & Partial<TaskChecklist>) =>
      api<TaskChecklist>(`/api/task-boards/cards/${cardId}/checklists`, { method: 'POST', body: data }),
    onSuccess: () => { inv(); },
  });

  const updateChecklist = useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<TaskChecklist>) =>
      api<TaskChecklist>(`/api/task-boards/checklists/${id}`, { method: 'PUT', body: data }),
    onSuccess: () => { inv(); },
  });

  const deleteChecklist = useMutation({
    mutationFn: (id: string) => api(`/api/task-boards/checklists/${id}`, { method: 'DELETE' }),
    onSuccess: () => { inv(); },
  });

  return { createChecklist, updateChecklist, deleteChecklist };
}

// Checklist Templates
export function useChecklistTemplates() {
  return useQuery<ChecklistTemplate[]>({
    queryKey: ['checklist-templates'],
    queryFn: () => api<ChecklistTemplate[]>('/api/task-boards/checklist-templates'),
  });
}

export function useChecklistTemplateMutations() {
  const qc = useQueryClient();
  const inv = () => { qc.invalidateQueries({ queryKey: ['checklist-templates'] }); };

  const createTemplate = useMutation({
    mutationFn: (data: Partial<ChecklistTemplate>) =>
      api<ChecklistTemplate>('/api/task-boards/checklist-templates', { method: 'POST', body: data }),
    onSuccess: () => { inv(); toast.success("Template criado!"); },
  });

  const updateTemplate = useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<ChecklistTemplate>) =>
      api<ChecklistTemplate>(`/api/task-boards/checklist-templates/${id}`, { method: 'PUT', body: data }),
    onSuccess: () => { inv(); },
  });

  const deleteTemplate = useMutation({
    mutationFn: (id: string) => api(`/api/task-boards/checklist-templates/${id}`, { method: 'DELETE' }),
    onSuccess: () => { inv(); toast.success("Template excluído!"); },
  });

  return { createTemplate, updateTemplate, deleteTemplate };
}
