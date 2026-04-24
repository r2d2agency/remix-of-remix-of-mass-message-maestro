import { useState, useCallback, useEffect } from 'react';
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

// Mock Data Generator
const generateMockData = (days: number): GhostAnalysisResult => {
  const total = 50 + Math.floor(Math.random() * 100);
  return {
    analyzed_at: new Date().toISOString(),
    summary: {
      total_analyzed: total,
      off_topic: Math.floor(total * 0.15),
      deal_risk: Math.floor(total * 0.08),
      slow_response: Math.floor(total * 0.2),
      no_followup: Math.floor(total * 0.12),
      sentiment_negative: Math.floor(total * 0.05),
      opportunities: Math.floor(total * 0.25),
      resolution_rate: 72 + Math.floor(Math.random() * 15),
      team_scores: [
        { user_name: "Ricardo Almeida", score: 85, conversations: 42, issues: 3 },
        { user_name: "Camila Santos", score: 92, conversations: 38, issues: 1 },
        { user_name: "Fernando Costa", score: 45, conversations: 25, issues: 12 },
      ],
      avg_response_times: [
        { user_name: "Ricardo Almeida", avg_minutes: 12, total_replies: 156 },
        { user_name: "Camila Santos", avg_minutes: 5, total_replies: 210 },
        { user_name: "Fernando Costa", avg_minutes: 45, total_replies: 89 },
      ],
      peak_hours: [
        { hour: 9, count: 5 },
        { hour: 10, count: 12 },
        { hour: 14, count: 18 },
        { hour: 16, count: 8 },
      ],
      critical_clients: [
        { name: "João Silva", phone: "11999999999", issues: 5, categories: ["slow_response", "deal_risk"] },
        { name: "Maria Oliveira", phone: "11888888888", issues: 3, categories: ["no_followup"] },
      ],
    },
    insights: [
      {
        id: "1",
        conversation_id: "conv1",
        contact_name: "João Silva",
        contact_phone: "11999999999",
        connection_name: "WhatsApp Principal",
        assigned_to_name: "Fernando Costa",
        category: "deal_risk",
        severity: "critical",
        title: "Cliente solicitou orçamento há 24h sem resposta",
        description: "O cliente demonstrou alto interesse em fechar o contrato mas não obteve retorno sobre os valores.",
        recommendation: "Enviar proposta imediatamente e pedir desculpas pelo atraso.",
        snippet: "Aguardo o valor para fechar ainda hoje.",
        last_message_at: new Date().toISOString(),
        message_count: 5,
      },
      {
        id: "2",
        conversation_id: "conv2",
        contact_name: "Maria Oliveira",
        contact_phone: "11888888888",
        connection_name: "WhatsApp Principal",
        assigned_to_name: "Ricardo Almeida",
        category: "opportunity",
        severity: "medium",
        title: "Potencial para Upsell identificado",
        description: "A cliente mencionou interesse em outra área do direito que o escritório atende.",
        recommendation: "Oferecer consulta cortesia para a nova demanda.",
        snippet: "Também estou precisando resolver uma questão trabalhista...",
        last_message_at: new Date().toISOString(),
        message_count: 12,
      },
      {
        id: "3",
        conversation_id: "conv3",
        contact_name: "Pedro Santos",
        contact_phone: "11777777777",
        connection_name: "WhatsApp Secundário",
        assigned_to_name: "Fernando Costa",
        category: "off_topic",
        severity: "low",
        title: "Conversa com conteúdo pessoal excessivo",
        description: "Atendente está desviando do assunto jurídico por mais de 10 mensagens.",
        recommendation: "Orientar atendente a manter foco no profissionalismo.",
        snippet: "Pois é, o jogo de ontem foi incrível mesmo!",
        last_message_at: new Date().toISOString(),
        message_count: 25,
      }
    ]
  };
};

export function useGhostAnalysis() {
  const [data, setData] = useState<GhostAnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<AnalysisStep>('idle');
  const [savedAnalyses, setSavedAnalyses] = useState<SavedAnalysis[]>([]);

  // Load saved analyses from local storage (now independent of backend)
  useEffect(() => {
    const cached = localStorage.getItem('ghost_analyses');
    if (cached) {
      try {
        setSavedAnalyses(JSON.parse(cached));
      } catch {
        setSavedAnalyses([]);
      }
    }
  }, []);

  const runAnalysis = useCallback(async (params?: { days?: number; connectionId?: string; connectionName?: string; analysisType?: string; analysisLabel?: string }) => {
    setIsLoading(true);
    setStep('fetching');
    
    try {
      // Simulate network delay
      await new Promise(r => setTimeout(r, 1200));
      setStep('analyzing');
      await new Promise(r => setTimeout(r, 1500));
      setStep('processing');
      await new Promise(r => setTimeout(r, 800));

      const result = generateMockData(params?.days || 7);
      
      setData(result);
      setStep('done');

      // Save to local storage
      const label = `${params?.analysisLabel || 'Completa'} • ${params?.connectionName || 'Todas'} • ${params?.days || 7}d`;
      const newEntry: SavedAnalysis = {
        id: Math.random().toString(36).substr(2, 9),
        label,
        data: result,
        days: params?.days || 7,
        connectionId: params?.connectionId,
        connectionName: params?.connectionName,
        timestamp: new Date().toISOString(),
      };
      
      setSavedAnalyses(prev => {
        const updated = [newEntry, ...prev].slice(0, 20);
        localStorage.setItem('ghost_analyses', JSON.stringify(updated));
        return updated;
      });

      toast.success(`Análise concluída: ${result.summary.total_analyzed} conversas analisadas`);
    } catch (err: any) {
      setStep('idle');
      toast.error('Erro ao executar análise fantasma');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadAnalysis = useCallback((analysis: SavedAnalysis) => {
    setData(analysis.data);
    setStep('done');
  }, []);

  const deleteAnalysis = useCallback(async (id: string) => {
    setSavedAnalyses(prev => {
      const updated = prev.filter(a => a.id !== id);
      localStorage.setItem('ghost_analyses', JSON.stringify(updated));
      return updated;
    });
    toast.info("Análise removida");
  }, []);

  const resetStep = useCallback(() => {
    setStep('idle');
  }, []);

  return { data, isLoading, step, savedAnalyses, runAnalysis, loadAnalysis, deleteAnalysis, resetStep };
}