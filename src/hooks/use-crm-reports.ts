import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface SalesTimelineData {
  period: string;
  open: number;
  won: number;
  lost: number;
  wonValue: number;
  lostValue: number;
  openValue: number;
}

export interface SalesSummary {
  open: { count: number; value: number };
  won: { count: number; value: number };
  lost: { count: number; value: number };
  winRate: number;
  totalValue: number;
}

export interface FunnelSalesData {
  funnelId: string;
  funnelName: string;
  funnelColor: string;
  open: number;
  won: number;
  lost: number;
  wonValue: number;
}

export interface OwnerSalesData {
  userId: string;
  userName: string;
  wonCount: number;
  wonValue: number;
  totalDeals: number;
}

export interface SalesReportData {
  timeline: SalesTimelineData[];
  summary: SalesSummary;
  byFunnel: FunnelSalesData[];
  byOwner: OwnerSalesData[];
}

export interface ConversionStageData {
  stageId: string;
  stageName: string;
  stageColor: string;
  position: number;
  isFinal: boolean;
  dealCount: number;
  totalValue: number;
}

export function useCRMSalesReport(params: {
  startDate?: string;
  endDate?: string;
  funnelId?: string;
  groupBy?: 'day' | 'week' | 'month';
}) {
  const searchParams = new URLSearchParams();
  if (params.startDate) searchParams.append('start_date', params.startDate);
  if (params.endDate) searchParams.append('end_date', params.endDate);
  if (params.funnelId) searchParams.append('funnel_id', params.funnelId);
  if (params.groupBy) searchParams.append('group_by', params.groupBy);

  return useQuery({
    queryKey: ["crm-sales-report", params],
    queryFn: async () => {
      return api<SalesReportData>(`/api/crm/reports/sales?${searchParams.toString()}`);
    },
  });
}

export function useCRMConversionReport(params: {
  funnelId: string;
  startDate?: string;
  endDate?: string;
}) {
  const searchParams = new URLSearchParams();
  searchParams.append('funnel_id', params.funnelId);
  if (params.startDate) searchParams.append('start_date', params.startDate);
  if (params.endDate) searchParams.append('end_date', params.endDate);

  return useQuery({
    queryKey: ["crm-conversion-report", params],
    queryFn: async () => {
      return api<ConversionStageData[]>(`/api/crm/reports/conversion?${searchParams.toString()}`);
    },
    enabled: !!params.funnelId,
  });
}
