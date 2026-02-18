import { useState, useCallback, useEffect } from 'react';
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
  avg_response_times?: Array<{
    user_name: string;
    avg_minutes: number;
    total_replies: number;
  }>;
  peak_hours?: Array<{
    hour: number;
    count: number;
  }>;
  critical_clients?: Array<{
    name: string;
    phone: string;
    issues: number;
    categories: string[];
  }>;
  resolution_rate?: number;
}

export interface GhostAnalysisResult {
  summary: GhostSummary;
  insights: GhostInsight[];
  analyzed_at: string;
}

export type AnalysisStep = 'idle' | 'fetching' | 'analyzing' | 'processing' | 'done';

export interface SavedAnalysis {
  id: string;
  label: string;
  data: GhostAnalysisResult;
  days: number;
  connectionId?: string;
  connectionName?: string;
  timestamp: string;
}

export function useGhostAnalysis() {
  const [data, setData] = useState<GhostAnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<AnalysisStep>('idle');
  const [savedAnalyses, setSavedAnalyses] = useState<SavedAnalysis[]>([]);

  // Load saved analyses from backend on mount
  useEffect(() => {
    api<SavedAnalysis[]>('/api/ghost/analyses')
      .then(setSavedAnalyses)
      .catch(() => {});
  }, []);

  const runAnalysis = useCallback(async (params?: { days?: number; connectionId?: string; connectionName?: string; analysisType?: string; analysisLabel?: string }) => {
    setIsLoading(true);
    setStep('fetching');
    try {
      const queryParams = new URLSearchParams();
      if (params?.days) queryParams.set('days', String(params.days));
      if (params?.connectionId) queryParams.set('connection_id', params.connectionId);
      if (params?.analysisType) queryParams.set('analysis_type', params.analysisType);

      await new Promise(r => setTimeout(r, 800));
      setStep('analyzing');

      const result = await api<GhostAnalysisResult>(
        `/api/ghost/analyze?${queryParams.toString()}`
      );

      setStep('processing');
      await new Promise(r => setTimeout(r, 600));

      setData(result);
      setStep('done');

      // Save to backend
      const label = `${params?.analysisLabel || 'Completa'} • ${params?.connectionName || 'Todas'} • ${params?.days || 7}d`;
      try {
        const saved = await api<{ id: string; timestamp: string }>('/api/ghost/analyses', {
          method: 'POST',
          body: {
            label,
            data: result,
            days: params?.days || 7,
            connectionId: params?.connectionId,
            connectionName: params?.connectionName,
          },
        });
        const newEntry: SavedAnalysis = {
          id: saved.id,
          label,
          data: result,
          days: params?.days || 7,
          connectionId: params?.connectionId,
          connectionName: params?.connectionName,
          timestamp: saved.timestamp,
        };
        setSavedAnalyses(prev => [newEntry, ...prev].slice(0, 20));
      } catch {
        // Non-critical: analysis still works even if save fails
      }

      toast.success(`Análise concluída: ${result.summary.total_analyzed} conversas analisadas`);
    } catch (err: any) {
      setStep('idle');
      toast.error(err?.message || 'Erro ao executar análise fantasma');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadAnalysis = useCallback((analysis: SavedAnalysis) => {
    setData(analysis.data);
    setStep('done');
  }, []);

  const deleteAnalysis = useCallback(async (id: string) => {
    setSavedAnalyses(prev => prev.filter(a => a.id !== id));
    try {
      await api(`/api/ghost/analyses/${id}`, { method: 'DELETE' });
    } catch {
      // Silently fail
    }
  }, []);

  const resetStep = useCallback(() => {
    setStep('idle');
  }, []);

  return { data, isLoading, step, savedAnalyses, runAnalysis, loadAnalysis, deleteAnalysis, resetStep };
}
