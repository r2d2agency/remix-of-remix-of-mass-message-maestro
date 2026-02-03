import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { 
  Smile, 
  Meh, 
  Frown, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  AlertTriangle,
  ThermometerSun,
  Sparkles
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { ChatMessage } from "@/hooks/use-chat";

interface SentimentIndicatorProps {
  messages: ChatMessage[];
  compact?: boolean;
  className?: string;
}

// Palavras indicativas de sentimento
const POSITIVE_WORDS = [
  'obrigado', 'obrigada', 'agradeço', 'excelente', 'ótimo', 'otimo', 'perfeito',
  'maravilhoso', 'incrível', 'incrivel', 'muito bom', 'adorei', 'amei', 'parabéns',
  'parabens', 'satisfeito', 'satisfeita', 'gostei', 'feliz', 'alegre', 'top',
  'show', 'sensacional', 'fantástico', 'fantastico', 'demais', 'melhor',
  'ajudou', 'resolvido', 'resolveu', 'funcionou', 'sucesso', '👍', '😊', '😍',
  '❤️', '💯', '🎉', '👏', 'bom dia', 'boa tarde', 'boa noite', 'por favor',
  'gentil', 'educado', 'rápido', 'rapido', 'eficiente'
];

const NEGATIVE_WORDS = [
  'problema', 'erro', 'não funciona', 'nao funciona', 'péssimo', 'pessimo',
  'horrível', 'horrivel', 'ruim', 'pior', 'absurdo', 'vergonha', 'raiva',
  'irritado', 'irritada', 'frustrado', 'frustrada', 'decepcionado', 'decepcionada',
  'insatisfeito', 'insatisfeita', 'reclamar', 'reclamação', 'reclamacao',
  'cancelar', 'devolver', 'devolução', 'devolucao', 'reembolso', 'estorno',
  'demora', 'demorado', 'lento', 'inaceitável', 'inaceitavel', 'mentira',
  'enganado', 'enganada', 'golpe', 'fraude', 'processando', 'procon',
  'advogado', 'justiça', 'justica', '😡', '😤', '😠', '💢', '👎', 'urgente',
  'urgência', 'urgencia', 'desespero', 'socorro', 'ajuda'
];

const URGENCY_WORDS = [
  'urgente', 'urgência', 'urgencia', 'imediato', 'agora', 'hoje', 'já', 'ja',
  'socorro', 'ajuda', 'preciso', 'precisando', 'desespero', 'desesperado',
  'desesperada', 'por favor me ajude', 'não sei mais', 'nao sei mais'
];

interface SentimentAnalysis {
  score: number; // -1 a 1
  label: 'positive' | 'neutral' | 'negative' | 'mixed';
  trend: 'improving' | 'stable' | 'declining';
  urgency: boolean;
  confidence: number; // 0 a 1
  positiveCount: number;
  negativeCount: number;
}

function analyzeSentiment(messages: ChatMessage[]): SentimentAnalysis {
  // Filtrar apenas mensagens do cliente (não from_me)
  const customerMessages = messages
    .filter(m => !m.from_me && m.content)
    .slice(-20); // Últimas 20 mensagens do cliente

  if (customerMessages.length === 0) {
    return {
      score: 0,
      label: 'neutral',
      trend: 'stable',
      urgency: false,
      confidence: 0,
      positiveCount: 0,
      negativeCount: 0
    };
  }

  let totalPositive = 0;
  let totalNegative = 0;
  let urgencyDetected = false;
  
  // Arrays para detectar tendência (primeiras vs últimas mensagens)
  const firstHalf = customerMessages.slice(0, Math.ceil(customerMessages.length / 2));
  const secondHalf = customerMessages.slice(Math.ceil(customerMessages.length / 2));
  
  let firstHalfScore = 0;
  let secondHalfScore = 0;

  const analyzeText = (text: string) => {
    const lower = text.toLowerCase();
    let pos = 0;
    let neg = 0;
    
    POSITIVE_WORDS.forEach(word => {
      if (lower.includes(word)) pos++;
    });
    
    NEGATIVE_WORDS.forEach(word => {
      if (lower.includes(word)) neg++;
    });
    
    URGENCY_WORDS.forEach(word => {
      if (lower.includes(word)) urgencyDetected = true;
    });
    
    return { pos, neg };
  };

  // Analisar primeira metade
  firstHalf.forEach(m => {
    if (m.content) {
      const { pos, neg } = analyzeText(m.content);
      firstHalfScore += pos - neg;
      totalPositive += pos;
      totalNegative += neg;
    }
  });

  // Analisar segunda metade
  secondHalf.forEach(m => {
    if (m.content) {
      const { pos, neg } = analyzeText(m.content);
      secondHalfScore += pos - neg;
      totalPositive += pos;
      totalNegative += neg;
    }
  });

  // Calcular score normalizado (-1 a 1)
  const totalWords = totalPositive + totalNegative;
  const rawScore = totalWords > 0 
    ? (totalPositive - totalNegative) / totalWords 
    : 0;
  
  // Determinar label
  let label: 'positive' | 'neutral' | 'negative' | 'mixed' = 'neutral';
  if (rawScore > 0.3) label = 'positive';
  else if (rawScore < -0.3) label = 'negative';
  else if (totalPositive > 0 && totalNegative > 0) label = 'mixed';

  // Determinar tendência
  let trend: 'improving' | 'stable' | 'declining' = 'stable';
  const trendDiff = secondHalfScore - firstHalfScore;
  if (trendDiff > 1) trend = 'improving';
  else if (trendDiff < -1) trend = 'declining';

  // Confiança baseada na quantidade de palavras detectadas
  const confidence = Math.min(1, (totalPositive + totalNegative) / 5);

  return {
    score: rawScore,
    label,
    trend,
    urgency: urgencyDetected,
    confidence,
    positiveCount: totalPositive,
    negativeCount: totalNegative
  };
}

export function SentimentIndicator({ messages, compact = false, className }: SentimentIndicatorProps) {
  const [analysis, setAnalysis] = useState<SentimentAnalysis | null>(null);

  useEffect(() => {
    const result = analyzeSentiment(messages);
    setAnalysis(result);
  }, [messages]);

  if (!analysis || analysis.confidence < 0.1) {
    return null; // Não mostrar se não há dados suficientes
  }

  const getSentimentIcon = () => {
    switch (analysis.label) {
      case 'positive':
        return <Smile className="h-4 w-4" />;
      case 'negative':
        return <Frown className="h-4 w-4" />;
      case 'mixed':
        return <Meh className="h-4 w-4" />;
      default:
        return <Meh className="h-4 w-4" />;
    }
  };

  const getTrendIcon = () => {
    switch (analysis.trend) {
      case 'improving':
        return <TrendingUp className="h-3 w-3 text-green-500" />;
      case 'declining':
        return <TrendingDown className="h-3 w-3 text-red-500" />;
      default:
        return <Minus className="h-3 w-3 text-muted-foreground" />;
    }
  };

  const getSentimentColor = () => {
    switch (analysis.label) {
      case 'positive':
        return 'bg-green-500/10 text-green-600 border-green-500/30';
      case 'negative':
        return 'bg-red-500/10 text-red-600 border-red-500/30';
      case 'mixed':
        return 'bg-amber-500/10 text-amber-600 border-amber-500/30';
      default:
        return 'bg-muted text-muted-foreground border-border';
    }
  };

  const getSentimentLabel = () => {
    switch (analysis.label) {
      case 'positive':
        return 'Positivo';
      case 'negative':
        return 'Negativo';
      case 'mixed':
        return 'Misto';
      default:
        return 'Neutro';
    }
  };

  const getTrendLabel = () => {
    switch (analysis.trend) {
      case 'improving':
        return 'Melhorando';
      case 'declining':
        return 'Piorando';
      default:
        return 'Estável';
    }
  };

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn("flex items-center gap-1", className)}>
              <Badge 
                variant="outline" 
                className={cn(
                  "px-1.5 py-0.5 text-xs font-medium gap-1",
                  getSentimentColor()
                )}
              >
                {getSentimentIcon()}
                {analysis.urgency && (
                  <AlertTriangle className="h-3 w-3 text-orange-500" />
                )}
              </Badge>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[200px]">
            <div className="space-y-1.5 text-xs">
              <div className="font-medium flex items-center gap-1.5">
                <ThermometerSun className="h-3.5 w-3.5" />
                Sentimento: {getSentimentLabel()}
              </div>
              <div className="flex items-center gap-1.5">
                {getTrendIcon()}
                Tendência: {getTrendLabel()}
              </div>
              {analysis.urgency && (
                <div className="flex items-center gap-1.5 text-orange-600">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Urgência detectada
                </div>
              )}
              <div className="text-muted-foreground pt-1 border-t">
                +{analysis.positiveCount} positivos, -{analysis.negativeCount} negativos
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className={cn(
      "flex items-center gap-2 p-2 rounded-lg border",
      getSentimentColor(),
      className
    )}>
      <div className="flex items-center gap-1.5">
        {getSentimentIcon()}
        <span className="text-sm font-medium">{getSentimentLabel()}</span>
      </div>
      
      <div className="flex items-center gap-1 text-xs">
        {getTrendIcon()}
        <span>{getTrendLabel()}</span>
      </div>

      {analysis.urgency && (
        <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/30 text-xs">
          <AlertTriangle className="h-3 w-3 mr-1" />
          Urgente
        </Badge>
      )}
    </div>
  );
}

