import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { api, API_URL } from "@/lib/api";
import { uazapiApi } from "@/lib/uazapi-api";
import { toast } from "sonner";
import {
  Loader2,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Activity,
  Link,
  Server,
  Webhook,
  MessageSquare,
  Trash2,
  ExternalLink,
  Copy,
  Play,
  Radio,
  Database,
  Eye,
} from "lucide-react";

interface Connection {
  id: string;
  name: string;
  provider?: 'evolution' | 'wapi' | 'uazapi';
  instance_name: string;
  instance_id?: string;
  status: string;
  phone_number?: string;
}

interface DiagnosticResult {
  connection: {
    id: string;
    name: string;
    instanceName: string;
    status: string;
    webhookUrl: string | null;
  };
  evolutionApi: {
    configured: boolean;
    url: string;
  };
  webhookBase: {
    configured: boolean;
    url: string;
    expectedEndpoint: string;
  };
  lastWebhookReceived: {
    at: string;
    event: string | null;
    dataKeys: string[];
  } | null;
  evolutionWebhook: {
    url: string | null;
    enabled: boolean;
    events: string[];
    webhookBase64: boolean | null;
  } | null;
  instanceStatus: {
    state: string;
    phoneNumber: string | null;
  } | null;
  webhookReachability?: {
    url: string;
    reachable: boolean;
    status?: number;
    error?: string;
  };
  healthy: boolean;
  errors: string[];
}

interface WapiDiagnosticResult {
  connection: {
    id: string;
    name: string;
    instanceId: string;
    status: string;
    provider: string;
  };
  instanceStatus: {
    connected: boolean;
    phoneNumber: string | null;
    error?: string;
  } | null;
  webhooksConfigured: {
    success: boolean;
    configured: number;
    total: number;
    results: Array<{
      type: string;
      success: boolean;
      status?: number;
      error?: string;
    }>;
  } | null;
  webhookEndpoint: string;
  healthy: boolean;
  errors: string[];
}

interface WebhookEvent {
  at: string;
  instanceName: string | null;
  event: string | null;
  normalizedEvent: string | null;
  headers: Record<string, string>;
  preview: string;
}

interface WapiWebhookEvent {
  at: string;
  connectionId: string | null;
  instanceId: string | null;
  eventType: string | null;
  headers: Record<string, string>;
  preview: string;
}

interface WapiSendAttempt {
  at: string;
  instanceId: string;
  phone: string;
  messageType: string;
  success: boolean;
  status: number;
  error?: string;
  preview?: string;
}

interface AuditEntry {
  id: string;
  provider: string;
  event_id: string | null;
  event_type: string | null;
  remote_jid: string | null;
  instance_id: string | null;
  from_me: boolean;
  processed: boolean;
  process_result: string | null;
  process_error: string | null;
  received_at: string;
}

interface AuditSummary {
  total: string;
  processed: string;
  errors: string;
  skipped: string;
}

interface Props {
  connection: Connection;
  onClose?: () => void;
}

