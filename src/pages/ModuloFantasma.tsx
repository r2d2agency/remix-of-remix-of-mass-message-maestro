import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  Ghost,
  AlertTriangle,
  TrendingDown,
  Clock,
  MessageSquareOff,
  Frown,
  Sparkles,
  Loader2,
  Eye,
  Users,
  ShieldAlert,
  Target,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useGhostAnalysis, GhostInsight } from "@/hooks/use-ghost-analysis";

const categoryConfig: Record<string, { label: string; icon: any; color: string }> = {
  off_topic: { label: "Fora do Foco", icon: MessageSquareOff, color: "text-orange-500" },
  deal_risk: { label: "Risco de Perda", icon: TrendingDown, color: "text-destructive" },
  slow_response: { label: "Resposta Lenta", icon: Clock, color: "text-yellow-500" },
  no_followup: { label: "Sem Follow-up", icon: AlertTriangle, color: "text-orange-400" },
  sentiment_negative: { label: "Sentimento Negativo", icon: Frown, color: "text-destructive" },
  opportunity: { label: "Oportunidade", icon: Sparkles, color: "text-primary" },
};

const severityConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  low: { label: "Baixo", variant: "secondary" },
  medium: { label: "Médio", variant: "outline" },
  high: { label: "Alto", variant: "default" },
  critical: { label: "Crítico", variant: "destructive" },
};

function InsightCard({ insight }: { insight: GhostInsight }) {
  const cat = categoryConfig[insight.category] || categoryConfig.off_topic;
  const sev = severityConfig[insight.severity] || severityConfig.low;
  const Icon = cat.icon;

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Icon className={cn("h-5 w-5 shrink-0", cat.color)} />
            <div>
              <p className="font-semibold text-sm">{insight.title}</p>
              <p className="text-xs text-muted-foreground">
                {insight.contact_name || insight.contact_phone}
                {insight.assigned_to_name && ` • Atendente: ${insight.assigned_to_name}`}
              </p>
            </div>
          </div>
          <Badge variant={sev.variant} className="shrink-0 text-xs">{sev.label}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{insight.description}</p>
        {insight.snippet && (
          <div className="bg-muted rounded-lg p-3 text-xs italic text-muted-foreground border-l-2 border-primary/30">
            "{insight.snippet}"
          </div>
        )}
        <div className="flex items-center gap-2 text-xs text-primary">
          <Target className="h-3 w-3" />
          <span>{insight.recommendation}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ModuloFantasma() {
  const { data, isLoading, runAnalysis } = useGhostAnalysis();
  const [days, setDays] = useState("7");
  const [filterCategory, setFilterCategory] = useState<string>("all");

  const handleAnalyze = () => {
    runAnalysis({ days: parseInt(days) });
  };

  const filteredInsights = data?.insights.filter(
    (i) => filterCategory === "all" || i.category === filterCategory
  ) || [];

  const summary = data?.summary;

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Ghost className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Módulo Fantasma</h1>
              <p className="text-sm text-muted-foreground">
                Análise inteligente de conversas por IA
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Últimas 24h</SelectItem>
                <SelectItem value="3">Últimos 3 dias</SelectItem>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="15">Últimos 15 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleAnalyze} disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Eye className="h-4 w-4 mr-2" />
              )}
              Analisar
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-foreground">{summary.total_analyzed}</p>
                <p className="text-xs text-muted-foreground">Analisadas</p>
              </CardContent>
            </Card>
            <Card className="border-orange-500/30">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-orange-500">{summary.off_topic}</p>
                <p className="text-xs text-muted-foreground">Fora do Foco</p>
              </CardContent>
            </Card>
            <Card className="border-destructive/30">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-destructive">{summary.deal_risk}</p>
                <p className="text-xs text-muted-foreground">Risco de Perda</p>
              </CardContent>
            </Card>
            <Card className="border-yellow-500/30">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-yellow-500">{summary.slow_response}</p>
                <p className="text-xs text-muted-foreground">Resposta Lenta</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-orange-400">{summary.no_followup}</p>
                <p className="text-xs text-muted-foreground">Sem Follow-up</p>
              </CardContent>
            </Card>
            <Card className="border-primary/30">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-primary">{summary.opportunities}</p>
                <p className="text-xs text-muted-foreground">Oportunidades</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Team Scores */}
        {summary?.team_scores && summary.team_scores.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Performance da Equipe
              </CardTitle>
              <CardDescription>Score baseado na qualidade das conversas</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {summary.team_scores.map((member) => (
                <div key={member.user_name} className="flex items-center gap-4">
                  <span className="text-sm font-medium w-32 truncate">{member.user_name}</span>
                  <Progress value={member.score} className="flex-1" />
                  <span className={cn(
                    "text-sm font-bold w-10 text-right",
                    member.score >= 80 ? "text-green-500" :
                    member.score >= 50 ? "text-yellow-500" : "text-destructive"
                  )}>
                    {member.score}
                  </span>
                  <span className="text-xs text-muted-foreground w-20 text-right">
                    {member.conversations} conv • {member.issues} alertas
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Insights List */}
        {data && (
          <>
            <div className="flex items-center gap-2">
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Filtrar categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as categorias</SelectItem>
                  {Object.entries(categoryConfig).map(([key, cfg]) => (
                    <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-sm text-muted-foreground">
                {filteredInsights.length} insight(s)
              </span>
            </div>

            <ScrollArea className="h-[600px]">
              <div className="grid gap-3 md:grid-cols-2">
                {filteredInsights.map((insight) => (
                  <InsightCard key={insight.id} insight={insight} />
                ))}
              </div>
              {filteredInsights.length === 0 && (
                <div className="text-center py-16 text-muted-foreground">
                  <Ghost className="h-16 w-16 mx-auto mb-4 opacity-20" />
                  <p className="text-lg font-medium">Nenhum insight encontrado</p>
                  <p className="text-sm">Tudo parece em ordem! 🎉</p>
                </div>
              )}
            </ScrollArea>
          </>
        )}

        {/* Empty State */}
        {!data && !isLoading && (
          <div className="text-center py-20">
            <Ghost className="h-24 w-24 mx-auto mb-6 text-muted-foreground/20" />
            <h2 className="text-xl font-semibold text-foreground mb-2">Análise Fantasma</h2>
            <p className="text-muted-foreground max-w-md mx-auto mb-6">
              O agente de IA vai varrer todas as conversas do período selecionado para identificar
              riscos, conversas fora do foco, oportunidades perdidas e a performance da sua equipe.
            </p>
            <Button onClick={handleAnalyze} size="lg">
              <Eye className="h-5 w-5 mr-2" />
              Iniciar Análise
            </Button>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
