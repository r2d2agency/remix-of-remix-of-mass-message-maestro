import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { 
  Calendar, Clock, ChevronDown, ChevronRight, RefreshCw, 
  CheckCircle, XCircle, AlertCircle, Pause, Ban, 
  MessageSquare, Phone, DollarSign, Filter, Search,
  Loader2, CalendarDays, ListChecks, FileText, Play, TriangleAlert
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface BillingQueueProps {
  organizationId: string;
}

interface QueueDay {
  date: string;
  day_name: string;
  items: QueueItem[];
}

interface QueueItem {
  rule_id: string;
  rule_name: string;
  trigger_type: string;
  days_offset: number;
  send_time: string;
  connection_name: string;
  connection_status: string;
  payments_count: number;
  total_value: number;
  payments: Payment[];
}

interface Payment {
  id: string;
  customer_name: string;
  customer_phone: string;
  value: number;
  due_date: string;
  status: string;
  description: string;
}

interface LogDay {
  date: string;
  total: number;
  sent: number;
  failed: number;
  pending: number;
  cancelled: number;
  items: LogItem[];
}

interface LogItem {
  id: string;
  time: string;
  customer_name: string;
  phone: string;
  value: number;
  due_date: string;
  rule_name: string;
  status: string;
  error_message: string | null;
  sent_at: string | null;
  message_preview: string;
  customer_blocked: boolean;
  customer_paused: boolean;
}

export default function BillingQueue({ organizationId }: BillingQueueProps) {
  const [loading, setLoading] = useState(true);
  const [queue, setQueue] = useState<QueueDay[]>([]);
  const [logs, setLogs] = useState<LogDay[]>([]);
  const [integrationStatus, setIntegrationStatus] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [expandedRules, setExpandedRules] = useState<Set<string>>(new Set());
  const [daysRange, setDaysRange] = useState("7");
  const [logStatus, setLogStatus] = useState("all");
  const [logDateFrom, setLogDateFrom] = useState("");
  const [logDateTo, setLogDateTo] = useState("");
  const [activeTab, setActiveTab] = useState("queue");
  const [triggeringRule, setTriggeringRule] = useState<string | null>(null);
  const [rulesWithoutConnection, setRulesWithoutConnection] = useState<string[]>([]);

  useEffect(() => {
    loadQueue();
  }, [organizationId, daysRange]);

  useEffect(() => {
    if (activeTab === "logs") {
      loadLogs();
    }
  }, [activeTab, logStatus, logDateFrom, logDateTo]);

  const loadQueue = async () => {
    setLoading(true);
    try {
      const data = await api<any>(`/api/notifications/queue/${organizationId}?days=${daysRange}`);
      setQueue(data.queue || []);
      setIntegrationStatus(data.integration_status);
      
      // Identify rules without connection
      const noConnection: string[] = [];
      for (const day of data.queue || []) {
        for (const item of day.items) {
          if (!item.connection_name || item.connection_status !== 'connected') {
            noConnection.push(item.rule_id);
          }
        }
      }
      setRulesWithoutConnection([...new Set(noConnection)]);
      
      // Auto-expand first day
      if (data.queue?.length > 0) {
        setExpandedDays(new Set([data.queue[0].date]));
      }
    } catch (err) {
      console.error('Load queue error:', err);
      toast.error("Erro ao carregar fila de cobranças");
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async () => {
    try {
      const params = new URLSearchParams();
      if (logStatus !== 'all') params.set('status', logStatus);
      if (logDateFrom) params.set('from_date', logDateFrom);
      if (logDateTo) params.set('to_date', logDateTo);
      
      const data = await api<any>(`/api/notifications/logs/${organizationId}?${params.toString()}`);
      setLogs(data.logs || []);
      setSummary(data.summary);
    } catch (err) {
      console.error('Load logs error:', err);
      toast.error("Erro ao carregar logs");
    }
  };

  const toggleDay = (date: string) => {
    const newExpanded = new Set(expandedDays);
    if (newExpanded.has(date)) {
      newExpanded.delete(date);
    } else {
      newExpanded.add(date);
    }
    setExpandedDays(newExpanded);
  };

  const toggleRule = (key: string) => {
    const newExpanded = new Set(expandedRules);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedRules(newExpanded);
  };

  const formatCurrency = (value: number) => {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const triggerManualSend = async (ruleId: string, ruleName: string, hasConnection: boolean) => {
    if (!hasConnection) {
      toast.error(`A regra "${ruleName}" não tem conexão WhatsApp configurada. Configure uma conexão antes de disparar.`);
      return;
    }
    
    setTriggeringRule(ruleId);
    try {
      const result = await api<{ success: boolean; sent: number; failed: number; total: number; error?: string }>(
        `/api/notifications/trigger/${organizationId}/${ruleId}`,
        { method: 'POST' }
      );
      
      if (result.success) {
        toast.success(`Disparo concluído: ${result.sent} enviados, ${result.failed} falhas de ${result.total} total`);
        loadQueue();
        if (activeTab === 'logs') loadLogs();
      } else {
        toast.error(result.error || 'Erro ao disparar notificações');
      }
    } catch (err: any) {
      const errorMsg = err?.message || 'Erro desconhecido';
      if (errorMsg.includes('conexão')) {
        toast.error(`Regra sem conexão configurada. Vá em "Regras" e associe uma conexão WhatsApp.`);
      } else {
        toast.error(`Erro ao disparar: ${errorMsg}`);
      }
    } finally {
      setTriggeringRule(null);
    }
  };

  const getTriggerLabel = (type: string, offset: number) => {
    if (type === 'before_due') return `${Math.abs(offset)} dias antes`;
    if (type === 'on_due') return 'No vencimento';
    if (type === 'after_due') return `${Math.abs(offset)} dias depois`;
    return type;
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { class: string; icon: any; label: string }> = {
      sent: { class: "bg-green-500/10 text-green-500 border-green-500/20", icon: CheckCircle, label: "Enviado" },
      failed: { class: "bg-red-500/10 text-red-500 border-red-500/20", icon: XCircle, label: "Falhou" },
      pending: { class: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20", icon: Clock, label: "Pendente" },
      cancelled: { class: "bg-muted text-muted-foreground border-muted", icon: Ban, label: "Cancelado" }
    };
    const v = variants[status] || variants.pending;
    const Icon = v.icon;
    return (
      <Badge variant="outline" className={v.class}>
        <Icon className="h-3 w-3 mr-1" />
        {v.label}
      </Badge>
    );
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status Banner */}
      {integrationStatus && (
        <Card className={integrationStatus.billing_paused ? "border-yellow-500/50 bg-yellow-500/5" : ""}>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {integrationStatus.billing_paused ? (
                  <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">
                    <Pause className="h-3 w-3 mr-1" />
                    Cobranças Pausadas
                    {integrationStatus.billing_paused_until && (
                      <span className="ml-1">
                        até {format(parseISO(integrationStatus.billing_paused_until), "dd/MM")}
                      </span>
                    )}
                  </Badge>
                ) : integrationStatus.is_active ? (
                  <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Sistema Ativo
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20">
                    <XCircle className="h-3 w-3 mr-1" />
                    Integração Inativa
                  </Badge>
                )}
                <span className="text-sm text-muted-foreground">
                  Limite diário: {integrationStatus.daily_limit} msgs/cliente
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={loadQueue}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Atualizar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="queue" className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            Fila de Envios
          </TabsTrigger>
          <TabsTrigger value="logs" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Logs de Execução
          </TabsTrigger>
        </TabsList>

        {/* Queue Tab */}
        <TabsContent value="queue" className="space-y-4">
          {/* Summary Cards - Volume por dia */}
          {queue.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              {queue.slice(0, 7).map((day) => {
                const totalMessages = day.items.reduce((sum, item) => sum + item.payments_count, 0);
                const totalValue = day.items.reduce((sum, item) => sum + item.total_value, 0);
                const isToday = day.date === new Date().toISOString().split('T')[0];
                const hasConnectionIssue = day.items.some(item => !item.connection_name || item.connection_status !== 'connected');
                
                return (
                  <Card 
                    key={day.date} 
                    className={`cursor-pointer transition-all hover:shadow-md ${
                      isToday ? 'border-primary bg-primary/5' : ''
                    } ${hasConnectionIssue ? 'border-yellow-500/50' : ''}`}
                    onClick={() => {
                      if (!expandedDays.has(day.date)) {
                        setExpandedDays(new Set([...expandedDays, day.date]));
                      }
                      // Scroll to day
                      document.getElementById(`day-${day.date}`)?.scrollIntoView({ behavior: 'smooth' });
                    }}
                  >
                    <CardContent className="p-3">
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground font-medium">
                          {format(parseISO(day.date), "EEE", { locale: ptBR }).toUpperCase()}
                        </p>
                        <p className={`text-lg font-bold ${isToday ? 'text-primary' : ''}`}>
                          {format(parseISO(day.date), "dd/MM")}
                        </p>
                        <div className="mt-1 space-y-0.5">
                          <Badge variant={totalMessages > 0 ? "default" : "secondary"} className="text-xs">
                            <MessageSquare className="h-3 w-3 mr-1" />
                            {totalMessages}
                          </Badge>
                          <p className="text-xs font-medium text-green-600">
                            {formatCurrency(totalValue)}
                          </p>
                        </div>
                        {hasConnectionIssue && (
                          <AlertCircle className="h-3 w-3 text-yellow-500 mx-auto mt-1" />
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Alert for rules without connection */}
          {rulesWithoutConnection.length > 0 && (
            <Alert variant="destructive">
              <TriangleAlert className="h-4 w-4" />
              <AlertTitle>Atenção: Regras sem conexão</AlertTitle>
              <AlertDescription>
                Existem {rulesWithoutConnection.length} regra(s) sem conexão WhatsApp configurada. 
                As notificações dessas regras <strong>não serão enviadas</strong>. 
                Acesse a aba "Regras" para configurar a conexão.
              </AlertDescription>
            </Alert>
          )}
          
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <ListChecks className="h-5 w-5" />
                    Próximos Envios Programados
                  </CardTitle>
                  <CardDescription>
                    Visualize as cobranças que serão enviadas nos próximos dias
                  </CardDescription>
                </div>
                <Select value={daysRange} onValueChange={setDaysRange}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">3 dias</SelectItem>
                    <SelectItem value="7">7 dias</SelectItem>
                    <SelectItem value="14">14 dias</SelectItem>
                    <SelectItem value="30">30 dias</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {queue.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Nenhum envio programado para os próximos {daysRange} dias</p>
                  <p className="text-sm mt-1">Verifique se há regras ativas e cobranças pendentes</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {queue.map((day) => (
                    <Collapsible
                      key={day.date}
                      open={expandedDays.has(day.date)}
                      onOpenChange={() => toggleDay(day.date)}
                    >
                      <div id={`day-${day.date}`}>
                        <CollapsibleTrigger asChild>
                        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted transition-colors">
                          <div className="flex items-center gap-3">
                            {expandedDays.has(day.date) ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                            <Calendar className="h-4 w-4 text-primary" />
                            <div>
                              <span className="font-medium">
                                {format(parseISO(day.date), "EEEE, dd 'de' MMMM", { locale: ptBR })}
                              </span>
                              {day.date === new Date().toISOString().split('T')[0] && (
                                <Badge variant="secondary" className="ml-2">Hoje</Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <Badge variant="outline">
                              {day.items.reduce((sum, item) => sum + item.payments_count, 0)} cobranças
                            </Badge>
                            <span className="text-sm font-medium text-primary">
                              {formatCurrency(day.items.reduce((sum, item) => sum + item.total_value, 0))}
                            </span>
                          </div>
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-2 space-y-2 pl-4">
                        {day.items.map((item, idx) => (
                          <Collapsible
                            key={`${day.date}-${item.rule_id}`}
                            open={expandedRules.has(`${day.date}-${item.rule_id}`)}
                            onOpenChange={() => toggleRule(`${day.date}-${item.rule_id}`)}
                          >
                            <CollapsibleTrigger asChild>
                              <div className="flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:bg-muted/30 transition-colors">
                                <div className="flex items-center gap-3">
                                  {expandedRules.has(`${day.date}-${item.rule_id}`) ? (
                                    <ChevronDown className="h-4 w-4" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4" />
                                  )}
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium">{item.rule_name}</span>
                                      <Badge variant="secondary" className="text-xs">
                                        {getTriggerLabel(item.trigger_type, item.days_offset)}
                                      </Badge>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                                      <Clock className="h-3 w-3" />
                                      {item.send_time}
                                      <span className="mx-1">•</span>
                                      <MessageSquare className="h-3 w-3" />
                                      {item.connection_name || 'Sem conexão'}
                                      {item.connection_status !== 'connected' && (
                                        <Badge variant="destructive" className="text-xs">Desconectado</Badge>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3">
                                  <Badge>{item.payments_count} clientes</Badge>
                                  <span className="font-medium">{formatCurrency(item.total_value)}</span>
                                  <Button
                                    size="sm"
                                    variant={item.connection_name && item.connection_status === 'connected' ? "default" : "outline"}
                                    disabled={triggeringRule === item.rule_id || !item.connection_name}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      triggerManualSend(item.rule_id, item.rule_name, !!item.connection_name && item.connection_status === 'connected');
                                    }}
                                    title={!item.connection_name ? 'Configure uma conexão primeiro' : 'Disparar agora'}
                                  >
                                    {triggeringRule === item.rule_id ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <Play className="h-3 w-3" />
                                    )}
                                    <span className="ml-1">Disparar</span>
                                  </Button>
                                </div>
                              </div>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="mt-2 ml-6">
                              <ScrollArea className="h-[200px]">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Cliente</TableHead>
                                      <TableHead>Telefone</TableHead>
                                      <TableHead>Valor</TableHead>
                                      <TableHead>Vencimento</TableHead>
                                      <TableHead>Descrição</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {item.payments.map((payment) => (
                                      <TableRow key={payment.id}>
                                        <TableCell className="font-medium">{payment.customer_name}</TableCell>
                                        <TableCell>
                                          <span className="flex items-center gap-1">
                                            <Phone className="h-3 w-3" />
                                            {payment.customer_phone}
                                          </span>
                                        </TableCell>
                                        <TableCell>{formatCurrency(payment.value)}</TableCell>
                                        <TableCell>{format(parseISO(payment.due_date), "dd/MM/yyyy")}</TableCell>
                                        <TableCell className="max-w-[200px] truncate">
                                          {payment.description || '-'}
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </ScrollArea>
                            </CollapsibleContent>
                          </Collapsible>
                        ))}
                      </CollapsibleContent>
                      </div>
                    </Collapsible>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Logs Tab */}
        <TabsContent value="logs" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Histórico de Execuções
                  </CardTitle>
                  <CardDescription>
                    Log detalhado de envios com erros e status
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={logDateFrom}
                    onChange={(e) => setLogDateFrom(e.target.value)}
                    className="w-[140px]"
                    placeholder="De"
                  />
                  <Input
                    type="date"
                    value={logDateTo}
                    onChange={(e) => setLogDateTo(e.target.value)}
                    className="w-[140px]"
                    placeholder="Até"
                  />
                  <Select value={logStatus} onValueChange={setLogStatus}>
                    <SelectTrigger className="w-[130px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="sent">Enviados</SelectItem>
                      <SelectItem value="failed">Falhou</SelectItem>
                      <SelectItem value="pending">Pendente</SelectItem>
                      <SelectItem value="cancelled">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="icon" onClick={loadLogs}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Summary Cards */}
              {summary && (
                <div className="grid grid-cols-4 gap-4 mb-4">
                  <Card className="bg-muted/30">
                    <CardContent className="p-3">
                      <div className="text-2xl font-bold">{summary.total}</div>
                      <div className="text-sm text-muted-foreground">Total</div>
                    </CardContent>
                  </Card>
                  <Card className="bg-green-500/10 border-green-500/20">
                    <CardContent className="p-3">
                      <div className="text-2xl font-bold text-green-500">{summary.sent}</div>
                      <div className="text-sm text-muted-foreground">Enviados</div>
                    </CardContent>
                  </Card>
                  <Card className="bg-red-500/10 border-red-500/20">
                    <CardContent className="p-3">
                      <div className="text-2xl font-bold text-red-500">{summary.failed}</div>
                      <div className="text-sm text-muted-foreground">Falhas</div>
                    </CardContent>
                  </Card>
                  <Card className="bg-yellow-500/10 border-yellow-500/20">
                    <CardContent className="p-3">
                      <div className="text-2xl font-bold text-yellow-500">{summary.pending}</div>
                      <div className="text-sm text-muted-foreground">Pendentes</div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {logs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Nenhum registro encontrado</p>
                  <p className="text-sm mt-1">Ajuste os filtros ou aguarde as execuções</p>
                </div>
              ) : (
                <ScrollArea className="h-[500px]">
                  <div className="space-y-4">
                    {logs.map((day) => (
                      <div key={day.date} className="border rounded-lg overflow-hidden">
                        <div className="bg-muted/50 p-3 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            <span className="font-medium">
                              {format(parseISO(day.date), "dd/MM/yyyy (EEEE)", { locale: ptBR })}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="bg-green-500/10 text-green-500">
                              {day.sent} enviados
                            </Badge>
                            {day.failed > 0 && (
                              <Badge variant="outline" className="bg-red-500/10 text-red-500">
                                {day.failed} falhas
                              </Badge>
                            )}
                          </div>
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[80px]">Hora</TableHead>
                              <TableHead>Cliente</TableHead>
                              <TableHead>Telefone</TableHead>
                              <TableHead>Valor</TableHead>
                              <TableHead>Regra</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Erro</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {day.items.map((item) => (
                              <TableRow key={item.id} className={item.status === 'failed' ? 'bg-red-500/5' : ''}>
                                <TableCell className="font-mono text-sm">{item.time}</TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    {item.customer_name}
                                    {item.customer_blocked && (
                                      <span title="Bloqueado"><Ban className="h-3 w-3 text-red-500" /></span>
                                    )}
                                    {item.customer_paused && (
                                      <span title="Pausado"><Pause className="h-3 w-3 text-yellow-500" /></span>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell>{item.phone}</TableCell>
                                <TableCell>{formatCurrency(item.value)}</TableCell>
                                <TableCell className="text-sm">{item.rule_name}</TableCell>
                                <TableCell>{getStatusBadge(item.status)}</TableCell>
                                <TableCell className="max-w-[200px]">
                                  {item.error_message ? (
                                    <span className="text-sm text-red-500 truncate block" title={item.error_message}>
                                      {item.error_message}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
