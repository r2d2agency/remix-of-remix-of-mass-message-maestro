import { useState, useCallback } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell,
} from "recharts";
import {
  useSalesReportSummary, useSalesDimensions, useSalesGoalsVsRealized,
  useImportSalesRecords, useSaveGoal, useDeleteGoal,
  type SalesRecord,
} from "@/hooks/use-sales-report";
import {
  Upload, Target, TrendingUp, FileSpreadsheet, CalendarIcon, Trash2, Plus, Loader2,
  DollarSign, ShoppingCart, Receipt,
} from "lucide-react";
import { format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";

const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const TYPE_LABELS: Record<string, string> = { orcamento: "Orçamentos", pedido: "Pedidos", faturamento: "Faturamento" };
const TYPE_ICONS: Record<string, any> = { orcamento: FileSpreadsheet, pedido: ShoppingCart, faturamento: DollarSign };

function formatCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
}

function parseXLSXValue(raw: string | number | undefined): number {
  if (!raw) return 0;
  const s = String(raw).replace(/R\$\s?/g, '').replace(/\./g, '').replace(',', '.').trim();
  return parseFloat(s) || 0;
}

function parseXLSXDate(raw: any): string {
  if (!raw) return new Date().toISOString().slice(0, 10);
  if (typeof raw === 'number') {
    const d = new Date((raw - 25569) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(raw);
  // Try M/D/YY or M/D/YYYY
  const parts = s.split('/');
  if (parts.length === 3) {
    let [m, d, y] = parts.map(Number);
    if (y < 100) y += 2000;
    return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }
  return new Date().toISOString().slice(0, 10);
}

export default function RelatorioComercial() {
  const now = new Date();
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date(now.getFullYear(), now.getMonth(), 1),
    to: now,
  });
  const [goalYear, setGoalYear] = useState(now.getFullYear());
  const [goalMonth, setGoalMonth] = useState(now.getMonth() + 1);
  const [showGoalDialog, setShowGoalDialog] = useState(false);
  const [newGoal, setNewGoal] = useState({ goal_type: 'orcamento' as string, target_type: 'individual' as string, target_name: '', goal_value: 0, goal_count: 0 });

  const startDate = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : undefined;
  const endDate = dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : undefined;

  const { data: summary, isLoading: loadingSummary } = useSalesReportSummary({ startDate, endDate });
  const { data: dims } = useSalesDimensions();
  const { data: goalsData, isLoading: loadingGoals } = useSalesGoalsVsRealized({ year: goalYear, month: goalMonth });
  const importMut = useImportSalesRecords();
  const saveGoalMut = useSaveGoal();
  const deleteGoalMut = useDeleteGoal();

  const handleFileUpload = useCallback(async (file: File, recordType: string) => {
    try {
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);

      const records: SalesRecord[] = rows.map(r => {
        const isOrcamento = recordType === 'orcamento';
        const dateField = isOrcamento ? (r['Dt. Emissão'] || r['Dt. Emissao']) : (r['Pedido'] || r['Data Entrega']);
        const valueField = isOrcamento ? r['Valor'] : r['Valor Pedido'];
        const sellerField = r['Vendedor'] || r['vendedor'];
        const channelField = r['Etapa/Canal'] || r['Canal'];
        const numberField = isOrcamento ? r['Numero'] : r['Número'];

        return {
          record_number: String(numberField || ''),
          status: r['Situação'] || r['Situacao'] || '',
          client_name: r['Nome do Cliente'] || r['Nome Cliente'] || '',
          value: parseXLSXValue(valueField),
          seller_name: sellerField || '',
          channel: channelField || '',
          client_group: r['Grupo Cliente'] || '',
          municipality: r['Municipio'] || r['Município'] || '',
          uf: r['UF'] || '',
          margin_percent: parseFloat(String(r['% Margem'] || '0').replace('%', '').replace(',', '.')) || undefined,
          record_date: parseXLSXDate(dateField),
          invoice_date: r['Data Faturamento'] ? parseXLSXDate(r['Data Faturamento']) : undefined,
        };
      });

      await importMut.mutateAsync({ record_type: recordType, records });
      toast({ title: `${records.length} registros de ${TYPE_LABELS[recordType]} importados com sucesso` });
    } catch (err: any) {
      toast({ title: "Erro na importação", description: err.message, variant: "destructive" });
    }
  }, [importMut]);

  const getTotalForType = (type: string) => {
    const row = summary?.totals?.find(t => t.record_type === type);
    return { count: Number(row?.count || 0), value: Number(row?.total_value || 0) };
  };

  const getGoalRealized = (goalType: string, targetType: string, targetName: string) => {
    const source = targetType === 'channel' ? goalsData?.realizedByChannel : goalsData?.realizedBySeller;
    const match = source?.find(r => r.record_type === goalType && r.name === targetName);
    return { count: Number(match?.count || 0), value: Number(match?.total_value || 0) };
  };

  return (
    <MainLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Relatório Comercial</h1>
            <p className="text-sm text-muted-foreground">Orçamentos, Pedidos e Faturamento com Metas</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <CalendarIcon className="h-4 w-4" />
                  {dateRange?.from ? (
                    dateRange.to ? `${format(dateRange.from, "dd/MM", { locale: ptBR })} - ${format(dateRange.to, "dd/MM", { locale: ptBR })}` : format(dateRange.from, "dd/MM/yyyy", { locale: ptBR })
                  ) : "Período"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar mode="range" selected={dateRange} onSelect={setDateRange} numberOfMonths={2} locale={ptBR} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Import Section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Upload className="h-4 w-4" /> Importar Planilhas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(['orcamento', 'pedido', 'faturamento'] as const).map(type => {
                const Icon = TYPE_ICONS[type];
                return (
                  <div key={type} className="border border-border rounded-lg p-4 text-center space-y-2">
                    <Icon className="h-8 w-8 mx-auto text-muted-foreground" />
                    <p className="font-medium text-sm">{TYPE_LABELS[type]}</p>
                    <label className="cursor-pointer">
                      <input type="file" accept=".xlsx,.xls" className="hidden" onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) handleFileUpload(f, type);
                        e.target.value = '';
                      }} />
                      <Button variant="outline" size="sm" className="gap-1" asChild disabled={importMut.isPending}>
                        <span>{importMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />} Importar XLSX</span>
                      </Button>
                    </label>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(['orcamento', 'pedido', 'faturamento'] as const).map(type => {
            const t = getTotalForType(type);
            const Icon = TYPE_ICONS[type];
            const colors = { orcamento: 'text-blue-500', pedido: 'text-orange-500', faturamento: 'text-green-500' };
            return (
              <Card key={type}>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground font-medium uppercase">{TYPE_LABELS[type]}</p>
                      <p className="text-2xl font-bold">{t.count}</p>
                      <p className={cn("text-sm font-semibold", colors[type])}>{formatCurrency(t.value)}</p>
                    </div>
                    <Icon className={cn("h-10 w-10", colors[type])} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Tabs: By Channel / By Seller */}
        <Tabs defaultValue="channel" className="space-y-4">
          <TabsList>
            <TabsTrigger value="channel">Por Canal/Grupo</TabsTrigger>
            <TabsTrigger value="seller">Por Vendedor</TabsTrigger>
            <TabsTrigger value="goals">Metas vs Realizado</TabsTrigger>
          </TabsList>

          <TabsContent value="channel" className="space-y-4">
            {(['orcamento', 'pedido', 'faturamento'] as const).map(type => {
              const rows = summary?.byChannel?.filter(r => r.record_type === type) || [];
              if (!rows.length) return null;
              return (
                <Card key={type}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{TYPE_LABELS[type]} por Canal</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-4 h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={rows.map(r => ({ name: r.channel || 'Sem Canal', qtd: Number(r.count), valor: Number(r.total_value) }))}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" fontSize={11} />
                          <YAxis fontSize={11} />
                          <Tooltip formatter={(v: number) => formatCurrency(v)} />
                          <Bar dataKey="valor" fill="hsl(var(--primary))" radius={[4,4,0,0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Canal</TableHead>
                          <TableHead className="text-right">Qtd</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((r, i) => (
                          <TableRow key={i}>
                            <TableCell>{r.channel || 'Sem Canal'}</TableCell>
                            <TableCell className="text-right">{r.count}</TableCell>
                            <TableCell className="text-right font-medium">{formatCurrency(Number(r.total_value))}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          <TabsContent value="seller" className="space-y-4">
            {(['orcamento', 'pedido', 'faturamento'] as const).map(type => {
              const rows = summary?.bySeller?.filter(r => r.record_type === type) || [];
              if (!rows.length) return null;
              return (
                <Card key={type}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{TYPE_LABELS[type]} por Vendedor</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-4 h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={rows.map(r => ({ name: r.seller_name || 'Sem', qtd: Number(r.count), valor: Number(r.total_value) }))}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" fontSize={10} angle={-20} textAnchor="end" height={60} />
                          <YAxis fontSize={11} />
                          <Tooltip formatter={(v: number) => formatCurrency(v)} />
                          <Bar dataKey="valor" fill="hsl(var(--primary))" radius={[4,4,0,0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Vendedor</TableHead>
                          <TableHead className="text-right">Qtd</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((r, i) => (
                          <TableRow key={i}>
                            <TableCell>{r.seller_name || 'Sem Vendedor'}</TableCell>
                            <TableCell className="text-right">{r.count}</TableCell>
                            <TableCell className="text-right font-medium">{formatCurrency(Number(r.total_value))}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          <TabsContent value="goals" className="space-y-4">
            {/* Period selector + add goal */}
            <div className="flex flex-wrap items-center gap-3">
              <Select value={String(goalMonth)} onValueChange={v => setGoalMonth(Number(v))}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={String(goalYear)} onValueChange={v => setGoalYear(Number(v))}>
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Dialog open={showGoalDialog} onOpenChange={setShowGoalDialog}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-1"><Plus className="h-3 w-3" /> Nova Meta</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Criar/Atualizar Meta</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Tipo</Label>
                        <Select value={newGoal.goal_type} onValueChange={v => setNewGoal(g => ({ ...g, goal_type: v }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="orcamento">Orçamentos</SelectItem>
                            <SelectItem value="pedido">Pedidos</SelectItem>
                            <SelectItem value="faturamento">Faturamento</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Alvo</Label>
                        <Select value={newGoal.target_type} onValueChange={v => setNewGoal(g => ({ ...g, target_type: v, target_name: '' }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="channel">Canal/Grupo</SelectItem>
                            <SelectItem value="individual">Individual</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <Label>{newGoal.target_type === 'channel' ? 'Canal' : 'Vendedor'}</Label>
                      <Select value={newGoal.target_name} onValueChange={v => setNewGoal(g => ({ ...g, target_name: v }))}>
                        <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          {(newGoal.target_type === 'channel' ? dims?.channels : dims?.sellers)?.map(n => (
                            <SelectItem key={n} value={n}>{n}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Meta Valor (R$)</Label>
                        <Input type="number" value={newGoal.goal_value} onChange={e => setNewGoal(g => ({ ...g, goal_value: Number(e.target.value) }))} />
                      </div>
                      <div>
                        <Label>Meta Qtd</Label>
                        <Input type="number" value={newGoal.goal_count} onChange={e => setNewGoal(g => ({ ...g, goal_count: Number(e.target.value) }))} />
                      </div>
                    </div>
                    <Button className="w-full" disabled={!newGoal.target_name || saveGoalMut.isPending} onClick={async () => {
                      await saveGoalMut.mutateAsync({
                        goal_type: newGoal.goal_type as any,
                        period_year: goalYear,
                        period_month: goalMonth,
                        target_type: newGoal.target_type as any,
                        target_name: newGoal.target_name,
                        goal_value: newGoal.goal_value,
                        goal_count: newGoal.goal_count || undefined,
                      });
                      toast({ title: "Meta salva" });
                      setShowGoalDialog(false);
                    }}>
                      {saveGoalMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar Meta'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {/* Goals vs Realized Table */}
            {loadingGoals ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              (['orcamento', 'pedido', 'faturamento'] as const).map(type => {
                const typeGoals = goalsData?.goals?.filter(g => g.goal_type === type) || [];
                if (!typeGoals.length) return null;
                return (
                  <Card key={type}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Target className="h-4 w-4" /> {TYPE_LABELS[type]} - Metas vs Realizado ({MONTHS[goalMonth - 1]} {goalYear})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Tipo</TableHead>
                            <TableHead>Nome</TableHead>
                            <TableHead className="text-right">Meta (R$)</TableHead>
                            <TableHead className="text-right">Realizado (R$)</TableHead>
                            <TableHead className="text-right">%</TableHead>
                            <TableHead className="w-32">Progresso</TableHead>
                            <TableHead className="w-10"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {typeGoals.map(g => {
                            const realized = getGoalRealized(g.goal_type, g.target_type, g.target_name);
                            const pct = g.goal_value > 0 ? Math.round((realized.value / g.goal_value) * 100) : 0;
                            return (
                              <TableRow key={g.id}>
                                <TableCell>
                                  <Badge variant={g.target_type === 'channel' ? 'default' : 'secondary'}>
                                    {g.target_type === 'channel' ? 'Canal' : 'Individual'}
                                  </Badge>
                                </TableCell>
                                <TableCell className="font-medium">{g.target_name}</TableCell>
                                <TableCell className="text-right">{formatCurrency(g.goal_value)}</TableCell>
                                <TableCell className="text-right font-semibold">{formatCurrency(realized.value)}</TableCell>
                                <TableCell className={cn("text-right font-bold", pct >= 100 ? "text-green-500" : pct >= 70 ? "text-yellow-500" : "text-red-500")}>
                                  {pct}%
                                </TableCell>
                                <TableCell>
                                  <Progress value={Math.min(pct, 100)} className="h-2" />
                                </TableCell>
                                <TableCell>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                                    deleteGoalMut.mutate(g.id);
                                    toast({ title: "Meta removida" });
                                  }}>
                                    <Trash2 className="h-3 w-3 text-destructive" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                );
              })
            )}

            {!loadingGoals && !goalsData?.goals?.length && (
              <div className="text-center py-12 text-muted-foreground">
                <Target className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>Nenhuma meta cadastrada para {MONTHS[goalMonth - 1]} {goalYear}</p>
                <p className="text-xs mt-1">Clique em "Nova Meta" para começar</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