export function WebhookDiagnosticPanel({ connection, onClose }: Props) {
  // Detect provider explicitly. UAZAPI takes priority when explicitly marked.
  const isUazapi = connection.provider === 'uazapi';
  // W-API: explicit provider OR has instance_id (and not UAZAPI)
  const isWapi = !isUazapi && (
    connection.provider === 'wapi' ||
    (!!connection.instance_id && connection.instance_id.length > 0)
  );

  const [loading, setLoading] = useState(true);
  const [reconfiguring, setReconfiguring] = useState(false);
  const [diagnostic, setDiagnostic] = useState<DiagnosticResult | null>(null);
  const [wapiDiagnostic, setWapiDiagnostic] = useState<WapiDiagnosticResult | null>(null);

  // UAZAPI state
  const [uazWebhook, setUazWebhook] = useState<{
    expectedUrl: string;
    registeredUrl: string | null;
    enabled: boolean | null;
    events: string[];
    matches: boolean;
    ok: boolean;
  } | null>(null);
  const [uazEvents, setUazEvents] = useState<any[]>([]);
  const [uazStatus, setUazStatus] = useState<{ status: string; phoneNumber?: string } | null>(null);

  // Evolution webhook events (persisted on backend)
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  // W-API diagnostics (in-memory on backend)
  const [wapiEvents, setWapiEvents] = useState<WapiWebhookEvent[]>([]);
  const [wapiEventsLoading, setWapiEventsLoading] = useState(false);
  const [wapiSendAttempts, setWapiSendAttempts] = useState<WapiSendAttempt[]>([]);
  const [wapiSendAttemptsLoading, setWapiSendAttemptsLoading] = useState(false);

  // Webhook Audit (persisted in DB)
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditSummary, setAuditSummary] = useState<AuditSummary | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditFilter, setAuditFilter] = useState<string>('all'); // 'all', 'processed', 'errors', 'skipped'
  const [auditDetail, setAuditDetail] = useState<any>(null);

  const fetchUazDiagnostic = useCallback(async () => {
    try {
      const [st, wh, ev] = await Promise.all([
        uazapiApi.status(connection.id).catch(() => null),
        uazapiApi.webhookStatus(connection.id).catch((e) => ({ error: e?.message })),
        uazapiApi.webhookEvents(connection.id).catch(() => ({ events: [] })),
      ]);
      if (st) setUazStatus({ status: st.status, phoneNumber: st.phoneNumber });
      if (wh && !('error' in wh)) {
        setUazWebhook({
          expectedUrl: (wh as any).expectedUrl,
          registeredUrl: (wh as any).registeredUrl,
          enabled: (wh as any).enabled,
          events: (wh as any).events || [],
          matches: (wh as any).matches,
          ok: (wh as any).ok,
        });
      }
      setUazEvents((ev as any).events || []);
    } catch (e: any) {
      console.error('UAZAPI diagnostic error', e);
    }
  }, [connection.id]);

  const fetchDiagnostic = useCallback(async () => {
    setLoading(true);
    try {
      if (isUazapi) {
        await fetchUazDiagnostic();
        setDiagnostic(null);
        setWapiDiagnostic(null);
      } else if (isWapi) {
        // For W-API, we check status and webhook configuration
        const statusResult = await api<{
          status: string;
          phoneNumber?: string | null;
          provider?: string;
          error?: string | null;
        }>(`/api/evolution/${connection.id}/status`);

        const webhookEndpoint = `${API_URL}/api/wapi/webhook`;
        const errors: string[] = [];

        if (statusResult.status !== 'connected') {
          errors.push('Instância não conectada');
          if (statusResult.error) errors.push(`Detalhe: ${statusResult.error}`);
        }

        const wapiDiag: WapiDiagnosticResult = {
          connection: {
            id: connection.id,
            name: connection.name,
            instanceId: connection.instance_id || '',
            status: statusResult.status,
            provider: 'wapi',
          },
          instanceStatus: {
            connected: statusResult.status === 'connected',
            phoneNumber: statusResult.phoneNumber || null,
            error: statusResult.error || undefined,
          },
          webhooksConfigured: null,
          webhookEndpoint,
          healthy: statusResult.status === 'connected',
          errors,
        };
        
        setWapiDiagnostic(wapiDiag);
        setDiagnostic(null);
      } else {
        const result = await api<DiagnosticResult>(`/api/evolution/${connection.id}/webhook-diagnostic`);
        setDiagnostic(result);
        setWapiDiagnostic(null);
      }
    } catch (error: any) {
      toast.error(error.message || "Erro ao carregar diagnóstico");
      
      if (isWapi) {
        setWapiDiagnostic({
          connection: {
            id: connection.id,
            name: connection.name,
            instanceId: connection.instance_id || '',
            status: 'error',
            provider: 'wapi',
          },
          instanceStatus: null,
          webhooksConfigured: null,
          webhookEndpoint: `${API_URL}/api/wapi/webhook`,
          healthy: false,
          errors: [error.message || 'Erro ao verificar status'],
        });
      }
    } finally {
      setLoading(false);
    }
  }, [connection.id, connection.name, connection.instance_id, isWapi, isUazapi, fetchUazDiagnostic]);

  const fetchEvents = useCallback(async () => {
    if (isWapi) return; // Evolution only

    setEventsLoading(true);
    try {
      const result = await api<{ events: WebhookEvent[] }>(`/api/evolution/${connection.id}/webhook-events?limit=100`);
      setEvents(result.events || []);
    } catch (error: any) {
      console.error("Error fetching events:", error);
    } finally {
      setEventsLoading(false);
    }
  }, [connection.id, isWapi]);

  const fetchWapiEvents = useCallback(async () => {
    if (!isWapi) return;

    setWapiEventsLoading(true);
    try {
      const result = await api<{ events: WapiWebhookEvent[] }>(`/api/wapi/${connection.id}/webhook-events?limit=200`);
      setWapiEvents(result.events || []);
    } catch (error: any) {
      console.error('Error fetching W-API events:', error);
    } finally {
      setWapiEventsLoading(false);
    }
  }, [connection.id, isWapi]);

  const fetchAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const providerPath = isWapi ? 'wapi' : 'evolution';
      let processedParam = '';
      if (auditFilter === 'processed') processedParam = '&processed=true';
      else if (auditFilter === 'errors') processedParam = '&processed=false';
      
      const result = await api<{ audit: AuditEntry[]; summary: AuditSummary }>(
        `/api/${providerPath}/${connection.id}/webhook-audit?limit=100${processedParam}`
      );
      setAuditEntries(result.audit || []);
      setAuditSummary(result.summary || null);
    } catch (error: any) {
      console.error('Error fetching audit:', error);
    } finally {
      setAuditLoading(false);
    }
  }, [connection.id, isWapi, auditFilter]);

  const fetchAuditDetail = useCallback(async (auditId: string) => {
    try {
      const providerPath = isWapi ? 'wapi' : 'evolution';
      const result = await api<any>(`/api/${providerPath}/${connection.id}/webhook-audit/${auditId}`);
      setAuditDetail(result);
    } catch (error: any) {
      toast.error('Erro ao carregar detalhe');
    }
  }, [connection.id, isWapi]);

  const fetchWapiSendAttempts = useCallback(async () => {
    if (!isWapi) return;

    setWapiSendAttemptsLoading(true);
    try {
      const result = await api<{ attempts: WapiSendAttempt[] }>(`/api/wapi/${connection.id}/send-attempts?limit=200`);
      setWapiSendAttempts(result.attempts || []);
    } catch (error: any) {
      console.error('Error fetching W-API send attempts:', error);
    } finally {
      setWapiSendAttemptsLoading(false);
    }
  }, [connection.id, isWapi]);

  const handleReconfigure = async () => {
    setReconfiguring(true);
    try {
      if (isUazapi) {
        const result = await uazapiApi.reconfigureWebhook(connection.id);
        if (result.ok) toast.success("Webhook UAZAPI configurado!");
        else toast.error("Falha ao configurar webhook UAZAPI");
      } else if (isWapi) {
        const result = await api<{ success: boolean; message?: string; configured?: number; total?: number }>(
          `/api/connections/${connection.id}/configure-webhooks`,
          { method: "POST" }
        );
        if (result.success) {
          toast.success(result.message || `Webhooks configurados: ${result.configured}/${result.total}`);
        } else {
          toast.error(result.message || 'Falha ao configurar webhooks');
        }
      } else {
        await api(`/api/evolution/${connection.id}/reconfigure-webhook`, { method: "POST" });
        toast.success("Webhook reconfigurado com sucesso!");
      }
      await fetchDiagnostic();
    } catch (error: any) {
      toast.error(error.message || "Erro ao reconfigurar");
    } finally {
      setReconfiguring(false);
    }
  };

  const handleClearUazEvents = async () => {
    try {
      await uazapiApi.clearWebhookEvents(connection.id);
      setUazEvents([]);
      toast.success("Eventos UAZAPI limpos");
    } catch (error: any) {
      toast.error(error.message || "Erro ao limpar eventos");
    }
  };

  const handleClearEvents = async () => {
    try {
      await api(`/api/evolution/${connection.id}/webhook-events`, { method: "DELETE" });
      setEvents([]);
      toast.success("Eventos limpos");
    } catch (error: any) {
      toast.error(error.message || "Erro ao limpar eventos");
    }
  };

  const handleClearWapiEvents = async () => {
    try {
      await api(`/api/wapi/${connection.id}/webhook-events`, { method: 'DELETE' });
      setWapiEvents([]);
      toast.success('Eventos W-API limpos');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao limpar eventos W-API');
    }
  };

  const handleClearWapiSendAttempts = async () => {
    try {
      await api(`/api/wapi/${connection.id}/send-attempts`, { method: 'DELETE' });
      setWapiSendAttempts([]);
      toast.success('Tentativas de envio limpas');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao limpar tentativas de envio');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiado!");
  };

  useEffect(() => {
    fetchDiagnostic();
    if (isUazapi) {
      // UAZAPI: only its own diagnostic + events (already fetched inside fetchDiagnostic)
      return;
    }
    fetchAudit();
    if (isWapi) {
      fetchWapiEvents();
      fetchWapiSendAttempts();
    } else {
      fetchEvents();
    }
  }, [fetchDiagnostic, fetchEvents, fetchWapiEvents, fetchWapiSendAttempts, fetchAudit, isWapi, isUazapi]);

  // Auto-refresh every 3 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (isUazapi) {
        fetchUazDiagnostic();
      } else if (isWapi) {
        fetchWapiEvents();
        fetchWapiSendAttempts();
      } else {
        fetchEvents();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [fetchEvents, fetchWapiEvents, fetchWapiSendAttempts, fetchUazDiagnostic, isWapi, isUazapi]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const StatusIcon = ({ ok }: { ok: boolean }) =>
    ok ? (
      <CheckCircle className="h-4 w-4 text-green-500" />
    ) : (
      <XCircle className="h-4 w-4 text-destructive" />
    );

  // UAZAPI Diagnostic View
  if (isUazapi) {
    const connected = uazStatus?.status === 'connected';
    const webhookOk = !!uazWebhook?.matches;
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Radio className="h-5 w-5 text-primary" />
              Diagnóstico UAZAPI: {connection.name}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Provedor: <Badge variant="outline">UAZAPI</Badge>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchDiagnostic} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
            {onClose && (
              <Button variant="ghost" size="sm" onClick={onClose}>
                Fechar
              </Button>
            )}
          </div>
        </div>

        {/* Health */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              {connected && webhookOk ? (
                <Badge className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" /> Tudo OK</Badge>
              ) : (
                <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" /> Verificar configuração</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <StatusIcon ok={connected} />
              <span className="text-muted-foreground">Instância:</span>
              <Badge variant={connected ? "default" : "outline"} className={connected ? "bg-green-500" : ""}>
                {uazStatus?.status || 'desconhecido'}
              </Badge>
            </div>
            <div>
              <span className="text-muted-foreground">Telefone:</span>
              <span className="ml-2">{uazStatus?.phoneNumber || "—"}</span>
            </div>
          </CardContent>
        </Card>

        {/* Webhook config */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Webhook className="h-4 w-4" />
              Webhook na UAZAPI
            </CardTitle>
            <CardDescription>
              Estado do webhook registrado no servidor UAZAPI para esta instância
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <StatusIcon ok={!!uazWebhook?.registeredUrl} />
              <span className="text-muted-foreground">URL registrada:</span>
              {uazWebhook?.registeredUrl ? (
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded break-all">{uazWebhook.registeredUrl}</code>
              ) : (
                <span className="text-destructive">Nenhuma</span>
              )}
              {uazWebhook?.registeredUrl && (
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => copyToClipboard(uazWebhook.registeredUrl!)}>
                  <Copy className="h-3 w-3" />
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <StatusIcon ok={uazWebhook?.enabled !== false} />
              <span className="text-muted-foreground">Ativo:</span>
              <span>{uazWebhook?.enabled === false ? 'Não' : uazWebhook?.enabled ? 'Sim' : '—'}</span>
            </div>
            <div className="flex items-center gap-2">
              <StatusIcon ok={webhookOk} />
              <span className="text-muted-foreground">URL esperada:</span>
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded break-all">{uazWebhook?.expectedUrl || '—'}</code>
            </div>
            {uazWebhook?.events && uazWebhook.events.length > 0 && (
              <div>
                <div className="text-muted-foreground mb-1">Eventos inscritos:</div>
                <div className="flex flex-wrap gap-1">
                  {uazWebhook.events.map((ev, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">{ev}</Badge>
                  ))}
                </div>
              </div>
            )}
            <div className="pt-2">
              <Button onClick={handleReconfigure} disabled={reconfiguring} size="sm">
                {reconfiguring ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Webhook className="h-4 w-4 mr-2" />}
                {webhookOk ? 'Reconfigurar webhook' : 'Criar/Configurar webhook'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Events log */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Logs UAZAPI ({uazEvents.length})
              </CardTitle>
              <CardDescription>Últimos eventos recebidos do webhook UAZAPI</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={handleClearUazEvents} disabled={uazEvents.length === 0}>
              <Trash2 className="h-3 w-3 mr-1" /> Limpar
            </Button>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[360px] pr-2">
              {uazEvents.length === 0 ? (
                <div className="text-sm text-muted-foreground py-6 text-center">
                  Nenhum evento ainda. Eventos aparecem quando o webhook recebe dados da UAZAPI.
                </div>
              ) : (
                <div className="space-y-2">
                  {uazEvents.map((ev) => (
                    <div key={ev.id} className="border rounded p-2 text-xs space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={ev.status === 'failed' ? 'destructive' : 'secondary'} className="text-[10px]">
                          {ev.event_type || 'evento'}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">{ev.status}</Badge>
                        <span className="text-muted-foreground ml-auto">
                          {new Date(ev.created_at).toLocaleString()}
                        </span>
                      </div>
                      {ev.error && <div className="text-destructive">{ev.error}</div>}
                      <pre className="bg-muted/40 p-1.5 rounded overflow-x-auto text-[10px] max-h-32">
                        {JSON.stringify(ev.payload, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    );
  }

  // W-API Diagnostic View
  if (isWapi && wapiDiagnostic) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Radio className="h-5 w-5 text-primary" />
              Diagnóstico W-API: {connection.name}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Instance ID: <code className="text-xs bg-muted px-1 py-0.5 rounded">{connection.instance_id}</code>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchDiagnostic} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
            {onClose && (
              <Button variant="ghost" size="sm" onClick={onClose}>
                Fechar
              </Button>
            )}
          </div>
        </div>

        {/* Health Status */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              {wapiDiagnostic.healthy ? (
                <Badge variant="default" className="bg-green-500">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Conectado
                </Badge>
              ) : (
                <Badge variant="destructive">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Problemas Detectados
                </Badge>
              )}
              <Badge variant="outline" className="ml-2">
                <Radio className="h-3 w-3 mr-1" />
                W-API
              </Badge>
            </CardTitle>
          </CardHeader>
          {wapiDiagnostic.errors && wapiDiagnostic.errors.length > 0 && (
            <CardContent className="pt-0">
              <div className="space-y-2">
                {wapiDiagnostic.errors.map((err, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-destructive">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <span>{err}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>

        {/* Instance Status */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Server className="h-4 w-4" />
              Estado da Instância W-API
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <StatusIcon ok={wapiDiagnostic.instanceStatus?.connected || false} />
                <span className="text-muted-foreground">Status:</span>
                <Badge
                  variant={wapiDiagnostic.instanceStatus?.connected ? "default" : "outline"}
                  className={wapiDiagnostic.instanceStatus?.connected ? "bg-green-500" : ""}
                >
                  {wapiDiagnostic.instanceStatus?.connected ? "Conectado" : "Desconectado"}
                </Badge>
              </div>
              <div>
                <span className="text-muted-foreground">Telefone:</span>
                <span className="ml-2">{wapiDiagnostic.instanceStatus?.phoneNumber || "—"}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Webhook Configuration */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Webhook className="h-4 w-4" />
              Configuração de Webhooks
            </CardTitle>
            <CardDescription>
              Configure os webhooks no painel da W-API ou use o botão abaixo
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Endpoint do Backend:</span>
                <div className="flex items-center gap-1 flex-1 min-w-0">
                  <code className="text-xs bg-muted px-1 py-0.5 rounded truncate flex-1">
                    {wapiDiagnostic.webhookEndpoint}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => copyToClipboard(wapiDiagnostic.webhookEndpoint)}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>

            <div className="bg-muted/50 p-3 rounded-lg text-sm">
              <p className="font-medium mb-2">URLs para configurar no painel W-API:</p>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>• Ao receber uma mensagem: <code>{wapiDiagnostic.webhookEndpoint}</code></li>
                <li>• Ao enviar uma mensagem: <code>{wapiDiagnostic.webhookEndpoint}</code></li>
                <li>• Ao conectar: <code>{wapiDiagnostic.webhookEndpoint}</code></li>
                <li>• Ao desconectar: <code>{wapiDiagnostic.webhookEndpoint}</code></li>
              </ul>
            </div>

            <Button 
              onClick={handleReconfigure} 
              disabled={reconfiguring} 
              className="w-full"
              variant="default"
            >
              {reconfiguring ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Configurando Webhooks...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Configurar Webhooks Automaticamente
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Help Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Dicas
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>1. Se o status mostra "Desconectado", verifique se o QR code foi escaneado no painel da W-API.</p>
            <p>2. Clique em "Configurar Webhooks Automaticamente" para configurar os webhooks via API.</p>
            <p>3. Se a configuração automática falhar, configure manualmente no painel da W-API usando as URLs acima.</p>
          </CardContent>
        </Card>

        {/* Monitor */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Monitor (W-API)
            </CardTitle>
            <CardDescription>
              Mostra os últimos eventos de webhook recebidos pelo backend e as últimas tentativas de envio do backend para a W-API (buffer em memória).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="audit" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="audit">
                  <Database className="h-3 w-3 mr-1" />
                  Auditoria
                </TabsTrigger>
                <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
                <TabsTrigger value="envios">Envios</TabsTrigger>
              </TabsList>

              <TabsContent value="audit" className="mt-4">
                {/* Summary */}
                {auditSummary && (
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    <div className="text-center p-2 rounded bg-muted/50">
                      <div className="text-lg font-bold">{auditSummary.total}</div>
                      <div className="text-[10px] text-muted-foreground">Total (24h)</div>
                    </div>
                    <div className="text-center p-2 rounded bg-muted/50">
                      <div className="text-lg font-bold text-green-600">{auditSummary.processed}</div>
                      <div className="text-[10px] text-muted-foreground">Processados</div>
                    </div>
                    <div className="text-center p-2 rounded bg-muted/50">
                      <div className="text-lg font-bold text-destructive">{auditSummary.errors}</div>
                      <div className="text-[10px] text-muted-foreground">Erros</div>
                    </div>
                    <div className="text-center p-2 rounded bg-muted/50">
                      <div className="text-lg font-bold text-yellow-600">{auditSummary.skipped}</div>
                      <div className="text-[10px] text-muted-foreground">Ignorados</div>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-1">
                    <select
                      className="text-xs border rounded px-2 py-1 bg-background"
                      value={auditFilter}
                      onChange={(e) => setAuditFilter(e.target.value)}
                    >
                      <option value="all">Todos</option>
                      <option value="processed">Processados</option>
                      <option value="errors">Com erro</option>
                    </select>
                  </div>
                  <Button variant="outline" size="sm" onClick={fetchAudit} disabled={auditLoading}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${auditLoading ? 'animate-spin' : ''}`} />
                    Atualizar
                  </Button>
                </div>

                <ScrollArea className="h-[400px] rounded-md border border-border">
                  <div className="p-3 space-y-2">
                    {auditEntries.length === 0 ? (
                      <div className="text-sm text-muted-foreground text-center py-8">
                        Nenhum evento de auditoria encontrado.
                        <br />
                        <span className="text-xs">Os eventos serão registrados quando mensagens chegarem via webhook.</span>
                      </div>
                    ) : (
                      auditEntries.map((entry) => (
                        <div key={entry.id} className="rounded-md border border-border p-3 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-muted-foreground">
                              {new Date(entry.received_at).toLocaleString()}
                            </div>
                            <div className="flex items-center gap-1">
                              <Badge variant="outline" className="text-[10px]">
                                {entry.event_type || '?'}
                              </Badge>
                              {entry.processed ? (
                                <Badge variant="default" className="bg-green-600 text-[10px]">
                                  <CheckCircle className="h-2.5 w-2.5 mr-0.5" />
                                  OK
                                </Badge>
                              ) : entry.process_result === 'error' ? (
                                <Badge variant="destructive" className="text-[10px]">
                                  <XCircle className="h-2.5 w-2.5 mr-0.5" />
                                  Erro
                                </Badge>
                              ) : entry.process_result === 'skipped' ? (
                                <Badge variant="secondary" className="text-[10px]">
                                  Ignorado
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px]">
                                  Pendente
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="mt-1 space-y-0.5 text-muted-foreground">
                            {entry.remote_jid && (
                              <div><span className="font-medium">JID:</span> {entry.remote_jid}</div>
                            )}
                            {entry.from_me && <span className="text-primary font-medium">[Enviado por mim]</span>}
                            {entry.process_error && (
                              <div className="text-destructive">Erro: {entry.process_error}</div>
                            )}
                          </div>
                          <div className="mt-1 flex justify-end">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-[10px]"
                              onClick={() => fetchAuditDetail(entry.id)}
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              Ver payload
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>

                {/* Audit Detail Modal */}
                {auditDetail && (
                  <div className="mt-3 rounded-md border border-border p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Payload completo</span>
                      <Button variant="ghost" size="sm" onClick={() => setAuditDetail(null)}>✕</Button>
                    </div>
                    <ScrollArea className="h-[300px]">
                      <pre className="text-xs whitespace-pre-wrap break-words bg-muted/40 rounded p-2">
                        {JSON.stringify(auditDetail.payload, null, 2)}
                      </pre>
                    </ScrollArea>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="webhooks" className="mt-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="text-xs text-muted-foreground">
                    {wapiEvents.length ? `Último: ${new Date(wapiEvents[0].at).toLocaleString()}` : 'Nenhum evento ainda'}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={fetchWapiEvents} disabled={wapiEventsLoading}>
                      <RefreshCw className={`h-4 w-4 mr-2 ${wapiEventsLoading ? 'animate-spin' : ''}`} />
                      Atualizar
                    </Button>
                    <Button variant="destructive" size="sm" onClick={handleClearWapiEvents}>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Limpar
                    </Button>
                  </div>
                </div>

                <ScrollArea className="h-[320px] rounded-md border border-border">
                  <div className="p-3 space-y-3">
                    {wapiEvents.length === 0 ? (
                      <div className="text-sm text-muted-foreground">Nenhum webhook recebido ainda.</div>
                    ) : (
                      wapiEvents.map((ev, i) => (
                        <div key={i} className="rounded-md border border-border p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-xs text-muted-foreground">{new Date(ev.at).toLocaleString()}</div>
                            <Badge variant="outline">{ev.eventType || 'unknown'}</Badge>
                          </div>
                          <pre className="mt-2 text-xs whitespace-pre-wrap break-words bg-muted/40 rounded p-2">
                            {ev.preview}
                          </pre>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="envios" className="mt-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="text-xs text-muted-foreground">
                    {wapiSendAttempts.length ? `Última: ${new Date(wapiSendAttempts[0].at).toLocaleString()}` : 'Nenhuma tentativa ainda'}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={fetchWapiSendAttempts} disabled={wapiSendAttemptsLoading}>
                      <RefreshCw className={`h-4 w-4 mr-2 ${wapiSendAttemptsLoading ? 'animate-spin' : ''}`} />
                      Atualizar
                    </Button>
                    <Button variant="destructive" size="sm" onClick={handleClearWapiSendAttempts}>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Limpar
                    </Button>
                  </div>
                </div>

                <ScrollArea className="h-[320px] rounded-md border border-border">
                  <div className="p-3 space-y-3">
                    {wapiSendAttempts.length === 0 ? (
                      <div className="text-sm text-muted-foreground">Nenhuma tentativa de envio registrada ainda.</div>
                    ) : (
                      wapiSendAttempts.map((a, i) => (
                        <div key={i} className="rounded-md border border-border p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-xs text-muted-foreground">{new Date(a.at).toLocaleString()}</div>
                            <Badge variant={a.success ? 'default' : 'destructive'} className={a.success ? 'bg-green-500' : ''}>
                              {a.success ? `OK (${a.status})` : `Falha (${a.status || '—'})`}
                            </Badge>
                          </div>
                          <div className="mt-2 text-xs text-muted-foreground">
                            <span className="font-medium">Para:</span> {a.phone} · <span className="font-medium">Tipo:</span> {a.messageType}
                          </div>
                          {a.error && <div className="mt-1 text-xs text-destructive">Erro: {a.error}</div>}
                          {a.preview ? (
                            <pre className="mt-2 text-xs whitespace-pre-wrap break-words bg-muted/40 rounded p-2">
                              {a.preview}
                            </pre>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Evolution Diagnostic View (original)
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Diagnóstico: {connection.name}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Instância: <code className="text-xs bg-muted px-1 py-0.5 rounded">{connection.instance_name}</code>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchDiagnostic} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              Fechar
            </Button>
          )}
        </div>
      </div>

      {/* Health Status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            {diagnostic?.healthy ? (
              <Badge variant="default" className="bg-green-500">
                <CheckCircle className="h-3 w-3 mr-1" />
                Saudável
              </Badge>
            ) : (
              <Badge variant="destructive">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Problemas Detectados
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        {diagnostic?.errors && diagnostic.errors.length > 0 && (
          <CardContent className="pt-0">
            <div className="space-y-2">
              {diagnostic.errors.map((err, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>{err}</span>
                </div>
              ))}
            </div>
            <Button 
              onClick={handleReconfigure} 
              disabled={reconfiguring} 
              className="mt-4"
              variant="default"
            >
              {reconfiguring ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Reconfigurando...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Reconfigurar Webhook
                </>
              )}
            </Button>
          </CardContent>
        )}
      </Card>

      <Tabs defaultValue="status" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="status">Status</TabsTrigger>
          <TabsTrigger value="config">Configuração</TabsTrigger>
          <TabsTrigger value="events" className="relative">
            Eventos
            {events.length > 0 && (
              <Badge variant="secondary" className="ml-2 h-5 min-w-5 text-xs">
                {events.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="audit">
            <Database className="h-3 w-3 mr-1" />
            Auditoria
          </TabsTrigger>
        </TabsList>

        {/* Status Tab */}
        <TabsContent value="status" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Server className="h-4 w-4" />
                Estado da Instância
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Estado:</span>
                  <Badge
                    variant={diagnostic?.instanceStatus?.state === "open" ? "default" : "outline"}
                    className={`ml-2 ${diagnostic?.instanceStatus?.state === "open" ? "bg-green-500" : ""}`}
                  >
                    {diagnostic?.instanceStatus?.state || "Desconhecido"}
                  </Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">Telefone:</span>
                  <span className="ml-2">{diagnostic?.instanceStatus?.phoneNumber || "—"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Status DB:</span>
                  <span className="ml-2">{diagnostic?.connection.status || "—"}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Último Evento Recebido
              </CardTitle>
            </CardHeader>
            <CardContent>
              {diagnostic?.lastWebhookReceived ? (
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Horário:</span>
                    <code className="text-xs bg-muted px-1 py-0.5 rounded">
                      {new Date(diagnostic.lastWebhookReceived.at).toLocaleString()}
                    </code>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Evento:</span>
                    <Badge variant="secondary">{diagnostic.lastWebhookReceived.event || "—"}</Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Campos:</span>
                    <span className="ml-2 text-xs">
                      {diagnostic.lastWebhookReceived.dataKeys.join(", ") || "—"}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nenhum evento recebido ainda. Envie uma mensagem para testar.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Link className="h-4 w-4" />
                Alcançabilidade
              </CardTitle>
            </CardHeader>
            <CardContent>
              {diagnostic?.webhookReachability ? (
                <div className="flex items-center gap-2 text-sm">
                  <StatusIcon ok={diagnostic.webhookReachability.reachable} />
                  <span>
                    {diagnostic.webhookReachability.reachable
                      ? `Acessível (HTTP ${diagnostic.webhookReachability.status})`
                      : `Inacessível: ${diagnostic.webhookReachability.error || "Erro desconhecido"}`}
                  </span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Teste não realizado</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Config Tab */}
        <TabsContent value="config" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Webhook className="h-4 w-4" />
                Configuração do Webhook na Evolution
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <StatusIcon ok={!!diagnostic?.evolutionWebhook?.url} />
                  <span className="text-muted-foreground">URL:</span>
                  {diagnostic?.evolutionWebhook?.url ? (
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                      <code className="text-xs bg-muted px-1 py-0.5 rounded truncate flex-1">
                        {diagnostic.evolutionWebhook.url}
                      </code>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => copyToClipboard(diagnostic.evolutionWebhook!.url!)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <span className="text-destructive">Não configurado</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <StatusIcon ok={diagnostic?.evolutionWebhook?.enabled !== false} />
                  <span className="text-muted-foreground">Habilitado:</span>
                  <span>{diagnostic?.evolutionWebhook?.enabled !== false ? "Sim" : "Não"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <StatusIcon ok={diagnostic?.evolutionWebhook?.webhookBase64 === false} />
                  <span className="text-muted-foreground">Base64:</span>
                  <span className={diagnostic?.evolutionWebhook?.webhookBase64 ? "text-yellow-500" : ""}>
                    {diagnostic?.evolutionWebhook?.webhookBase64 ? "Ativado (não recomendado)" : "Desativado ✓"}
                  </span>
                </div>
              </div>

              <Separator />

              <div>
                <span className="text-sm text-muted-foreground">Eventos configurados:</span>
                <div className="flex flex-wrap gap-1 mt-2">
                  {diagnostic?.evolutionWebhook?.events?.length ? (
                    diagnostic.evolutionWebhook.events.map((ev, i) => (
                      <Badge
                        key={i}
                        variant={ev.toLowerCase().includes("messages") ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {ev}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-sm text-destructive">Nenhum evento configurado</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Server className="h-4 w-4" />
                Configuração do Backend
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <StatusIcon ok={diagnostic?.evolutionApi?.configured || false} />
                <span className="text-muted-foreground">Evolution API:</span>
                <code className="text-xs bg-muted px-1 py-0.5 rounded">
                  {diagnostic?.evolutionApi?.url || "NÃO CONFIGURADO"}
                </code>
              </div>
              <div className="flex items-center gap-2">
                <StatusIcon ok={diagnostic?.webhookBase?.configured || false} />
                <span className="text-muted-foreground">Webhook Base URL:</span>
                <code className="text-xs bg-muted px-1 py-0.5 rounded">
                  {diagnostic?.webhookBase?.url || "NÃO CONFIGURADO"}
                </code>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Endpoint esperado:</span>
                <code className="text-xs bg-muted px-1 py-0.5 rounded">
                  {diagnostic?.webhookBase?.expectedEndpoint || "—"}
                </code>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Events Tab */}
        <TabsContent value="events" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Últimos eventos recebidos (atualização automática a cada 3s)
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={fetchEvents} disabled={eventsLoading}>
                {eventsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
              <Button variant="destructive" size="sm" onClick={handleClearEvents}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <ScrollArea className="h-[400px] rounded-md border">
            <div className="p-3 space-y-3">
              {events.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Nenhum evento recebido ainda.</p>
                  <p className="text-xs mt-1">Envie uma mensagem no WhatsApp para testar.</p>
                </div>
              ) : (
                events.map((ev, idx) => (
                  <Card key={idx} className="border-border">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <Badge
                          variant={
                            ev.normalizedEvent?.includes("messages.upsert")
                              ? "default"
                              : ev.normalizedEvent?.includes("connection")
                              ? "secondary"
                              : "outline"
                          }
                        >
                          {ev.normalizedEvent || ev.event || "evento"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(ev.at).toLocaleString()}
                        </span>
                      </div>
                      {ev.preview && (
                        <ScrollArea className="h-24">
                          <pre className="text-xs text-foreground/80 whitespace-pre-wrap break-all">
                            {ev.preview.length > 500 ? ev.preview.substring(0, 500) + "..." : ev.preview}
                          </pre>
                        </ScrollArea>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Audit Tab */}
        <TabsContent value="audit" className="mt-4 space-y-4">
          {auditSummary && (
            <div className="grid grid-cols-4 gap-2">
              <div className="text-center p-2 rounded bg-muted/50">
                <div className="text-lg font-bold">{auditSummary.total}</div>
                <div className="text-[10px] text-muted-foreground">Total (24h)</div>
              </div>
              <div className="text-center p-2 rounded bg-muted/50">
                <div className="text-lg font-bold text-green-600">{auditSummary.processed}</div>
                <div className="text-[10px] text-muted-foreground">Processados</div>
              </div>
              <div className="text-center p-2 rounded bg-muted/50">
                <div className="text-lg font-bold text-destructive">{auditSummary.errors}</div>
                <div className="text-[10px] text-muted-foreground">Erros</div>
              </div>
              <div className="text-center p-2 rounded bg-muted/50">
                <div className="text-lg font-bold text-yellow-600">{auditSummary.skipped}</div>
                <div className="text-[10px] text-muted-foreground">Ignorados</div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <select
              className="text-xs border rounded px-2 py-1 bg-background"
              value={auditFilter}
              onChange={(e) => setAuditFilter(e.target.value)}
            >
              <option value="all">Todos</option>
              <option value="processed">Processados</option>
              <option value="errors">Com erro</option>
            </select>
            <Button variant="outline" size="sm" onClick={fetchAudit} disabled={auditLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${auditLoading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
          </div>

          <ScrollArea className="h-[400px] rounded-md border border-border">
            <div className="p-3 space-y-2">
              {auditEntries.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-8">
                  Nenhum evento de auditoria encontrado.
                </div>
              ) : (
                auditEntries.map((entry) => (
                  <div key={entry.id} className="rounded-md border border-border p-3 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-muted-foreground">
                        {new Date(entry.received_at).toLocaleString()}
                      </div>
                      <div className="flex items-center gap-1">
                        <Badge variant="outline" className="text-[10px]">
                          {entry.event_type || '?'}
                        </Badge>
                        {entry.processed ? (
                          <Badge variant="default" className="bg-green-600 text-[10px]">OK</Badge>
                        ) : entry.process_result === 'error' ? (
                          <Badge variant="destructive" className="text-[10px]">Erro</Badge>
                        ) : entry.process_result === 'skipped' ? (
                          <Badge variant="secondary" className="text-[10px]">Ignorado</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">Pendente</Badge>
                        )}
                      </div>
                    </div>
                    <div className="mt-1 text-muted-foreground">
                      {entry.remote_jid && <div>JID: {entry.remote_jid}</div>}
                      {entry.process_error && <div className="text-destructive">Erro: {entry.process_error}</div>}
                    </div>
                    <div className="mt-1 flex justify-end">
                      <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => fetchAuditDetail(entry.id)}>
                        <Eye className="h-3 w-3 mr-1" /> Ver payload
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          {auditDetail && (
            <div className="rounded-md border border-border p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Payload completo</span>
                <Button variant="ghost" size="sm" onClick={() => setAuditDetail(null)}>✕</Button>
              </div>
              <ScrollArea className="h-[300px]">
                <pre className="text-xs whitespace-pre-wrap break-words bg-muted/40 rounded p-2">
                  {JSON.stringify(auditDetail.payload, null, 2)}
                </pre>
              </ScrollArea>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
