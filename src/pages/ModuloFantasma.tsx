import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  Ghost, AlertTriangle, TrendingDown, Clock, MessageSquareOff, Frown,
  Sparkles, Loader2, Eye, Users, Target, History, Trash2, ChevronDown,
  Shield, Search, Zap, UserX, ScanEye, FileDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useGhostAnalysis, GhostInsight, SavedAnalysis } from "@/hooks/use-ghost-analysis";
import { AnalysisProgressBar } from "@/components/ghost/AnalysisProgressBar";
import { ExtraMetricsPanel } from "@/components/ghost/ExtraMetricsPanel";
import { api } from "@/lib/api";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { exportGhostPDF } from "@/lib/ghost-pdf-export";

// --- Configs ---
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

// --- Components ---
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

function AnalysisHistoryPanel({
  analyses, onLoad, onDelete
}: {
  analyses: SavedAnalysis[];
  onLoad: (a: SavedAnalysis) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);

  if (analyses.length === 0) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" className="gap-2 w-full justify-between">
          <span className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Análises anteriores ({analyses.length})
          </span>
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3 space-y-2">
        {analyses.map(a => (
          <div
            key={a.id}
            className="flex items-center justify-between rounded-lg border bg-card p-3 hover:bg-accent/50 transition-colors"
          >
            <button onClick={() => onLoad(a)} className="flex-1 text-left">
              <p className="text-sm font-medium">{a.label}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(a.timestamp).toLocaleString("pt-BR")} •{" "}
                {a.data.insights.length} insights • {a.data.summary.total_analyzed} conversas
              </p>
            </button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => onDelete(a.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

// --- Main Page ---
export default function ModuloFantasma() {
  const { data, isLoading, step, savedAnalyses, runAnalysis, loadAnalysis, deleteAnalysis } = useGhostAnalysis();
  const [days, setDays] = useState("7");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [connectionId, setConnectionId] = useState<string>("all");
  const [analysisType, setAnalysisType] = useState<string>("full");
  const [connections, setConnections] = useState<Array<{ id: string; name: string }>>([]);
  const [orgInfo, setOrgInfo] = useState<{ name?: string; logo_url?: string | null }>({});

  const analysisTypes = [
    { value: "full", label: "Análise Completa", icon: ScanEye, desc: "Todos os problemas e oportunidades" },
    { value: "quality", label: "Qualidade de Atendimento", icon: Shield, desc: "Foco em atendimento e profissionalismo" },
    { value: "opportunities", label: "Oportunidades de Venda", icon: Zap, desc: "Vendas perdidas e upsell" },
    { value: "risks", label: "Riscos e Churn", icon: AlertTriangle, desc: "Clientes em risco de desistir" },
    { value: "conduct", label: "Conduta Profissional", icon: UserX, desc: "Desvios de conduta e foco" },
  ];

  useEffect(() => {
    api<Array<{ id: string; name: string }>>("/api/connections").then(setConnections).catch(() => {});
    api<Array<{ id: string; name: string; logo_url?: string | null }>>("/api/organizations").then(orgs => {
      if (orgs?.[0]) setOrgInfo({ name: orgs[0].name, logo_url: orgs[0].logo_url });
    }).catch(() => {});
  }, []);

  const handleAnalyze = () => {
    const conn = connections.find(c => c.id === connectionId);
    const at = analysisTypes.find(a => a.value === analysisType);
    runAnalysis({
      days: parseInt(days),
      connectionId: connectionId !== "all" ? connectionId : undefined,
      connectionName: conn?.name,
      analysisType,
      analysisLabel: at?.label,
    });
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
              <p className="text-sm text-muted-foreground">Análise inteligente de conversas por IA</p>
            </div>
          </div>
          {data && (
            <Button variant="outline" onClick={() => exportGhostPDF(data, { logoUrl: orgInfo.logo_url, orgName: orgInfo.name, days: parseInt(days) })} className="gap-2">
              <FileDown className="h-4 w-4" />
              Exportar PDF
            </Button>
          )}
        </div>

        {/* Analysis Type Selector */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {analysisTypes.map(at => {
            const Icon = at.icon;
            const isSelected = analysisType === at.value;
            return (
              <button
                key={at.value}
                onClick={() => setAnalysisType(at.value)}
                className={cn(
                  "rounded-xl border-2 p-4 text-left transition-all hover:shadow-md",
                  isSelected
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-transparent bg-card hover:border-muted-foreground/20"
                )}
              >
                <Icon className={cn("h-5 w-5 mb-2", isSelected ? "text-primary" : "text-muted-foreground")} />
                <p className={cn("text-sm font-semibold", isSelected ? "text-foreground" : "text-muted-foreground")}>{at.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{at.desc}</p>
              </button>
            );
          })}
        </div>

        {/* Controls */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <Select value={connectionId} onValueChange={setConnectionId}>
                <SelectTrigger className="sm:w-[200px]">
                  <SelectValue placeholder="Instância WhatsApp" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as instâncias</SelectItem>
                  {connections.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={days} onValueChange={setDays}>
                <SelectTrigger className="sm:w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Últimas 24h</SelectItem>
                  <SelectItem value="3">Últimos 3 dias</SelectItem>
                  <SelectItem value="7">Últimos 7 dias</SelectItem>
                  <SelectItem value="15">Últimos 15 dias</SelectItem>
                  <SelectItem value="30">Últimos 30 dias</SelectItem>
                  <SelectItem value="45">Últimos 45 dias</SelectItem>
                  <SelectItem value="60">Últimos 2 meses</SelectItem>
                </SelectContent>
              </Select>

              <Button onClick={handleAnalyze} disabled={isLoading} className="sm:ml-auto">
                {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Eye className="h-4 w-4 mr-2" />}
                Analisar
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Progress Bar */}
        <AnalysisProgressBar currentStep={step} />

        {/* History */}
        <AnalysisHistoryPanel analyses={savedAnalyses} onLoad={loadAnalysis} onDelete={deleteAnalysis} />

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

        {/* Extra Metrics */}
        {summary && <ExtraMetricsPanel summary={summary} />}

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

        {/* Empty State - compact, controls are already visible above */}
        {!data && !isLoading && step === 'idle' && (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <Ghost className="h-16 w-16 mx-auto mb-4 text-muted-foreground/20" />
              <h2 className="text-lg font-semibold text-foreground mb-1">Pronto para analisar</h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Selecione o tipo de análise, a instância e o período acima, depois clique em <strong>Analisar</strong>.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  );
}
