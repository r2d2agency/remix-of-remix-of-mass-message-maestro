import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { 
  RefreshCw, Clock, CheckCircle, AlertCircle, 
  Play, Loader2, Sun, Moon, Zap, Link2, AlertTriangle,
  Database, Cloud, ArrowRight
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface AutoSyncSettings {
  auto_sync_enabled: boolean;
  sync_time_morning: string;
  check_time_morning: string;
  last_sync_at: string | null;
  last_check_at: string | null;
}

interface SyncResult {
  success: boolean;
  synced_count?: number;
  synced_this_batch?: number;
  checked_count?: number;
  updated_count?: number;
  has_more?: boolean;
  next_offset?: number | null;
  progress?: number;
  totals?: {
    asaas: { pending: number; overdue: number; customers: number };
    database: { pending: number; overdue: number; customers: number };
  };
  message?: string;
  error?: string;
}

interface WebhookStatus {
  webhook_url: string;
  local_stats: {
    total: number;
    processed: number;
    pending: number;
    last_event: string | null;
  };
  asaas_status: {
    configured: boolean;
    enabled?: boolean;
    interrupted?: boolean;
    events?: string[];
  } | null;
}

interface SyncStatusPanelProps {
  organizationId: string;
  onSyncComplete?: () => void;
}

export default function SyncStatusPanel({ organizationId, onSyncComplete }: SyncStatusPanelProps) {
  const [settings, setSettings] = useState<AutoSyncSettings | null>(null);
  const [webhookStatus, setWebhookStatus] = useState<WebhookStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [configuringWebhook, setConfiguringWebhook] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncMessage, setSyncMessage] = useState("");
  const [currentOffset, setCurrentOffset] = useState(0);
  const [syncTotals, setSyncTotals] = useState<SyncResult['totals'] | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      const [settingsData, webhookData] = await Promise.all([
        api<AutoSyncSettings>(`/api/asaas/auto-sync/${organizationId}`),
        api<WebhookStatus>(`/api/asaas/webhook-status/${organizationId}`).catch(() => null)
      ]);
      setSettings(settingsData);
      setWebhookStatus(webhookData);
    } catch (err) {
      console.error("Error loading auto-sync settings:", err);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleToggleAutoSync = async () => {
    if (!settings) return;
    
    try {
      const updated = await api<AutoSyncSettings>(`/api/asaas/auto-sync/${organizationId}`, {
        method: "PATCH",
        body: { auto_sync_enabled: !settings.auto_sync_enabled }
      });
      setSettings(updated);
      toast.success(updated.auto_sync_enabled ? "Sincronização automática ativada" : "Sincronização automática desativada");
    } catch (err) {
      toast.error("Erro ao atualizar configurações");
    }
  };

  const handleConfigureWebhook = async () => {
    setConfiguringWebhook(true);
    try {
      const result = await api<{ success: boolean; webhook_url: string; message: string }>(
        `/api/asaas/configure-webhook/${organizationId}`,
        { method: "POST" }
      );
      
      if (result.success) {
        toast.success(result.message);
        await loadSettings();
      } else {
        toast.error("Erro ao configurar webhook");
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao configurar webhook");
    } finally {
      setConfiguringWebhook(false);
    }
  };

  const handleFullSync = async (offset = 0) => {
    setSyncing(true);
    if (offset === 0) {
      setSyncProgress(5);
      setSyncMessage("Iniciando sincronização completa...");
      setSyncTotals(null);
    }
    
    try {
      const result = await api<SyncResult>(`/api/asaas/auto-sync/${organizationId}/full-sync`, {
        method: "POST",
        body: { sync_type: 'all', batch_size: 500, offset }
      });
      
      if (result.success) {
        setSyncProgress(result.progress || 50);
        setSyncTotals(result.totals || null);
        
        if (result.has_more && result.next_offset !== null) {
          // Continue syncing
          setSyncMessage(`Sincronizados ${result.synced_this_batch} neste lote. Progresso: ${result.progress}%`);
          setCurrentOffset(result.next_offset);
          
          // Small delay then continue
          await new Promise(r => setTimeout(r, 500));
          await handleFullSync(result.next_offset);
        } else {
          // Done!
          setSyncProgress(100);
          setSyncMessage(`✓ Sincronização completa!`);
          toast.success("Sincronização completa!");
          await loadSettings();
          onSyncComplete?.();
          
          setTimeout(() => {
            setSyncProgress(0);
            setSyncMessage("");
            setSyncing(false);
            setCurrentOffset(0);
          }, 3000);
        }
      } else {
        setSyncMessage(`✗ ${result.error || "Erro na sincronização"}`);
        toast.error(result.error || "Erro na sincronização");
        setSyncing(false);
      }
    } catch (err: any) {
      setSyncProgress(0);
      setSyncMessage(`✗ ${err.message || "Erro na sincronização"}`);
      toast.error(err.message || "Erro ao sincronizar");
      setSyncing(false);
    }
  };

  const handleQuickSync = async () => {
    setSyncing(true);
    setSyncProgress(10);
    setSyncMessage("Sincronizando boletos de hoje/amanhã/vencidos...");
    
    try {
      setSyncProgress(30);
      
      const result = await api<SyncResult>(`/api/asaas/auto-sync/${organizationId}/sync-now`, {
        method: "POST"
      });
      
      setSyncProgress(100);
      
      if (result.success) {
        setSyncMessage(`✓ ${result.synced_count || 0} boletos sincronizados`);
        toast.success(result.message || "Sincronização concluída!");
        await loadSettings();
        onSyncComplete?.();
      } else {
        setSyncMessage(`✗ ${result.error || "Erro na sincronização"}`);
        toast.error(result.error || "Erro na sincronização");
      }
    } catch (err: any) {
      setSyncProgress(0);
      setSyncMessage("");
      toast.error(err.message || "Erro ao sincronizar");
    } finally {
      setSyncing(false);
      setTimeout(() => {
        setSyncProgress(0);
        setSyncMessage("");
      }, 3000);
    }
  };

  const handleCheckStatus = async () => {
    setChecking(true);
    setSyncProgress(10);
    setSyncMessage("Verificando pagamentos...");
    
    try {
      setSyncProgress(50);
      setSyncMessage("Consultando status no Asaas...");
      
      const result = await api<SyncResult>(`/api/asaas/auto-sync/${organizationId}/check-status`, {
        method: "POST"
      });
      
      setSyncProgress(100);
      
      if (result.success) {
        setSyncMessage(`✓ ${result.checked_count || 0} verificados, ${result.updated_count || 0} atualizados`);
        toast.success(result.message || "Verificação concluída!");
        await loadSettings();
        onSyncComplete?.();
      } else {
        setSyncMessage(`✗ ${result.error || "Erro na verificação"}`);
        toast.error(result.error || "Erro na verificação");
      }
    } catch (err: any) {
      setSyncProgress(0);
      setSyncMessage("");
      toast.error(err.message || "Erro ao verificar status");
    } finally {
      setChecking(false);
      setTimeout(() => {
        setSyncProgress(0);
        setSyncMessage("");
      }, 3000);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const isProcessing = syncing || checking;
  const webhookOk = webhookStatus?.asaas_status?.configured && webhookStatus?.asaas_status?.enabled;

  return (
    <div className="space-y-4">
      {/* Webhook Status Card */}
      <Card className={webhookOk ? "border-green-500/30 bg-green-500/5" : "border-amber-500/30 bg-amber-500/5"}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Link2 className="h-4 w-4" />
                Webhook Asaas
              </CardTitle>
              <CardDescription className="text-xs">
                Receba atualizações de pagamentos em tempo real
              </CardDescription>
            </div>
            {webhookOk ? (
              <Badge variant="outline" className="border-green-500 text-green-600 gap-1">
                <CheckCircle className="h-3 w-3" />
                Ativo
              </Badge>
            ) : (
              <Badge variant="outline" className="border-amber-500 text-amber-600 gap-1">
                <AlertTriangle className="h-3 w-3" />
                Não configurado
              </Badge>
            )}
          </div>
        </CardHeader>
        
        <CardContent className="space-y-3">
          {webhookStatus?.local_stats && webhookStatus.local_stats.total > 0 && (
            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">Últimos 7 dias:</span>
              <span className="font-medium">{webhookStatus.local_stats.processed} eventos processados</span>
              {webhookStatus.local_stats.last_event && (
                <span className="text-muted-foreground text-xs">
                  Último: {format(parseISO(webhookStatus.local_stats.last_event), "dd/MM HH:mm", { locale: ptBR })}
                </span>
              )}
            </div>
          )}
          
          {!webhookOk && (
            <div className="flex items-center gap-3">
              <p className="text-sm text-muted-foreground flex-1">
                Configure o webhook para sincronizar automaticamente quando pagamentos forem criados ou pagos.
              </p>
              <Button 
                size="sm" 
                onClick={handleConfigureWebhook}
                disabled={configuringWebhook}
              >
                {configuringWebhook ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Link2 className="h-4 w-4 mr-2" />
                )}
                Configurar Webhook
              </Button>
            </div>
          )}
          
          {webhookStatus?.webhook_url && webhookOk && (
            <div className="text-xs text-muted-foreground font-mono bg-muted/50 p-2 rounded truncate">
              {webhookStatus.webhook_url}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sync Status Card */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <RefreshCw className="h-5 w-5 text-primary" />
                Sincronização Manual
              </CardTitle>
              <CardDescription>
                Sincronize cobranças do Asaas ou atualize status de pagamentos
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="auto-sync" className="text-sm">
                Auto-sync {settings?.auto_sync_enabled ? "ativo" : "inativo"}
              </Label>
              <Switch 
                id="auto-sync"
                checked={settings?.auto_sync_enabled || false}
                onCheckedChange={handleToggleAutoSync}
              />
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* Scheduled times */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <div className="p-2 rounded-full bg-indigo-500/10">
                <Moon className="h-4 w-4 text-indigo-500" />
              </div>
              <div>
                <p className="text-sm font-medium">Sync Automático</p>
                <p className="text-xs text-muted-foreground">
                  {settings?.sync_time_morning || "02:00"} diariamente
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <div className="p-2 rounded-full bg-amber-500/10">
                <Sun className="h-4 w-4 text-amber-500" />
              </div>
              <div>
                <p className="text-sm font-medium">Verificar Status</p>
                <p className="text-xs text-muted-foreground">
                  {settings?.check_time_morning || "08:00"} diariamente
                </p>
              </div>
            </div>
          </div>

          {/* Last execution */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-1">
              <p className="text-muted-foreground">Última sincronização:</p>
              <p className="font-medium flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {settings?.last_sync_at 
                  ? format(parseISO(settings.last_sync_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                  : "Nunca executado"
                }
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground">Última verificação:</p>
              <p className="font-medium flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {settings?.last_check_at 
                  ? format(parseISO(settings.last_check_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                  : "Nunca executado"
                }
              </p>
            </div>
          </div>

          <Separator />

          {/* Sync totals during sync */}
          {syncing && syncTotals && (
            <div className="grid grid-cols-2 gap-4 p-3 rounded-lg bg-muted/30">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Cloud className="h-4 w-4" />
                  Asaas
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <span>Pendentes: <strong>{syncTotals.asaas.pending}</strong></span>
                  <span>Vencidos: <strong>{syncTotals.asaas.overdue}</strong></span>
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Database className="h-4 w-4" />
                  Banco de Dados
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <span>Pendentes: <strong>{syncTotals.database.pending}</strong></span>
                  <span>Vencidos: <strong>{syncTotals.database.overdue}</strong></span>
                </div>
              </div>
            </div>
          )}

          {/* Progress */}
          {isProcessing && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{syncMessage}</span>
                <span className="font-medium">{syncProgress}%</span>
              </div>
              <Progress value={syncProgress} className="h-2" />
            </div>
          )}

          {/* Result message */}
          {!isProcessing && syncMessage && (
            <div className={`p-3 rounded-lg text-sm ${syncMessage.startsWith("✓") ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600"}`}>
              {syncMessage}
            </div>
          )}

          {/* Action buttons */}
          <div className="grid grid-cols-3 gap-2">
            <Button 
              onClick={handleQuickSync} 
              disabled={isProcessing}
              variant="outline"
              size="sm"
            >
              {syncing && !syncTotals ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Zap className="mr-2 h-4 w-4" />
              )}
              Sync Rápido
            </Button>
            
            <Button 
              onClick={() => handleFullSync(0)} 
              disabled={isProcessing}
              variant="default"
              size="sm"
            >
              {syncing && syncTotals ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Sync Completo
            </Button>
            
            <Button 
              onClick={handleCheckStatus} 
              disabled={isProcessing}
              variant="outline"
              size="sm"
            >
              {checking ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              Verificar Pagtos
            </Button>
          </div>

          {/* Info */}
          <div className="text-xs text-muted-foreground space-y-1 pt-2">
            <p><strong>Sync Rápido:</strong> Busca boletos de hoje, amanhã e vencidos (mais rápido).</p>
            <p><strong>Sync Completo:</strong> Sincroniza todos pendentes e vencidos em lotes de 500.</p>
            <p><strong>Verificar Pagtos:</strong> Atualiza status de cobranças pendentes/vencidas.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