// Badge simplificado para uso em listas
export function SentimentBadge({ messages, className }: { messages: ChatMessage[], className?: string }) {
  const [analysis, setAnalysis] = useState<SentimentAnalysis | null>(null);

  useEffect(() => {
    const result = analyzeSentiment(messages);
    setAnalysis(result);
  }, [messages]);

  if (!analysis || analysis.confidence < 0.2) {
    return null;
  }

  const getColor = () => {
    if (analysis.urgency) return 'bg-orange-500';
    switch (analysis.label) {
      case 'positive': return 'bg-green-500';
      case 'negative': return 'bg-red-500';
      case 'mixed': return 'bg-amber-500';
      default: return 'bg-muted-foreground';
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn("flex items-center gap-1", className)}>
            <div className={cn("w-2 h-2 rounded-full", getColor())} />
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" className="text-xs">
          Sentimento: {analysis.label === 'positive' ? 'Positivo' : 
                       analysis.label === 'negative' ? 'Negativo' : 
                       analysis.label === 'mixed' ? 'Misto' : 'Neutro'}
          {analysis.urgency && ' (Urgente)'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Hook para análise de sentimento
export function useSentimentAnalysis(messages: ChatMessage[]) {
  const [analysis, setAnalysis] = useState<SentimentAnalysis | null>(null);

  useEffect(() => {
    const result = analyzeSentiment(messages);
    setAnalysis(result);
  }, [messages]);

  return analysis;
}
