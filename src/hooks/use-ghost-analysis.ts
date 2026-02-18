import { useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';

export interface GhostInsight {
  id: string;
  conversation_id: string;
  contact_name: string;
  contact_phone: string;
  connection_name: string;
  assigned_to_name: string | null;
  category: 'off_topic' | 'deal_risk' | 'slow_response' | 'no_followup' | 'sentiment_negative' | 'opportunity';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  recommendation: string;
  snippet: string;
  last_message_at: string;
  message_count: number;
}

export interface GhostSummary {
  total_analyzed: number;
  off_topic: number;
  deal_risk: number;
  slow_response: number;
  no_followup: number;
  sentiment_negative: number;
  opportunities: number;
  team_scores: Array<{
    user_name: string;
    score: number;
    conversations: number;
    issues: number;
  }>;
}

export interface GhostAnalysisResult {
  summary: GhostSummary;
  insights: GhostInsight[];
  analyzed_at: string;
}

export function useGhostAnalysis() {
  const [data, setData] = useState<GhostAnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const runAnalysis = useCallback(async (params?: { days?: number; connectionId?: string }) => {
    setIsLoading(true);
    try {
      const queryParams = new URLSearchParams();
      if (params?.days) queryParams.set('days', String(params.days));
      if (params?.connectionId) queryParams.set('connection_id', params.connectionId);
      
      const result = await api<GhostAnalysisResult>(
        `/api/ghost/analyze?${queryParams.toString()}`
      );
      setData(result);
      toast.success(`Análise concluída: ${result.summary.total_analyzed} conversas analisadas`);
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao executar análise fantasma');
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { data, isLoading, runAnalysis };
}
