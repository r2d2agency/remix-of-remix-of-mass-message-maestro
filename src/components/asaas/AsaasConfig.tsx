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
  CheckCircle, AlertCircle, Clock, Calendar, DollarSign, Link2,
  Send, History, RotateCcw, Play
} from "lucide-react";
import { format, parseISO, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";

interface AsaasConfigProps {
  organizationId: string;
  connections: Array<{ id: string; name: string }>;
}

export default function AsaasConfig({ organizationId, connections }: AsaasConfigProps) {
  const { toast } = useToast();
  const { 
    loading, error, 
    getIntegration, configureIntegration, syncPayments,
    getPayments, getCustomers, getRules, createRule, updateRule, deleteRule
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
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [historyStatusFilter, setHistoryStatusFilter] = useState<string>("all");
  const [syncing, setSyncing] = useState(false);
  const [showRuleDialog, setShowRuleDialog] = useState(false);
  const [editingRule, setEditingRule] = useState<any>(null);
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

  useEffect(() => {
    loadData();
  }, [organizationId]);

  const loadData = async () => {
    const [integ, pays, custs, rls, stats, history] = await Promise.all([
      getIntegration(),
      getPayments(),
      getCustomers(),
      getRules(),
      getNotificationStats(),
      getNotificationHistory({ limit: 50 })
    ]);
    setIntegration(integ);
    setPayments(pays);
    setCustomers(custs);
    setRules(rls);
    setNotificationStats(stats);
    setNotificationHistory(history);
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

          <Tabs defaultValue="payments" className="w-full">
            <TabsList>
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
              <TabsTrigger value="history">
                <History className="mr-2 h-4 w-4" />
                Histórico
              </TabsTrigger>
            </TabsList>

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

            <TabsContent value="customers">
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Contato</TableHead>
                      <TableHead>Pendentes</TableHead>
                      <TableHead>Vencidos</TableHead>
                      <TableHead>Total em Aberto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customers.map((customer) => (
                      <TableRow key={customer.id}>
                        <TableCell>
                          <p className="font-medium">{customer.name}</p>
                          <p className="text-sm text-muted-foreground">{customer.cpf_cnpj}</p>
                        </TableCell>
                        <TableCell>
                          <p>{customer.phone}</p>
                          <p className="text-sm text-muted-foreground">{customer.email}</p>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-yellow-500">
                            {customer.pending_count}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-red-500">
                            {customer.overdue_count}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">
                          R$ {Number(customer.total_due || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
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
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>
                        {editingRule ? "Editar Regra" : "Nova Regra de Notificação"}
                      </DialogTitle>
                      <DialogDescription>
                        Configure quando e como as notificações serão enviadas.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
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
        </>
      )}
    </div>
  );
}
