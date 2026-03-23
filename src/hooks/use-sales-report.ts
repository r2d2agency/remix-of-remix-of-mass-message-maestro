import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface SalesRecord {
  record_number?: string;
  status?: string;
  client_name?: string;
  value: number;
  seller_name?: string;
  channel?: string;
  client_group?: string;
  municipality?: string;
  uf?: string;
  margin_percent?: number;
  record_date: string;
  invoice_date?: string;
  raw_data?: Record<string, unknown>;
}

export interface SalesGoal {
  id: string;
  goal_type: 'orcamento' | 'pedido' | 'faturamento';
  period_year: number;
  period_month: number;
  target_type: 'channel' | 'individual';
  target_name: string;
  goal_value: number;
  goal_count?: number;
}

export interface SalesSummaryRow {
  record_type: string;
  count: string;
  total_value: string;
}

export interface SalesBreakdownRow {
  record_type: string;
  channel?: string;
  seller_name?: string;
  name?: string;
  count: string;
  total_value: string;
}

export function useSalesReportSummary(params: { startDate?: string; endDate?: string; recordType?: string }) {
  const sp = new URLSearchParams();
  if (params.startDate) sp.set('start_date', params.startDate);
  if (params.endDate) sp.set('end_date', params.endDate);
  if (params.recordType) sp.set('record_type', params.recordType);

  return useQuery({
    queryKey: ["sales-report-summary", params],
    queryFn: () => api<{
      totals: SalesSummaryRow[];
      byChannel: SalesBreakdownRow[];
      bySeller: SalesBreakdownRow[];
    }>(`/api/sales-report/summary?${sp.toString()}`),
  });
}

export function useSalesDimensions() {
  return useQuery({
    queryKey: ["sales-dimensions"],
    queryFn: () => api<{ channels: string[]; sellers: string[] }>(`/api/sales-report/dimensions`),
  });
}

export function useSalesGoals(params: { year: number; month: number; goalType?: string }) {
  const sp = new URLSearchParams();
  sp.set('year', String(params.year));
  sp.set('month', String(params.month));
  if (params.goalType) sp.set('goal_type', params.goalType);

  return useQuery({
    queryKey: ["sales-goals", params],
    queryFn: () => api<SalesGoal[]>(`/api/sales-report/goals?${sp.toString()}`),
  });
}

export function useSalesGoalsVsRealized(params: { year: number; month: number }) {
  return useQuery({
    queryKey: ["sales-goals-vs-realized", params],
    queryFn: () => api<{
      goals: SalesGoal[];
      realizedByChannel: SalesBreakdownRow[];
      realizedBySeller: SalesBreakdownRow[];
    }>(`/api/sales-report/goals-vs-realized?year=${params.year}&month=${params.month}`),
  });
}

export function useImportSalesRecords() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { record_type: string; records: SalesRecord[] }) =>
      api<{ imported: number }>('/api/sales-report/import', { method: 'POST', body: data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-report-summary"] });
      qc.invalidateQueries({ queryKey: ["sales-dimensions"] });
      qc.invalidateQueries({ queryKey: ["sales-goals-vs-realized"] });
    },
  });
}

export function useSaveGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<SalesGoal, 'id'>) =>
      api<SalesGoal>('/api/sales-report/goals', { method: 'POST', body: data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-goals"] });
      qc.invalidateQueries({ queryKey: ["sales-goals-vs-realized"] });
    },
  });
}

export function useDeleteGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<{ ok: boolean }>(`/api/sales-report/goals/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-goals"] });
      qc.invalidateQueries({ queryKey: ["sales-goals-vs-realized"] });
    },
  });
}
