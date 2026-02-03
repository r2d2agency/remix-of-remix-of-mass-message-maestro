import React, { useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Clock,
  AlertTriangle,
  Target,
  Calendar,
  MessageSquare,
  DollarSign,
  Activity,
  Zap,
  ThermometerSun,
  Phone,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface DealData {
  id: string;
  title: string;
  value: number;
  status: string;
  stage_name?: string;
  stage_position?: number;
  total_stages?: number;
  created_at: string;
  updated_at: string;
  last_activity_at?: string;
  contact_phone?: string;
  tasks_pending?: number;
  meetings_scheduled?: number;
  messages_count?: number;
  response_times?: number[]; // Array of response times in minutes
  won_at?: string;
  lost_at?: string;
}

interface ConversationData {
  last_message_at?: string;
  messages_count?: number;
  avg_response_time_minutes?: number;
  response_hours?: number[]; // Hours when contact responded (0-23)
}

interface PredictiveInsights {
  closeProbability: number;
  closeTimeframe: string;
  churnRisk: 'low' | 'medium' | 'high';
  churnReasons: string[];
  bestContactTimes: { hour: number; day: string; score: number }[];
  nextActions: string[];
  healthScore: number;
}

// Analyze deal patterns to predict close probability
function calculateCloseProbability(deal: DealData, avgDaysToClose?: number): number {
  let score = 50; // Base score
  
  // Stage progress (0-30 points)
  if (deal.stage_position && deal.total_stages) {
    const stageProgress = deal.stage_position / deal.total_stages;
    score += stageProgress * 30;
  }
  
  // Recent activity (0-20 points)
  if (deal.last_activity_at) {
    const daysSinceActivity = (Date.now() - new Date(deal.last_activity_at).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceActivity < 1) score += 20;
    else if (daysSinceActivity < 3) score += 15;
    else if (daysSinceActivity < 7) score += 10;
    else if (daysSinceActivity < 14) score += 5;
    else score -= 10;
  }
  
  // Engagement signals (0-15 points)
  if (deal.messages_count) {
    if (deal.messages_count > 20) score += 15;
    else if (deal.messages_count > 10) score += 10;
    else if (deal.messages_count > 5) score += 5;
  }
  
  // Tasks and meetings (0-15 points)
  if (deal.meetings_scheduled && deal.meetings_scheduled > 0) score += 10;
  if (deal.tasks_pending === 0) score += 5; // All tasks completed
  
  // Deal age vs average (−10 to +10)
  if (avgDaysToClose) {
    const dealAge = (Date.now() - new Date(deal.created_at).getTime()) / (1000 * 60 * 60 * 24);
    if (dealAge < avgDaysToClose * 0.5) score += 10;
    else if (dealAge > avgDaysToClose * 1.5) score -= 10;
  }
  
  return Math.min(Math.max(score, 5), 95);
}

// Estimate close timeframe
function estimateCloseTimeframe(deal: DealData, probability: number): string {
  if (probability >= 80) return '1-2 semanas';
  if (probability >= 60) return '2-4 semanas';
  if (probability >= 40) return '1-2 meses';
  if (probability >= 20) return '2-3 meses';
  return '3+ meses';
}

// Calculate churn risk based on behavior patterns
function calculateChurnRisk(deal: DealData, conversation?: ConversationData): { 
  risk: 'low' | 'medium' | 'high'; 
  reasons: string[] 
} {
  const reasons: string[] = [];
  let riskScore = 0;
  
  // Days since last activity
  const lastActivity = deal.last_activity_at || deal.updated_at;
  const daysSinceActivity = (Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24);
  
  if (daysSinceActivity > 14) {
    riskScore += 30;
    reasons.push('Sem atividade há mais de 14 dias');
  } else if (daysSinceActivity > 7) {
    riskScore += 15;
    reasons.push('Baixa atividade recente');
  }
  
  // Last message timing
  if (conversation?.last_message_at) {
    const daysSinceMessage = (Date.now() - new Date(conversation.last_message_at).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceMessage > 7) {
      riskScore += 25;
      reasons.push('Cliente não responde há dias');
    }
  }
  
  // Response time degradation
  if (conversation?.avg_response_time_minutes) {
    if (conversation.avg_response_time_minutes > 1440) { // > 24h
      riskScore += 20;
      reasons.push('Tempo de resposta muito alto');
    } else if (conversation.avg_response_time_minutes > 480) { // > 8h
      riskScore += 10;
      reasons.push('Tempo de resposta elevado');
    }
  }
  
  // Stalled in stage
  const stageAge = (Date.now() - new Date(deal.updated_at).getTime()) / (1000 * 60 * 60 * 24);
  if (stageAge > 21) {
    riskScore += 20;
    reasons.push('Parado na mesma etapa há 3 semanas');
  }
  
  // Pending tasks not being addressed
  if (deal.tasks_pending && deal.tasks_pending > 3) {
    riskScore += 15;
    reasons.push('Muitas tarefas pendentes');
  }
  
  let risk: 'low' | 'medium' | 'high';
  if (riskScore >= 50) risk = 'high';
  else if (riskScore >= 25) risk = 'medium';
  else risk = 'low';
  
  return { risk, reasons };
}

// Calculate best times to contact based on response patterns
function calculateBestContactTimes(conversation?: ConversationData): { hour: number; day: string; score: number }[] {
  // Default optimal times based on general patterns if no data
  const defaultTimes = [
    { hour: 10, day: 'Terça', score: 85 },
    { hour: 14, day: 'Quarta', score: 82 },
    { hour: 11, day: 'Quinta', score: 78 },
  ];
  
  if (!conversation?.response_hours || conversation.response_hours.length < 5) {
    return defaultTimes;
  }
  
  // Count frequency of response hours
  const hourCounts: Record<number, number> = {};
  conversation.response_hours.forEach(hour => {
    hourCounts[hour] = (hourCounts[hour] || 0) + 1;
  });
  
  // Sort by frequency and get top 3
  const sortedHours = Object.entries(hourCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);
  
  const days = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];
  const maxCount = parseInt(sortedHours[0]?.[1]?.toString() || '1');
  
  return sortedHours.map(([hour, count], idx) => ({
    hour: parseInt(hour),
    day: days[idx % days.length],
    score: Math.round((count / maxCount) * 100),
  }));
}

