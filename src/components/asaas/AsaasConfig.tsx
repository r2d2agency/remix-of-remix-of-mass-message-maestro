import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAsaas } from "@/hooks/use-asaas";
import { useNotifications } from "@/hooks/use-notifications";
import { 
  RefreshCw, Settings, Receipt, Users, Bell, Plus, Trash2, 
  CheckCircle, AlertCircle, Clock, Calendar, Link2,
  History, RotateCcw, Play, BarChart3, Download, TrendingUp,
  TrendingDown, Percent, Ban, Pause, AlertTriangle, Shield,
  Eye, EyeOff, Check
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import * as XLSX from "xlsx";

interface AsaasConfigProps {
  organizationId: string;
  connections: Array<{ id: string; name: string }>;
}

export default function AsaasConfig({ organizationId, connections }: AsaasConfigProps) {
  const { toast } = useToast();
  const { 
    loading, error, 
    getIntegration, configureIntegration, syncPayments,
    getPayments, getCustomers, getRules, createRule, updateRule, deleteRule,
    getDashboard, getReport, updateCustomer, getSettings, updateSettings,
    getAlerts, updateAlert, generateAlerts
  } = useAsaas(organizationId);
  
  const { 
    loading: notifLoading, 
    getStats: getNotificationStats, 
    getHistory: getNotificationHistory,
    triggerRule,
    retryNotifications 
  } = useNotifications(organizationId);

  const [integration, setIntegration] = useState<any>(null);
  const [apiKey, setApiKey] = useState("");
  const [environment, setEnvironment] = useState<"sandbox" | "production">("sandbox");
  const [payments, setPayments] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [notificationHistory, setNotificationHistory] = useState<any[]>([]);
  const [notificationStats, setNotificationStats] = useState<any>(null);
  const [dashboard, setDashboard] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [historyStatusFilter, setHistoryStatusFilter] = useState<string>("all");
  const [reportStatusFilter, setReportStatusFilter] = useState<string>("OVERDUE");
  const [showBlacklisted, setShowBlacklisted] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showRuleDialog, setShowRuleDialog] = useState(false);
  const [showCustomerDialog, setShowCustomerDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [editingRule, setEditingRule] = useState<any>(null);
  const [editingCustomer, setEditingCustomer] = useState<any>(null);
  const [triggeringRule, setTriggeringRule] = useState<string | null>(null);

  // Form state for new rule
  const [ruleForm, setRuleForm] = useState({
    name: "",
    trigger_type: "before_due" as "before_due" | "on_due" | "after_due",
    days_offset: 3,
    max_days_overdue: 30,
    message_template: "Olá {{nome}}! Sua fatura de R$ {{valor}} vence em {{vencimento}}. Acesse: {{link}}",
    send_time: "09:00",
    connection_id: "",
    min_delay: 120,
    max_delay: 300,
    pause_after_messages: 20,
    pause_duration: 600
  });

  // Settings form
  const [settingsForm, setSettingsForm] = useState({
    daily_message_limit_per_customer: 3,
    billing_paused: false,
    billing_paused_until: "",
    billing_paused_reason: "",
    critical_alert_threshold: 1000,
    critical_alert_days: 30,
    alert_email: "",
    alert_whatsapp: "",
    alert_connection_id: ""
  });

  useEffect(() => {
    loadData();
  }, [organizationId]);

  // Reload customers when showBlacklisted changes
  useEffect(() => {
    const loadCustomersOnly = async () => {
      const custs = await getCustomers(showBlacklisted);
      setCustomers(custs);
    };
    loadCustomersOnly();
  }, [showBlacklisted, getCustomers]);

  const loadData = async () => {
    const [integ, pays, custs, rls, stats, history, dash, sett, alts] = await Promise.all([
      getIntegration(),
      getPayments(),
      getCustomers(showBlacklisted),
      getRules(),
      getNotificationStats(),
      getNotificationHistory({ limit: 50 }),
      getDashboard(),
      getSettings(),
      getAlerts()
    ]);
    setIntegration(integ);
    setPayments(pays);
    setCustomers(custs);
    setRules(rls);
    setNotificationStats(stats);
    setNotificationHistory(history);
    setDashboard(dash);
    setSettings(sett);
    setAlerts(alts);
    
    if (sett) {
      setSettingsForm({
        daily_message_limit_per_customer: sett.daily_message_limit_per_customer || 3,
        billing_paused: sett.billing_paused || false,
        billing_paused_until: sett.billing_paused_until || "",
        billing_paused_reason: sett.billing_paused_reason || "",
        critical_alert_threshold: sett.critical_alert_threshold || 1000,
        critical_alert_days: sett.critical_alert_days || 30,
        alert_email: sett.alert_email || "",
        alert_whatsapp: sett.alert_whatsapp || "",
        alert_connection_id: sett.alert_connection_id || ""
      });
    }
  };

  const handleSaveSettings = async () => {
    const result = await updateSettings(settingsForm);
    if (result) {
      toast({ title: "Configurações salvas!" });
      setShowSettingsDialog(false);
      await loadData();
    } else {
      toast({ title: "Erro ao salvar configurações", variant: "destructive" });
    }
  };

  const handleToggleBlacklist = async (customer: any) => {
    console.log('handleToggleBlacklist called with:', customer.id, customer.name);
    try {
      const result = await updateCustomer(customer.id, {
        is_blacklisted: !customer.is_blacklisted,
        blacklist_reason: !customer.is_blacklisted ? "Adicionado manualmente à blacklist" : undefined
      });
      console.log('updateCustomer result:', result);
      if (result) {
        toast({ title: customer.is_blacklisted ? "Cliente removido da blacklist" : "Cliente adicionado à blacklist" });
        await loadData();
      } else {
        toast({ 
          title: "Erro ao atualizar cliente", 
          description: error || "Verifique o console para mais detalhes",
          variant: "destructive" 
        });
      }
    } catch (err) {
      console.error('handleToggleBlacklist error:', err);
      toast({ 
        title: "Erro ao atualizar cliente", 
        description: String(err),
        variant: "destructive" 
      });
    }
  };

  const handleTogglePause = (customer: any) => {
    console.log('handleTogglePause called with:', customer.id, customer.name);
    setEditingCustomer(customer);
    setShowCustomerDialog(true);
  };

  const handleSaveCustomerPause = async () => {
    if (!editingCustomer) return;

    const normalizedPauseUntil = editingCustomer.pauseUntil ? editingCustomer.pauseUntil : null;
    const normalizedPauseReason = editingCustomer.pauseReason ? editingCustomer.pauseReason : null;
    
    const result = await updateCustomer(editingCustomer.id, {
      billing_paused: !editingCustomer.billing_paused,
      billing_paused_until: editingCustomer.billing_paused ? null : normalizedPauseUntil,
      billing_paused_reason: editingCustomer.billing_paused ? null : normalizedPauseReason
    });
    
    if (result) {
      toast({ title: editingCustomer.billing_paused ? "Cobranças retomadas" : "Cobranças pausadas" });
      setShowCustomerDialog(false);
      setEditingCustomer(null);
      await loadData();
    } else {
      toast({ 
        title: "Erro ao pausar/retomar cobranças", 
        description: error || "Verifique o console para mais detalhes",
        variant: "destructive" 
      });
    }
  };

  const handleMarkAlertRead = async (alertId: string) => {
    await updateAlert(alertId, { is_read: true });
    await loadData();
  };

  const handleResolveAlert = async (alertId: string) => {
    await updateAlert(alertId, { is_resolved: true });
    toast({ title: "Alerta resolvido" });
    await loadData();
  };

  const handleGenerateAlerts = async () => {
    const result = await generateAlerts();
    if (result) {
      toast({ title: `${result.alerts_created} alertas gerados` });
      await loadData();
    }
  };

  const handleExportReport = async () => {
    setExporting(true);
    try {
      const data = await getReport({ status: reportStatusFilter !== 'all' ? reportStatusFilter : undefined });
      
      if (data.length === 0) {
        toast({ title: "Nenhum dado para exportar", variant: "destructive" });
        return;
      }

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Inadimplentes");
      
      const fileName = `relatorio_inadimplentes_${format(new Date(), "yyyy-MM-dd")}.xlsx`;
      XLSX.writeFile(wb, fileName);
      
      toast({ title: "Relatório exportado com sucesso!" });
    } catch (err) {
      toast({ title: "Erro ao exportar relatório", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const handleTriggerRule = async (ruleId: string) => {
    setTriggeringRule(ruleId);
    const result = await triggerRule(ruleId);
    setTriggeringRule(null);
    
    if (result) {
      toast({ 
        title: "Notificações disparadas!", 
        description: `${result.sent} enviadas, ${result.failed} falharam de ${result.total} total.`
      });
      await loadData();
    } else {
      toast({ title: "Erro ao disparar notificações", variant: "destructive" });
    }
  };

  const handleRetryFailed = async () => {
    const failedIds = notificationHistory
      .filter(n => n.status === 'failed')
      .map(n => n.id);
    
    if (failedIds.length === 0) {
      toast({ title: "Nenhuma notificação com falha para reenviar" });
      return;
    }

    const result = await retryNotifications(failedIds);
    if (result) {
      toast({ 
        title: "Reenvio concluído!", 
        description: `${result.retried} reenviadas, ${result.failed} falharam.`
      });
      await loadData();
    }
  };

  const handleConfigure = async () => {
    if (!apiKey) {
      toast({ title: "API Key obrigatória", variant: "destructive" });
      return;
    }

    const result = await configureIntegration(apiKey, environment);
    if (result) {
      setIntegration(result);
      setApiKey("");
      toast({ title: "Integração configurada com sucesso!" });
    } else if (error) {
      toast({ title: error, variant: "destructive" });
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    const result = await syncPayments();
    setSyncing(false);
    
    if (result) {
      toast({ 
        title: "Sincronização concluída!", 
        description: `${result.customers_synced} clientes e ${result.payments_synced} cobranças sincronizados.`
      });
      await loadData();
    } else if (error) {
      toast({ title: error, variant: "destructive" });
    }
  };

  const handleSaveRule = async () => {
    const ruleData = {
      ...ruleForm,
      days_offset: ruleForm.trigger_type === "before_due" ? -Math.abs(ruleForm.days_offset) : 
                   ruleForm.trigger_type === "after_due" ? Math.abs(ruleForm.days_offset) : 0
    };

    const result = editingRule 
      ? await updateRule(editingRule.id, ruleData)
      : await createRule(ruleData);

    if (result) {
      toast({ title: editingRule ? "Regra atualizada!" : "Regra criada!" });
      setShowRuleDialog(false);
      setEditingRule(null);
      setRuleForm({
        name: "",
        trigger_type: "before_due",
        days_offset: 3,
        max_days_overdue: 30,
        message_template: "Olá {{nome}}! Sua fatura de R$ {{valor}} vence em {{vencimento}}. Acesse: {{link}}",
        send_time: "09:00",
        connection_id: "",
        min_delay: 120,
        max_delay: 300,
        pause_after_messages: 20,
        pause_duration: 600
      });
      await loadData();
    } else if (error) {
      toast({ title: error, variant: "destructive" });
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (await deleteRule(ruleId)) {
      toast({ title: "Regra excluída!" });
      await loadData();
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { color: string; label: string }> = {
      PENDING: { color: "bg-yellow-500", label: "Pendente" },
      OVERDUE: { color: "bg-red-500", label: "Vencido" },
      RECEIVED: { color: "bg-green-500", label: "Recebido" },
      CONFIRMED: { color: "bg-green-600", label: "Confirmado" },
      RECEIVED_IN_CASH: { color: "bg-green-500", label: "Recebido em dinheiro" },
      REFUNDED: { color: "bg-gray-500", label: "Estornado" },
      DELETED: { color: "bg-gray-400", label: "Removido" }
    };
    const variant = variants[status] || { color: "bg-gray-500", label: status };
    return <Badge className={`${variant.color} text-white`}>{variant.label}</Badge>;
  };

  const filteredPayments = payments.filter(p => 
    statusFilter === "all" || p.status === statusFilter
  );

  const stats = {
    pending: payments.filter(p => p.status === "PENDING").length,
    overdue: payments.filter(p => p.status === "OVERDUE").length,
    pendingValue: payments.filter(p => p.status === "PENDING").reduce((sum, p) => sum + Number(p.value), 0),
    overdueValue: payments.filter(p => p.status === "OVERDUE").reduce((sum, p) => sum + Number(p.value), 0)
  };

  return (
    <div className="space-y-6">
      {/* Configuration Card */}
      {!integration?.is_active && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Configurar Integração Asaas
            </CardTitle>
            <CardDescription>
              Conecte sua conta Asaas para sincronizar cobranças e enviar notificações automáticas.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>API Key</Label>
                <Input 
                  type="password"
                  placeholder="$aact_..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Ambiente</Label>
                <Select value={environment} onValueChange={(v: any) => setEnvironment(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sandbox">Sandbox (Testes)</SelectItem>
                    <SelectItem value="production">Produção</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={handleConfigure} disabled={loading}>
              {loading ? "Conectando..." : "Conectar Asaas"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Stats and Actions */}
      {integration?.is_active && (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-green-500 text-green-500">
                <CheckCircle className="mr-1 h-3 w-3" />
                Asaas Conectado ({integration.environment})
              </Badge>
              {integration.last_sync_at && (
                <span className="text-sm text-muted-foreground">
                  Última sincronização: {format(parseISO(integration.last_sync_at), "dd/MM HH:mm")}
                </span>
              )}
            </div>
            <Button onClick={handleSync} disabled={syncing} variant="outline">
              <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Sincronizando..." : "Sincronizar"}
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Pendentes</p>
                    <p className="text-2xl font-bold text-yellow-500">{stats.pending}</p>
                  </div>
                  <Clock className="h-8 w-8 text-yellow-500/20" />
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  R$ {stats.pendingValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Vencidos</p>
                    <p className="text-2xl font-bold text-red-500">{stats.overdue}</p>
                  </div>
                  <AlertCircle className="h-8 w-8 text-red-500/20" />
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  R$ {stats.overdueValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Clientes</p>
                    <p className="text-2xl font-bold">{customers.length}</p>
                  </div>
                  <Users className="h-8 w-8 text-primary/20" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Regras Ativas</p>
                    <p className="text-2xl font-bold">{rules.filter(r => r.is_active).length}</p>
                  </div>
                  <Bell className="h-8 w-8 text-primary/20" />
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="dashboard" className="w-full">
            <TabsList className="flex-wrap">
              <TabsTrigger value="dashboard">
                <BarChart3 className="mr-2 h-4 w-4" />
                Dashboard
              </TabsTrigger>
              <TabsTrigger value="payments">
                <Receipt className="mr-2 h-4 w-4" />
                Cobranças
              </TabsTrigger>
              <TabsTrigger value="customers">
                <Users className="mr-2 h-4 w-4" />
                Clientes
              </TabsTrigger>
              <TabsTrigger value="rules">
                <Bell className="mr-2 h-4 w-4" />
                Regras
              </TabsTrigger>
              <TabsTrigger value="alerts" className="relative">
                <AlertTriangle className="mr-2 h-4 w-4" />
                Alertas
                {alerts.filter(a => !a.is_read).length > 0 && (
                  <Badge className="ml-2 bg-red-500 text-white text-xs px-1.5">
                    {alerts.filter(a => !a.is_read).length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="settings">
                <Settings className="mr-2 h-4 w-4" />
                Configurações
              </TabsTrigger>
              <TabsTrigger value="history">
                <History className="mr-2 h-4 w-4" />
                Histórico
              </TabsTrigger>
            </TabsList>

            {/* Dashboard Tab */}
            <TabsContent value="dashboard" className="space-y-6">
              {dashboard && (
                <>
                  {/* Recovery Rate */}
                  <div className="grid gap-4 md:grid-cols-3">
                    <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
                      <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-muted-foreground">Taxa de Recuperação</p>
                            <p className="text-3xl font-bold text-green-500">
                              {dashboard.recovery.notified_payments > 0 
                                ? Math.round((dashboard.recovery.recovered_payments / dashboard.recovery.notified_payments) * 100)
                                : 0}%
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {dashboard.recovery.recovered_payments} de {dashboard.recovery.notified_payments} pagamentos
                            </p>
                          </div>
                          <Percent className="h-10 w-10 text-green-500/30" />
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/20">
                      <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-muted-foreground">Total em Atraso</p>
                            <p className="text-3xl font-bold text-red-500">
                              R$ {Number(dashboard.general.overdue_value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {dashboard.general.overdue_count} cobranças vencidas
                            </p>
                          </div>
                          <TrendingDown className="h-10 w-10 text-red-500/30" />
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
                      <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-muted-foreground">Total Recebido</p>
                            <p className="text-3xl font-bold text-blue-500">
                              R$ {Number(dashboard.general.paid_value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {dashboard.general.paid_count} pagamentos confirmados
                            </p>
                          </div>
                          <TrendingUp className="h-10 w-10 text-blue-500/30" />
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Charts */}
                  <div className="grid gap-6 md:grid-cols-2">
                    {/* Payments by Month */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Pagamentos por Mês</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={250}>
                          <BarChart data={dashboard.paymentsByMonth}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                            <YAxis tick={{ fontSize: 12 }} />
                            <Tooltip 
                              formatter={(value: number) => `R$ ${value.toLocaleString("pt-BR")}`}
                              contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                            />
                            <Bar dataKey="paid_value" name="Pago" fill="#22c55e" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="overdue_value" name="Vencido" fill="#ef4444" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>

                    {/* Overdue by Days */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Inadimplência por Período</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={250}>
                          <PieChart>
                            <Pie
                              data={dashboard.overdueByDays}
                              dataKey="value"
                              nameKey="range"
                              cx="50%"
                              cy="50%"
                              outerRadius={80}
                              label={({ range, percent }) => `${range} (${(percent * 100).toFixed(0)}%)`}
                            >
                              {dashboard.overdueByDays.map((entry: any, index: number) => (
                                <Cell 
                                  key={`cell-${index}`} 
                                  fill={['#fbbf24', '#f97316', '#ef4444', '#dc2626', '#991b1b'][index % 5]} 
                                />
                              ))}
                            </Pie>
                            <Tooltip 
                              formatter={(value: number) => `R$ ${value.toLocaleString("pt-BR")}`}
                              contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Top Defaulters + Export */}
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                      <div>
                        <CardTitle className="text-lg">Maiores Inadimplentes</CardTitle>
                        <CardDescription>Top 10 clientes com maior valor em atraso</CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Select value={reportStatusFilter} onValueChange={setReportStatusFilter}>
                          <SelectTrigger className="w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todos</SelectItem>
                            <SelectItem value="OVERDUE">Vencidos</SelectItem>
                            <SelectItem value="PENDING">Pendentes</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button onClick={handleExportReport} disabled={exporting}>
                          {exporting ? (
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="mr-2 h-4 w-4" />
                          )}
                          Exportar Excel
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Cliente</TableHead>
                            <TableHead>Telefone</TableHead>
                            <TableHead>Qtd. Vencidos</TableHead>
                            <TableHead>Total em Atraso</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {dashboard.topDefaulters.map((defaulter: any, index: number) => (
                            <TableRow key={index}>
                              <TableCell>
                                <div>
                                  <p className="font-medium">{defaulter.name}</p>
                                  <p className="text-xs text-muted-foreground">{defaulter.email}</p>
                                </div>
                              </TableCell>
                              <TableCell>{defaulter.phone}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-red-500 border-red-500">
                                  {defaulter.overdue_count}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-bold text-red-500">
                                R$ {Number(defaulter.total_overdue).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                              </TableCell>
                            </TableRow>
                          ))}
                          {dashboard.topDefaulters.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                                Nenhum inadimplente encontrado 🎉
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </>
              )}
            </TabsContent>

            <TabsContent value="payments" className="space-y-4">
              <div className="flex items-center gap-4">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Filtrar por status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="PENDING">Pendentes</SelectItem>
                    <SelectItem value="OVERDUE">Vencidos</SelectItem>
                    <SelectItem value="RECEIVED">Recebidos</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Link</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPayments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{payment.customer_name}</p>
                            <p className="text-sm text-muted-foreground">{payment.customer_phone}</p>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          R$ {Number(payment.value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            {format(parseISO(payment.due_date), "dd/MM/yyyy")}
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(payment.status)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{payment.billing_type}</Badge>
                        </TableCell>
                        <TableCell>
                          {payment.invoice_url && (
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => window.open(payment.invoice_url, "_blank")}
                            >
                              <Link2 className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredPayments.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          Nenhuma cobrança encontrada
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Card>
            </TabsContent>

            <TabsContent value="customers" className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch checked={showBlacklisted} onCheckedChange={(v) => { setShowBlacklisted(v); }} />
                  <Label className="text-sm">Mostrar blacklist</Label>
                </div>
              </div>
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Contato</TableHead>
                      <TableHead>Pendentes</TableHead>
                      <TableHead>Vencidos</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customers.map((customer) => (
                      <TableRow key={customer.id} className={customer.is_blacklisted ? "opacity-50 bg-red-500/5" : ""}>
                        <TableCell>
                          <p className="font-medium">{customer.name}</p>
                          <p className="text-sm text-muted-foreground">{customer.cpf_cnpj}</p>
                        </TableCell>
                        <TableCell>
                          <p>{customer.phone}</p>
                          <p className="text-sm text-muted-foreground">{customer.email}</p>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-yellow-500">{customer.pending_count}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-red-500">{customer.overdue_count}</Badge>
                        </TableCell>
                        <TableCell className="font-medium">
                          R$ {Number(customer.total_due || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {customer.is_blacklisted && (
                              <Badge className="bg-red-500 text-white"><Ban className="h-3 w-3 mr-1" />Blacklist</Badge>
                            )}
                            {customer.billing_paused && (
                              <Badge className="bg-yellow-500 text-white"><Pause className="h-3 w-3 mr-1" />Pausado</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleToggleBlacklist(customer);
                              }} 
                              title={customer.is_blacklisted ? "Remover da blacklist" : "Adicionar à blacklist"}
                            >
                              <Ban className={`h-4 w-4 ${customer.is_blacklisted ? "text-red-500" : ""}`} />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleTogglePause(customer);
                              }} 
                              title={customer.billing_paused ? "Retomar cobranças" : "Pausar cobranças"}
                            >
                              <Pause className={`h-4 w-4 ${customer.billing_paused ? "text-yellow-500" : ""}`} />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </TabsContent>

            {/* Alerts Tab */}
            <TabsContent value="alerts" className="space-y-4">
              <div className="flex justify-end">
                <Button onClick={handleGenerateAlerts} variant="outline">
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Verificar Inadimplências
                </Button>
              </div>
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Alerta</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Dias</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {alerts.map((alert) => (
                      <TableRow key={alert.id} className={!alert.is_read ? "bg-yellow-500/5" : ""}>
                        <TableCell>
                          <p className="font-medium">{alert.customer_name}</p>
                          <p className="text-sm text-muted-foreground">{alert.customer_phone}</p>
                        </TableCell>
                        <TableCell>
                          <p className="font-medium">{alert.title}</p>
                          <p className="text-sm text-muted-foreground">{alert.description}</p>
                        </TableCell>
                        <TableCell className="text-red-500 font-bold">
                          R$ {Number(alert.total_overdue || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-red-500">{alert.days_overdue} dias</Badge>
                        </TableCell>
                        <TableCell>
                          {alert.is_resolved ? (
                            <Badge className="bg-green-500 text-white">Resolvido</Badge>
                          ) : !alert.is_read ? (
                            <Badge className="bg-yellow-500 text-white">Novo</Badge>
                          ) : (
                            <Badge variant="outline">Lido</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {!alert.is_read && (
                              <Button variant="ghost" size="sm" onClick={() => handleMarkAlertRead(alert.id)}>
                                <Eye className="h-4 w-4" />
                              </Button>
                            )}
                            {!alert.is_resolved && (
                              <Button variant="ghost" size="sm" onClick={() => handleResolveAlert(alert.id)}>
                                <Check className="h-4 w-4 text-green-500" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {alerts.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          Nenhum alerta de inadimplência 🎉
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Card>
            </TabsContent>

            {/* Settings Tab */}
            <TabsContent value="settings" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Shield className="h-5 w-5" />
                      Limite de Mensagens
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Máximo de mensagens por cliente/dia</Label>
                      <Input type="number" min={1} max={10} value={settingsForm.daily_message_limit_per_customer}
                        onChange={(e) => setSettingsForm({...settingsForm, daily_message_limit_per_customer: parseInt(e.target.value) || 3})} />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Pause className="h-5 w-5" />
                      Pausar Cobranças (Global)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Switch checked={settingsForm.billing_paused} onCheckedChange={(v) => setSettingsForm({...settingsForm, billing_paused: v})} />
                      <Label>Pausar todas as cobranças</Label>
                    </div>
                    {settingsForm.billing_paused && (
                      <>
                        <div className="space-y-2">
                          <Label>Pausar até</Label>
                          <Input type="date" value={settingsForm.billing_paused_until}
                            onChange={(e) => setSettingsForm({...settingsForm, billing_paused_until: e.target.value})} />
                        </div>
                        <div className="space-y-2">
                          <Label>Motivo</Label>
                          <Input placeholder="Ex: Férias, manutenção..." value={settingsForm.billing_paused_reason}
                            onChange={(e) => setSettingsForm({...settingsForm, billing_paused_reason: e.target.value})} />
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

                <Card className="md:col-span-2">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5" />
                      Alertas de Inadimplência
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Valor limite para alerta (R$)</Label>
                        <Input type="number" min={100} value={settingsForm.critical_alert_threshold}
                          onChange={(e) => setSettingsForm({...settingsForm, critical_alert_threshold: parseFloat(e.target.value) || 1000})} />
                      </div>
                      <div className="space-y-2">
                        <Label>Dias de atraso para alerta</Label>
                        <Input type="number" min={7} value={settingsForm.critical_alert_days}
                          onChange={(e) => setSettingsForm({...settingsForm, critical_alert_days: parseInt(e.target.value) || 30})} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
              <Button onClick={handleSaveSettings} disabled={loading}>
                {loading ? "Salvando..." : "Salvar Configurações"}
              </Button>
            </TabsContent>

            <TabsContent value="rules" className="space-y-4">
              <div className="flex justify-end">
                <Dialog open={showRuleDialog} onOpenChange={setShowRuleDialog}>
                  <DialogTrigger asChild>
                    <Button onClick={() => {
                      setEditingRule(null);
                      setRuleForm({
                        name: "",
                        trigger_type: "before_due",
                        days_offset: 3,
                        max_days_overdue: 30,
                        message_template: "Olá {{nome}}! Sua fatura de R$ {{valor}} vence em {{vencimento}}. Acesse: {{link}}",
                        send_time: "09:00",
                        connection_id: "",
                        min_delay: 120,
                        max_delay: 300,
                        pause_after_messages: 20,
                        pause_duration: 600
                      });
                    }}>
                      <Plus className="mr-2 h-4 w-4" />
                      Nova Regra
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
                    <DialogHeader className="flex-shrink-0">
                      <DialogTitle>
                        {editingRule ? "Editar Regra" : "Nova Regra de Notificação"}
                      </DialogTitle>
                      <DialogDescription>
                        Configure quando e como as notificações serão enviadas.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 overflow-y-auto flex-1 pr-2">
                      <div className="space-y-2">
                        <Label>Nome da Regra</Label>
                        <Input 
                          placeholder="Ex: Lembrete 3 dias antes"
                          value={ruleForm.name}
                          onChange={(e) => setRuleForm({...ruleForm, name: e.target.value})}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Tipo de Disparo</Label>
                          <Select 
                            value={ruleForm.trigger_type} 
                            onValueChange={(v: any) => setRuleForm({...ruleForm, trigger_type: v})}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="before_due">Antes do vencimento</SelectItem>
                              <SelectItem value="on_due">No dia do vencimento</SelectItem>
                              <SelectItem value="after_due">Após o vencimento</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {ruleForm.trigger_type !== "on_due" && (
                          <div className="space-y-2">
                            <Label>Dias</Label>
                            <Input 
                              type="number"
                              min={1}
                              value={ruleForm.days_offset}
                              onChange={(e) => setRuleForm({...ruleForm, days_offset: parseInt(e.target.value) || 0})}
                            />
                          </div>
                        )}
                      </div>
                      {ruleForm.trigger_type === "after_due" && (
                        <div className="space-y-2">
                          <Label>Máximo de dias para cobrar</Label>
                          <Input 
                            type="number"
                            min={1}
                            value={ruleForm.max_days_overdue || ""}
                            onChange={(e) => setRuleForm({...ruleForm, max_days_overdue: parseInt(e.target.value) || null})}
                            placeholder="Ex: 30"
                          />
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Horário de Envio</Label>
                          <Input 
                            type="time"
                            value={ruleForm.send_time}
                            onChange={(e) => setRuleForm({...ruleForm, send_time: e.target.value})}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Conexão WhatsApp</Label>
                          <Select 
                            value={ruleForm.connection_id} 
                            onValueChange={(v) => setRuleForm({...ruleForm, connection_id: v})}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione..." />
                            </SelectTrigger>
                            <SelectContent>
                              {connections.map((conn) => (
                                <SelectItem key={conn.id} value={conn.id}>
                                  {conn.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      {/* Delay Settings */}
                      <div className="rounded-lg border border-border p-4 space-y-4">
                        <Label className="text-sm font-medium">Configurações de Envio (Anti-bloqueio)</Label>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground">Delay Mínimo (segundos)</Label>
                            <Input 
                              type="number"
                              min={60}
                              value={ruleForm.min_delay}
                              onChange={(e) => setRuleForm({...ruleForm, min_delay: parseInt(e.target.value) || 120})}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground">Delay Máximo (segundos)</Label>
                            <Input 
                              type="number"
                              min={120}
                              value={ruleForm.max_delay}
                              onChange={(e) => setRuleForm({...ruleForm, max_delay: parseInt(e.target.value) || 300})}
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground">Pausar após X mensagens</Label>
                            <Input 
                              type="number"
                              min={5}
                              value={ruleForm.pause_after_messages}
                              onChange={(e) => setRuleForm({...ruleForm, pause_after_messages: parseInt(e.target.value) || 20})}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground">Duração da pausa (segundos)</Label>
                            <Input 
                              type="number"
                              min={60}
                              value={ruleForm.pause_duration}
                              onChange={(e) => setRuleForm({...ruleForm, pause_duration: parseInt(e.target.value) || 600})}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Mensagem</Label>
                        <Textarea 
                          rows={4}
                          placeholder="Use variáveis: {{nome}}, {{valor}}, {{vencimento}}, {{link}}, {{boleto}}, {{pix}}"
                          value={ruleForm.message_template}
                          onChange={(e) => setRuleForm({...ruleForm, message_template: e.target.value})}
                        />
                        <p className="text-xs text-muted-foreground">
                          Variáveis: {"{{nome}}"}, {"{{valor}}"}, {"{{vencimento}}"}, {"{{link}}"}, {"{{boleto}}"}, {"{{pix}}"}, {"{{descricao}}"}
                        </p>
                      </div>

                      {/* Message Preview */}
                      {ruleForm.message_template && (
                        <div className="space-y-2">
                          <Label className="flex items-center gap-2">
                            <Eye className="h-4 w-4" />
                            Preview da Mensagem
                          </Label>
                          <div className="rounded-lg bg-[#0d1418] border border-border p-4">
                            <div className="flex gap-2">
                              <div className="flex-1 bg-[#005c4b] rounded-lg p-3 text-sm text-white whitespace-pre-wrap">
                                {ruleForm.message_template
                                  .replace(/\{\{nome\}\}/g, "João Silva")
                                  .replace(/\{\{valor\}\}/g, "R$ 150,00")
                                  .replace(/\{\{vencimento\}\}/g, "25/01/2026")
                                  .replace(/\{\{link\}\}/g, "https://asaas.com/i/abc123")
                                  .replace(/\{\{boleto\}\}/g, "23793.38128 60000.000003 00000.000400 1 92850000015000")
                                  .replace(/\{\{pix\}\}/g, "00020126...")
                                  .replace(/\{\{descricao\}\}/g, "Mensalidade Janeiro/2026")}
                              </div>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-2 text-right">
                              Dados de exemplo para visualização
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowRuleDialog(false)}>
                        Cancelar
                      </Button>
                      <Button onClick={handleSaveRule} disabled={loading}>
                        {loading ? "Salvando..." : "Salvar"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Disparo</TableHead>
                      <TableHead>Horário</TableHead>
                      <TableHead>Conexão</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rules.map((rule) => (
                      <TableRow key={rule.id}>
                        <TableCell className="font-medium">{rule.name}</TableCell>
                        <TableCell>
                          {rule.trigger_type === "before_due" && `${Math.abs(rule.days_offset)} dias antes`}
                          {rule.trigger_type === "on_due" && "No dia do vencimento"}
                          {rule.trigger_type === "after_due" && `${rule.days_offset} dias após`}
                        </TableCell>
                        <TableCell>{rule.send_time}</TableCell>
                        <TableCell>{rule.connection_name || "-"}</TableCell>
                        <TableCell>
                          <Switch 
                            checked={rule.is_active}
                            onCheckedChange={async (checked) => {
                              await updateRule(rule.id, { is_active: checked });
                              await loadData();
                            }}
                          />
                        </TableCell>
                        <TableCell className="flex gap-1">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleTriggerRule(rule.id)}
                            disabled={triggeringRule === rule.id || !rule.connection_id}
                            title="Disparar agora"
                          >
                            {triggeringRule === rule.id ? (
                              <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : (
                              <Play className="h-4 w-4" />
                            )}
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleDeleteRule(rule.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {rules.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          Nenhuma regra configurada
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Card>
            </TabsContent>

            {/* Notification History Tab */}
            <TabsContent value="history" className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Select value={historyStatusFilter} onValueChange={setHistoryStatusFilter}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Filtrar por status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="sent">Enviados</SelectItem>
                      <SelectItem value="failed">Falhou</SelectItem>
                      <SelectItem value="pending">Pendente</SelectItem>
                    </SelectContent>
                  </Select>
                  {notificationStats && (
                    <div className="flex gap-4 text-sm">
                      <span className="text-green-500">✓ {notificationStats.sent_today || 0} hoje</span>
                      <span className="text-muted-foreground">| {notificationStats.sent_week || 0} na semana</span>
                      <span className="text-muted-foreground">| {notificationStats.sent_month || 0} no mês</span>
                    </div>
                  )}
                </div>
                <Button 
                  variant="outline" 
                  onClick={handleRetryFailed}
                  disabled={notifLoading || !notificationHistory.some(n => n.status === 'failed')}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Reenviar com Falha
                </Button>
              </div>

              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead>Regra</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Enviado em</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {notificationHistory
                      .filter(n => historyStatusFilter === 'all' || n.status === historyStatusFilter)
                      .map((notif) => (
                        <TableRow key={notif.id}>
                          <TableCell className="font-medium">{notif.customer_name}</TableCell>
                          <TableCell>{notif.phone}</TableCell>
                          <TableCell>{notif.rule_name || '-'}</TableCell>
                          <TableCell>
                            R$ {Number(notif.payment_value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell>
                            {notif.due_date ? format(parseISO(notif.due_date), "dd/MM/yyyy") : '-'}
                          </TableCell>
                          <TableCell>
                            {notif.status === 'sent' && (
                              <Badge className="bg-green-500 text-white">Enviado</Badge>
                            )}
                            {notif.status === 'failed' && (
                              <Badge className="bg-red-500 text-white">Falhou</Badge>
                            )}
                            {notif.status === 'pending' && (
                              <Badge className="bg-yellow-500 text-white">Pendente</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {notif.sent_at 
                              ? format(parseISO(notif.sent_at), "dd/MM HH:mm") 
                              : '-'
                            }
                          </TableCell>
                        </TableRow>
                      ))}
                    {notificationHistory.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          Nenhuma notificação enviada ainda
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Customer Pause Dialog */}
          <Dialog open={showCustomerDialog} onOpenChange={(open) => {
            setShowCustomerDialog(open);
            if (!open) setEditingCustomer(null);
          }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingCustomer?.billing_paused ? "Retomar Cobranças" : "Pausar Cobranças"}
                </DialogTitle>
                <DialogDescription>
                  {editingCustomer?.billing_paused 
                    ? `Retomar o envio de notificações para ${editingCustomer?.name}`
                    : `Pausar temporariamente as notificações para ${editingCustomer?.name}`
                  }
                </DialogDescription>
              </DialogHeader>
              
              {!editingCustomer?.billing_paused && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Pausar até (opcional)</Label>
                    <Input 
                      type="date" 
                      value={editingCustomer?.pauseUntil || ""}
                      onChange={(e) => setEditingCustomer({
                        ...editingCustomer,
                        pauseUntil: e.target.value
                      })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Motivo (opcional)</Label>
                    <Input 
                      placeholder="Ex: Negociação em andamento..."
                      value={editingCustomer?.pauseReason || ""}
                      onChange={(e) => setEditingCustomer({
                        ...editingCustomer,
                        pauseReason: e.target.value
                      })}
                    />
                  </div>
                </div>
              )}

              {editingCustomer?.billing_paused && (
                <div className="py-4 text-center text-muted-foreground">
                  <Pause className="h-12 w-12 mx-auto mb-2 text-yellow-500" />
                  <p>As cobranças estão pausadas para este cliente.</p>
                  {editingCustomer?.billing_paused_until && (
                    <p className="text-sm mt-1">
                      Pausado até: {format(parseISO(editingCustomer.billing_paused_until), "dd/MM/yyyy")}
                    </p>
                  )}
                  {editingCustomer?.billing_paused_reason && (
                    <p className="text-sm mt-1">Motivo: {editingCustomer.billing_paused_reason}</p>
                  )}
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => {
                  setShowCustomerDialog(false);
                  setEditingCustomer(null);
                }}>
                  Cancelar
                </Button>
                <Button 
                  onClick={handleSaveCustomerPause}
                  disabled={loading}
                  variant={editingCustomer?.billing_paused ? "default" : "destructive"}
                >
                  {loading ? "Salvando..." : (
                    editingCustomer?.billing_paused ? "Retomar Cobranças" : "Pausar Cobranças"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
