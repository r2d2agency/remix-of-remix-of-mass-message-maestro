import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  useCRMSalesReport,
  useCRMConversionReport,
} from "@/hooks/use-crm-reports";
import { useCRMFunnels } from "@/hooks/use-crm";
import {
  CalendarIcon,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Target,
  Users,
  Loader2,
  BarChart3,
  PieChartIcon,
  Activity,
} from "lucide-react";
import { format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";

const PRESETS = [
  { label: "7 dias", days: 7 },
  { label: "15 dias", days: 15 },
  { label: "30 dias", days: 30 },
  { label: "90 dias", days: 90 },
];

const STATUS_COLORS = {
  open: "hsl(var(--primary))",
  won: "#22c55e",
  lost: "#ef4444",
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export default function CRMRelatorios() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 29),
    to: new Date(),
  });
  const [selectedFunnel, setSelectedFunnel] = useState<string>("all");
  const [groupBy, setGroupBy] = useState<"day" | "week" | "month">("day");
  const [activeTab, setActiveTab] = useState("overview");

  const { data: funnels } = useCRMFunnels();

  const { data: salesData, isLoading } = useCRMSalesReport({
    startDate: dateRange?.from?.toISOString().split("T")[0],
    endDate: dateRange?.to?.toISOString().split("T")[0],
    funnelId: selectedFunnel !== "all" ? selectedFunnel : undefined,
    groupBy,
  });

  const { data: conversionData } = useCRMConversionReport({
    funnelId: selectedFunnel !== "all" ? selectedFunnel : funnels?.[0]?.id || "",
    startDate: dateRange?.from?.toISOString().split("T")[0],
    endDate: dateRange?.to?.toISOString().split("T")[0],
  });

  const handlePreset = (days: number) => {
    setDateRange({
      from: subDays(new Date(), days - 1),
      to: new Date(),
    });
  };

  const summary = salesData?.summary || {
    open: { count: 0, value: 0 },
    won: { count: 0, value: 0 },
    lost: { count: 0, value: 0 },
    winRate: 0,
    totalValue: 0,
  };

  // Pie chart data
  const pieData = [
    { name: "Em aberto", value: summary.open.count, color: STATUS_COLORS.open },
    { name: "Ganhas", value: summary.won.count, color: STATUS_COLORS.won },
    { name: "Perdidas", value: summary.lost.count, color: STATUS_COLORS.lost },
  ].filter((d) => d.value > 0);

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BarChart3 className="h-6 w-6" />
              Relatórios de Vendas
            </h1>
            <p className="text-muted-foreground">
              Acompanhe o desempenho das suas negociações
            </p>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Date Range */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRange?.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, "dd/MM", { locale: ptBR })} -{" "}
                        {format(dateRange.to, "dd/MM/yy", { locale: ptBR })}
                      </>
                    ) : (
                      format(dateRange.from, "dd/MM/yyyy", { locale: ptBR })
                    )
                  ) : (
                    "Período"
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <div className="p-3 border-b flex gap-2 flex-wrap">
                  {PRESETS.map((preset) => (
                    <Button
                      key={preset.days}
                      variant="outline"
                      size="sm"
                      onClick={() => handlePreset(preset.days)}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={dateRange?.from}
                  selected={dateRange}
                  onSelect={setDateRange}
                  numberOfMonths={2}
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>

            {/* Funnel Filter */}
            <Select value={selectedFunnel} onValueChange={setSelectedFunnel}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Todos os funis" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os funis</SelectItem>
                {funnels?.map((funnel) => (
                  <SelectItem key={funnel.id} value={funnel.id}>
                    {funnel.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Group By */}
            <Select value={groupBy} onValueChange={(v) => setGroupBy(v as typeof groupBy)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Por dia</SelectItem>
                <SelectItem value="week">Por semana</SelectItem>
                <SelectItem value="month">Por mês</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total em Aberto</p>
                      <p className="text-2xl font-bold">{summary.open.count}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatCurrency(summary.open.value)}
                      </p>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <Activity className="h-6 w-6 text-primary" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Negociações Ganhas</p>
                      <p className="text-2xl font-bold text-green-600">{summary.won.count}</p>
                      <p className="text-sm text-green-600">
                        {formatCurrency(summary.won.value)}
                      </p>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
                      <TrendingUp className="h-6 w-6 text-green-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Negociações Perdidas</p>
                      <p className="text-2xl font-bold text-red-600">{summary.lost.count}</p>
                      <p className="text-sm text-red-600">
                        {formatCurrency(summary.lost.value)}
                      </p>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
                      <TrendingDown className="h-6 w-6 text-red-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Taxa de Conversão</p>
                      <p className="text-2xl font-bold">{summary.winRate}%</p>
                      <p className="text-sm text-muted-foreground">
                        de fechamento
                      </p>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center">
                      <Target className="h-6 w-6 text-amber-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="overview" className="gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Visão Geral
                </TabsTrigger>
                <TabsTrigger value="funnels" className="gap-2">
                  <PieChartIcon className="h-4 w-4" />
                  Por Funil
                </TabsTrigger>
                <TabsTrigger value="team" className="gap-2">
                  <Users className="h-4 w-4" />
                  Equipe
                </TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview" className="mt-6 space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Timeline Chart */}
                  <Card className="lg:col-span-2">
                    <CardHeader>
                      <CardTitle>Evolução das Negociações</CardTitle>
                      <CardDescription>
                        Quantidade de negociações por período
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {salesData?.timeline && salesData.timeline.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart data={salesData.timeline}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis
                              dataKey="period"
                              tick={{ fontSize: 12 }}
                              tickFormatter={(v) => {
                                if (groupBy === "day") {
                                  const parts = v.split("-");
                                  return `${parts[2]}/${parts[1]}`;
                                }
                                return v;
                              }}
                            />
                            <YAxis tick={{ fontSize: 12 }} />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: "hsl(var(--card))",
                                border: "1px solid hsl(var(--border))",
                                borderRadius: "8px",
                              }}
                            />
                            <Legend />
                            <Bar
                              dataKey="won"
                              name="Ganhas"
                              fill={STATUS_COLORS.won}
                              radius={[4, 4, 0, 0]}
                            />
                            <Bar
                              dataKey="lost"
                              name="Perdidas"
                              fill={STATUS_COLORS.lost}
                              radius={[4, 4, 0, 0]}
                            />
                            <Bar
                              dataKey="open"
                              name="Em aberto"
                              fill={STATUS_COLORS.open}
                              radius={[4, 4, 0, 0]}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                          Nenhum dado no período selecionado
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Pie Chart */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Distribuição</CardTitle>
                      <CardDescription>Por status</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {pieData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={250}>
                          <PieChart>
                            <Pie
                              data={pieData}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={5}
                              dataKey="value"
                              label={({ name, percent }) =>
                                `${name} ${(percent * 100).toFixed(0)}%`
                              }
                              labelLine={false}
                            >
                              {pieData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip
                              contentStyle={{
                                backgroundColor: "hsl(var(--card))",
                                border: "1px solid hsl(var(--border))",
                                borderRadius: "8px",
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                          Nenhum dado
                        </div>
                      )}
                      <div className="space-y-2 mt-4">
                        {pieData.map((item) => (
                          <div key={item.name} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: item.color }}
                              />
                              <span className="text-sm">{item.name}</span>
                            </div>
                            <span className="font-medium">{item.value}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Value Chart */}
                <Card>
                  <CardHeader>
                    <CardTitle>Valor das Negociações</CardTitle>
                    <CardDescription>Evolução do valor por período</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {salesData?.timeline && salesData.timeline.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={salesData.timeline}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis
                            dataKey="period"
                            tick={{ fontSize: 12 }}
                            tickFormatter={(v) => {
                              if (groupBy === "day") {
                                const parts = v.split("-");
                                return `${parts[2]}/${parts[1]}`;
                              }
                              return v;
                            }}
                          />
                          <YAxis
                            tick={{ fontSize: 12 }}
                            tickFormatter={(v) => formatCurrency(v)}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "hsl(var(--card))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "8px",
                            }}
                            formatter={(value: number) => formatCurrency(value)}
                          />
                          <Legend />
                          <Line
                            type="monotone"
                            dataKey="wonValue"
                            name="Valor Ganho"
                            stroke={STATUS_COLORS.won}
                            strokeWidth={2}
                            dot={{ r: 4 }}
                          />
                          <Line
                            type="monotone"
                            dataKey="lostValue"
                            name="Valor Perdido"
                            stroke={STATUS_COLORS.lost}
                            strokeWidth={2}
                            dot={{ r: 4 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                        Nenhum dado no período selecionado
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Funnels Tab */}
              <TabsContent value="funnels" className="mt-6 space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* By Funnel */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Desempenho por Funil</CardTitle>
                      <CardDescription>Comparativo entre funis</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {salesData?.byFunnel && salesData.byFunnel.length > 0 ? (
                        <div className="space-y-4">
                          {salesData.byFunnel.map((funnel) => {
                            const total = funnel.open + funnel.won + funnel.lost;
                            const wonPercent = total > 0 ? (funnel.won / total) * 100 : 0;
                            return (
                              <div key={funnel.funnelId} className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <div
                                      className="w-3 h-3 rounded-full"
                                      style={{ backgroundColor: funnel.funnelColor }}
                                    />
                                    <span className="font-medium">{funnel.funnelName}</span>
                                  </div>
                                  <div className="text-right">
                                    <span className="text-green-600 font-medium">
                                      {formatCurrency(funnel.wonValue)}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Progress value={wonPercent} className="h-2 flex-1" />
                                  <span className="text-sm text-muted-foreground w-12 text-right">
                                    {wonPercent.toFixed(0)}%
                                  </span>
                                </div>
                                <div className="flex gap-4 text-sm text-muted-foreground">
                                  <span>
                                    <span className="text-green-600">{funnel.won}</span> ganhas
                                  </span>
                                  <span>
                                    <span className="text-red-600">{funnel.lost}</span> perdidas
                                  </span>
                                  <span>{funnel.open} em aberto</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                          Nenhum dado disponível
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Conversion Funnel */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Funil de Conversão</CardTitle>
                      <CardDescription>
                        {selectedFunnel !== "all"
                          ? funnels?.find((f) => f.id === selectedFunnel)?.name
                          : "Selecione um funil para ver o detalhamento"}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {conversionData && conversionData.length > 0 ? (
                        <div className="space-y-3">
                          {conversionData.map((stage, index) => {
                            const maxCount = Math.max(...conversionData.map((s) => s.dealCount));
                            const width = maxCount > 0 ? (stage.dealCount / maxCount) * 100 : 0;
                            return (
                              <div key={stage.stageId} className="space-y-1">
                                <div className="flex items-center justify-between text-sm">
                                  <span>{stage.stageName}</span>
                                  <span className="font-medium">{stage.dealCount}</span>
                                </div>
                                <div
                                  className="h-8 rounded-md flex items-center px-3 transition-all"
                                  style={{
                                    width: `${Math.max(width, 20)}%`,
                                    backgroundColor: stage.stageColor + "30",
                                    borderLeft: `4px solid ${stage.stageColor}`,
                                  }}
                                >
                                  <span className="text-xs text-muted-foreground">
                                    {formatCurrency(stage.totalValue)}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                          {selectedFunnel === "all"
                            ? "Selecione um funil específico"
                            : "Nenhum dado disponível"}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Team Tab */}
              <TabsContent value="team" className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Top Vendedores</CardTitle>
                    <CardDescription>Ranking por valor de negociações ganhas</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {salesData?.byOwner && salesData.byOwner.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[50px]">#</TableHead>
                            <TableHead>Vendedor</TableHead>
                            <TableHead className="text-center">Ganhas</TableHead>
                            <TableHead className="text-center">Total</TableHead>
                            <TableHead className="text-center">Taxa</TableHead>
                            <TableHead className="text-right">Valor Ganho</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {salesData.byOwner.map((owner, index) => {
                            const winRate =
                              owner.totalDeals > 0
                                ? (owner.wonCount / owner.totalDeals) * 100
                                : 0;
                            return (
                              <TableRow key={owner.userId}>
                                <TableCell>
                                  <Badge
                                    variant={index < 3 ? "default" : "secondary"}
                                    className={cn(
                                      index === 0 && "bg-yellow-500",
                                      index === 1 && "bg-gray-400",
                                      index === 2 && "bg-amber-600"
                                    )}
                                  >
                                    {index + 1}
                                  </Badge>
                                </TableCell>
                                <TableCell className="font-medium">{owner.userName}</TableCell>
                                <TableCell className="text-center text-green-600">
                                  {owner.wonCount}
                                </TableCell>
                                <TableCell className="text-center">{owner.totalDeals}</TableCell>
                                <TableCell className="text-center">
                                  <Badge variant="outline">{winRate.toFixed(0)}%</Badge>
                                </TableCell>
                                <TableCell className="text-right font-medium text-green-600">
                                  {formatCurrency(owner.wonValue)}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    ) : (
                      <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                        Nenhum vendedor com negociações no período
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </MainLayout>
  );
}