// Calculate overall health score
function calculateHealthScore(probability: number, churnRisk: 'low' | 'medium' | 'high'): number {
  let score = probability;
  
  if (churnRisk === 'high') score -= 30;
  else if (churnRisk === 'medium') score -= 15;
  
  return Math.min(Math.max(score, 0), 100);
}

// Generate next action recommendations
function generateNextActions(deal: DealData, insights: Partial<PredictiveInsights>): string[] {
  const actions: string[] = [];
  
  if (insights.churnRisk === 'high') {
    actions.push('⚠️ Entrar em contato urgente para reengajar');
  }
  
  if (deal.tasks_pending && deal.tasks_pending > 0) {
    actions.push(`✅ Completar ${deal.tasks_pending} tarefa(s) pendente(s)`);
  }
  
  if (!deal.meetings_scheduled || deal.meetings_scheduled === 0) {
    actions.push('📅 Agendar reunião de follow-up');
  }
  
  if (insights.closeProbability && insights.closeProbability >= 70) {
    actions.push('🎯 Preparar proposta final');
  }
  
  if (insights.bestContactTimes && insights.bestContactTimes.length > 0) {
    const best = insights.bestContactTimes[0];
    actions.push(`📞 Ligar às ${best.hour}h (${best.day})`);
  }
  
  const daysSinceUpdate = (Date.now() - new Date(deal.updated_at).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceUpdate > 7) {
    actions.push('📝 Atualizar status da negociação');
  }
  
  return actions.slice(0, 4);
}

// Main analysis function
export function analyzeDeal(deal: DealData, conversation?: ConversationData, avgDaysToClose?: number): PredictiveInsights {
  const closeProbability = calculateCloseProbability(deal, avgDaysToClose);
  const closeTimeframe = estimateCloseTimeframe(deal, closeProbability);
  const { risk: churnRisk, reasons: churnReasons } = calculateChurnRisk(deal, conversation);
  const bestContactTimes = calculateBestContactTimes(conversation);
  const healthScore = calculateHealthScore(closeProbability, churnRisk);
  
  const insights: PredictiveInsights = {
    closeProbability,
    closeTimeframe,
    churnRisk,
    churnReasons,
    bestContactTimes,
    healthScore,
    nextActions: [],
  };
  
  insights.nextActions = generateNextActions(deal, insights);
  
  return insights;
}

interface PredictiveAnalyticsCardProps {
  deal: DealData;
  conversation?: ConversationData;
  avgDaysToClose?: number;
  compact?: boolean;
  className?: string;
}

export function PredictiveAnalyticsCard({
  deal,
  conversation,
  avgDaysToClose,
  compact = false,
  className,
}: PredictiveAnalyticsCardProps) {
  const insights = useMemo(
    () => analyzeDeal(deal, conversation, avgDaysToClose),
    [deal, conversation, avgDaysToClose]
  );
  
  const churnColors = {
    low: 'text-green-600 bg-green-100 dark:bg-green-900/30',
    medium: 'text-amber-600 bg-amber-100 dark:bg-amber-900/30',
    high: 'text-red-600 bg-red-100 dark:bg-red-900/30',
  };
  
  const churnLabels = {
    low: 'Baixo',
    medium: 'Médio',
    high: 'Alto',
  };
  
  if (compact) {
    return (
      <div className={cn("space-y-2", className)}>
        {/* Close Probability */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Target className="h-3 w-3" />
            Prob. Fechamento
          </span>
          <div className="flex items-center gap-2">
            <Progress value={insights.closeProbability} className="w-16 h-1.5" />
            <span className="text-xs font-medium w-8">{insights.closeProbability}%</span>
          </div>
        </div>
        
        {/* Churn Risk */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            Risco Churn
          </span>
          <Badge variant="outline" className={cn("text-[10px] h-5", churnColors[insights.churnRisk])}>
            {churnLabels[insights.churnRisk]}
          </Badge>
        </div>
        
        {/* Best Contact Time */}
        {insights.bestContactTimes[0] && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Melhor Horário
            </span>
            <span className="text-xs font-medium">
              {insights.bestContactTimes[0].hour}h ({insights.bestContactTimes[0].day})
            </span>
          </div>
        )}
      </div>
    );
  }
  
  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          Análise Preditiva
          <Badge variant="secondary" className="text-[10px] ml-auto">IA</Badge>
        </CardTitle>
        <CardDescription>
          Insights baseados em padrões de comportamento
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Health Score */}
        <div className="text-center p-4 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 border">
          <div className="text-3xl font-bold text-primary mb-1">
            {insights.healthScore}
          </div>
          <div className="text-xs text-muted-foreground">Health Score</div>
        </div>
        
        {/* Close Probability */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <Target className="h-4 w-4 text-green-500" />
              Probabilidade de Fechamento
            </span>
            <span className="font-bold">{insights.closeProbability}%</span>
          </div>
          <Progress value={insights.closeProbability} className="h-2" />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Previsão: {insights.closeTimeframe}</span>
            {insights.closeProbability >= 70 ? (
              <span className="flex items-center gap-1 text-green-600">
                <TrendingUp className="h-3 w-3" />
                Alta chance
              </span>
            ) : insights.closeProbability <= 30 ? (
              <span className="flex items-center gap-1 text-red-600">
                <TrendingDown className="h-3 w-3" />
                Precisa atenção
              </span>
            ) : null}
          </div>
        </div>
        
        {/* Churn Risk */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Risco de Churn
            </span>
            <Badge className={churnColors[insights.churnRisk]}>
              {churnLabels[insights.churnRisk]}
            </Badge>
          </div>
          {insights.churnReasons.length > 0 && (
            <ul className="text-xs text-muted-foreground space-y-1 ml-6">
              {insights.churnReasons.map((reason, idx) => (
                <li key={idx} className="list-disc">{reason}</li>
              ))}
            </ul>
          )}
        </div>
        
        {/* Best Contact Times */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Phone className="h-4 w-4 text-blue-500" />
            <span>Melhores Horários para Contato</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {insights.bestContactTimes.map((time, idx) => (
              <div 
                key={idx}
                className={cn(
                  "text-center p-2 rounded-lg border",
                  idx === 0 ? "bg-primary/10 border-primary/30" : "bg-muted/50"
                )}
              >
                <div className="text-lg font-bold">{time.hour}h</div>
                <div className="text-[10px] text-muted-foreground">{time.day}</div>
              </div>
            ))}
          </div>
        </div>
        
        {/* Next Actions */}
        {insights.nextActions.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Zap className="h-4 w-4 text-purple-500" />
              <span>Próximas Ações Recomendadas</span>
            </div>
            <div className="space-y-1">
              {insights.nextActions.map((action, idx) => (
                <div key={idx} className="text-xs p-2 rounded bg-muted/50 border-l-2 border-primary/50">
                  {action}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Mini badge for Kanban cards
interface PredictiveBadgeProps {
  deal: DealData;
  conversation?: ConversationData;
  className?: string;
}

export function PredictiveBadge({ deal, conversation, className }: PredictiveBadgeProps) {
  const insights = useMemo(
    () => analyzeDeal(deal, conversation),
    [deal, conversation]
  );
  
  const getColor = () => {
    if (insights.healthScore >= 70) return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    if (insights.healthScore >= 40) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
  };
  
  const getIcon = () => {
    if (insights.healthScore >= 70) return <TrendingUp className="h-3 w-3" />;
    if (insights.healthScore >= 40) return <ThermometerSun className="h-3 w-3" />;
    return <TrendingDown className="h-3 w-3" />;
  };
  
  return (
    <Badge 
      variant="outline" 
      className={cn("text-[10px] h-5 gap-1", getColor(), className)}
      title={`Health Score: ${insights.healthScore}% | Prob. Fechamento: ${insights.closeProbability}%`}
    >
      {getIcon()}
      {insights.healthScore}%
    </Badge>
  );
}
