import { useState, useEffect, useCallback } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, QrCode, RefreshCw, Plug, Unplug, Trash2, Phone, Loader2, Wifi, WifiOff, Send, Settings2, AlertTriangle, CheckCircle, Eye, Activity, Radio, Users, Download, Pencil, UserCheck, Smartphone, Key, FileWarning, ArrowRightLeft } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { uazapiApi } from "@/lib/uazapi-api";
import { toast } from "sonner";
import { TestMessageDialog } from "@/components/conexao/TestMessageDialog";
import { WebhookDiagnosticPanel } from "@/components/conexao/WebhookDiagnosticPanel";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { LeadDistributionDialog } from "@/components/conexao/LeadDistributionDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Connection {
  id: string;
  name: string;
  provider?: 'evolution' | 'wapi' | 'uazapi';
  instance_name: string;
  instance_id?: string;
  uazapi_token?: string;
  uazapi_instance_name?: string;
  uazapi_server_url?: string;
  status: string;
  phone_number?: string;
  show_groups?: boolean;
  created_at: string;
}

interface PlanLimits {
  max_connections: number;
  current_connections: number;
  plan_name: string;
}

const Conexao = () => {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newConnectionName, setNewConnectionName] = useState("");
  const [newConnectionProvider, setNewConnectionProvider] = useState<'evolution' | 'wapi' | 'uazapi'>('uazapi');
  const [uazapiAvailable, setUazapiAvailable] = useState(false);
  const [newConnectionInstanceId, setNewConnectionInstanceId] = useState("");
  const [newConnectionWapiToken, setNewConnectionWapiToken] = useState("");
  const [newConnectionApiUrl, setNewConnectionApiUrl] = useState("");
  const [newConnectionApiKey, setNewConnectionApiKey] = useState("");
  const [planLimits, setPlanLimits] = useState<PlanLimits | null>(null);
  
  // QR Code state
  const [qrCodeDialog, setQrCodeDialog] = useState(false);
  const [selectedConnection, setSelectedConnection] = useState<Connection | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState<string | null>(null);
  
  // Test message state
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testConnection, setTestConnection] = useState<Connection | null>(null);
  
  // Webhook diagnostic state
  const [diagLoading, setDiagLoading] = useState<string | null>(null);
  const [diagResults, setDiagResults] = useState<Record<string, any>>({});

  // W-API webhook config state
  const [configuringWapiWebhooks, setConfiguringWapiWebhooks] = useState<string | null>(null);
  
  // W-API contact sync state
  const [syncingContacts, setSyncingContacts] = useState<string | null>(null);

  // Webhook viewer state (shows what the backend is actually receiving)
  const [webhookViewerOpen, setWebhookViewerOpen] = useState(false);
  const [webhookViewerConnection, setWebhookViewerConnection] = useState<Connection | null>(null);
  const [webhookEventsLoading, setWebhookEventsLoading] = useState(false);
  const [webhookEventsError, setWebhookEventsError] = useState<string | null>(null);
  const [webhookEvents, setWebhookEvents] = useState<any[]>([]);
  
  // Diagnostic panel state (full panel view)
  const [diagnosticPanelOpen, setDiagnosticPanelOpen] = useState(false);
  
  // Edit connection state (W-API)
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingConnection, setEditingConnection] = useState<Connection | null>(null);
  const [editName, setEditName] = useState("");
  const [editInstanceId, setEditInstanceId] = useState("");
  const [editWapiToken, setEditWapiToken] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [diagnosticConnection, setDiagnosticConnection] = useState<Connection | null>(null);

  // Migrate conversations state
  const [migrateDialogOpen, setMigrateDialogOpen] = useState(false);
  const [migrateFromConnection, setMigrateFromConnection] = useState<Connection | null>(null);
  const [migrateToConnectionId, setMigrateToConnectionId] = useState<string>("");
  const [migrateConfirmText, setMigrateConfirmText] = useState("");
  const [migrating, setMigrating] = useState(false);

  // Lead distribution state
  const [leadDistributionDialogOpen, setLeadDistributionDialogOpen] = useState(false);
  const [leadDistributionConnection, setLeadDistributionConnection] = useState<Connection | null>(null);

  // Phone code pairing state
  const [phoneCodeNumber, setPhoneCodeNumber] = useState("");
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [loadingPairingCode, setLoadingPairingCode] = useState(false);

  // Error logs state
  const [errorLogsOpen, setErrorLogsOpen] = useState(false);
  const [errorLogs, setErrorLogs] = useState<any[]>([]);
  const [errorLogsLoading, setErrorLogsLoading] = useState(false);
  // W-API Integrator token state (read-only, managed by superadmin)
  const [hasIntegratorToken, setHasIntegratorToken] = useState(false);

  useEffect(() => {
    loadConnections();
    loadPlanLimits();
    loadIntegratorToken();
    loadUazapiInfo();
  }, []);

  const loadUazapiInfo = async () => {
    try {
      const info = await uazapiApi.serverInfo();
      setUazapiAvailable(!!info.available);
      if (info.available) setNewConnectionProvider('uazapi');
    } catch {
      setUazapiAvailable(false);
    }
  };

  const loadConnections = async () => {
    try {
      const data = await api<Connection[]>('/api/connections');
      setConnections(data);
    } catch (error) {
      console.error('Error loading connections:', error);
      toast.error('Erro ao carregar conexões');
    } finally {
      setLoading(false);
    }
  };

  const loadIntegratorToken = async () => {
    try {
      const data = await api<{ token: string | null }>('/api/connections/wapi-integrator/token');
      setHasIntegratorToken(!!data.token);
    } catch (error) {
      console.error('Error loading integrator token:', error);
    }
  };

  const loadErrorLogs = async (connectionId?: string) => {
    setErrorLogsLoading(true);
    try {
      const url = connectionId 
        ? `/api/connections/error-logs?connection_id=${connectionId}&limit=50`
        : '/api/connections/error-logs?limit=50';
      const data = await api<any[]>(url);
      setErrorLogs(data);
    } catch (error) {
      console.error('Error loading error logs:', error);
      setErrorLogs([]);
    } finally {
      setErrorLogsLoading(false);
    }
  };

  const loadPlanLimits = async () => {
    try {
      const data = await api<PlanLimits>('/api/evolution/limits');
      setPlanLimits(data);
    } catch (error) {
      console.error('Error loading plan limits:', error);
    }
  };

  const resetCreateForm = () => {
    setNewConnectionName('');
    setNewConnectionProvider(uazapiAvailable ? 'uazapi' : 'evolution');
    setNewConnectionInstanceId('');
    setNewConnectionWapiToken('');
    setNewConnectionApiUrl('');
    setNewConnectionApiKey('');
  };

  const handleCreateConnection = async () => {
    if (!newConnectionName.trim()) {
      toast.error('Digite um nome para a conexão');
      return;
    }

    if (newConnectionProvider === 'wapi' && !hasIntegratorToken) {
      // Manual mode: need instanceId and token
      if (!newConnectionInstanceId.trim() || !newConnectionWapiToken.trim()) {
        toast.error('Configure o token do integrador ou forneça Instance ID e Token manualmente');
        return;
      }
    }

    setCreating(true);
    try {
      let result: Connection & { qrCode?: string };

      if (newConnectionProvider === 'uazapi') {
        // Create instance via UAZAPI global server
        result = await uazapiApi.createInstance(newConnectionName) as any;
        toast.success('Instância UAZAPI criada!');
        
        // Immediately try to configure webhook and activate settings for UAZAPI
        try {
          console.log('Configuring UAZAPI webhook for new instance:', result.id);
          // 1. Configure Webhook
          const webhookResult = await uazapiApi.reconfigureWebhook(result.id);
          console.log('Webhook configuration result:', webhookResult);
          
          if (webhookResult.ok) {
            toast.success('Webhook configurado com sucesso!');
          } else {
            console.warn('Webhook response was not OK:', webhookResult);
          }
        } catch (e) {
          console.error('Failed to configure UAZAPI webhook:', e);
          toast.error('Erro ao configurar webhook automaticamente. Você pode tentar reconfigurar nas opções da conexão.');
        }

        // Wait a small moment for instance to settle before getting QR
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Immediately fetch QR
        try {
          const qr = await uazapiApi.connect(result.id);
          if (qr.qrcode) {
            setSelectedConnection(result);
            setQrCode(qr.qrcode);
            setQrCodeDialog(true);
          } else if (qr.success) {
            // If already connected or pairing, just show the dialog
            setSelectedConnection(result);
            setQrCodeDialog(true);
          }
        } catch (e) {
          console.warn('Could not fetch UAZAPI QR right away', e);
        }
      } else if (newConnectionProvider === 'wapi') {
        if (hasIntegratorToken) {
          // Create via Integrator API (automatic)
          result = await api<Connection>('/api/connections/wapi-integrator/create-instance', {
            method: 'POST',
            body: { instanceName: newConnectionName },
          });
          toast.success('Instância W-API criada automaticamente!');
        } else {
          // Manual mode
          result = await api<Connection>('/api/connections', {
            method: 'POST',
            body: {
              provider: 'wapi',
              name: newConnectionName,
              instance_id: newConnectionInstanceId,
              wapi_token: newConnectionWapiToken,
            },
          });
          toast.success('Conexão W-API criada com sucesso!');
        }
      } else {
        // Create Evolution API connection
        result = await api<Connection & { qrCode?: string }>('/api/evolution/create', {
          method: 'POST',
          body: { name: newConnectionName },
        });
        
        if (result.qrCode) {
          setSelectedConnection(result);
          setQrCode(result.qrCode);
          setQrCodeDialog(true);
        }
        toast.success('Conexão criada! Escaneie o QR Code.');
      }

      setConnections(prev => [...prev, result]);
      setShowCreateDialog(false);
      resetCreateForm();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao criar conexão');
    } finally {
      setCreating(false);
    }
  };

const isUazapi = (c: Connection) => c.provider === 'uazapi' || !!c.uazapi_token;
const isWapiConn = (c: Connection) => c.provider === 'wapi' || (!!c.instance_id && !c.uazapi_token);

const handleGetQRCode = async (connection: Connection) => {
  setSelectedConnection(connection);
  setQrCodeDialog(true);
  setLoadingQr(true);
  setQrCode(null);

  try {
    if (isUazapi(connection)) {
      const r = await uazapiApi.connect(connection.id);
      setQrCode(r.qrcode || null);
      if (!r.qrcode) toast.info('Aguardando QR Code do UAZAPI...');
    } else {
      const result = await api<{ qrCode: string }>(`/api/evolution/${connection.id}/qrcode`);
      setQrCode(result.qrCode);
    }
  } catch (error: any) {
    toast.error(error?.message || 'Erro ao buscar QR Code');
  } finally {
    setLoadingQr(false);
  }
};

  const handleRefreshQRCode = async () => {
    if (!selectedConnection) return;
    
    setLoadingQr(true);
    try {
      if (isUazapi(selectedConnection)) {
        const r = await uazapiApi.connect(selectedConnection.id);
        setQrCode(r.qrcode || null);
        toast.success('QR Code atualizado!');
      } else {
        const result = await api<{ qrCode: string; success?: boolean }>(`/api/evolution/${selectedConnection.id}/restart`, {
          method: 'POST',
        });
        setQrCode(result.qrCode);
        toast.success('QR Code atualizado!');
      }
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao atualizar QR Code');
    } finally {
      setLoadingQr(false);
    }
  };

  const handleCheckStatus = async (connection: Connection) => {
    setCheckingStatus(connection.id);
    try {
      let status: string;
      let phoneNumber: string | undefined;

      if (isUazapi(connection)) {
        const r = await uazapiApi.status(connection.id);
        status = r.status;
        phoneNumber = r.phoneNumber;
      } else {
        const result = await api<{ status: string; phoneNumber?: string }>(`/api/evolution/${connection.id}/status`);
        status = result.status;
        phoneNumber = result.phoneNumber;
      }
      
      setConnections(prev => prev.map(c => 
        c.id === connection.id 
          ? { ...c, status, phone_number: phoneNumber } 
          : c
      ));

      if (status === 'connected') {
        toast.success(`Conectado: ${phoneNumber || 'WhatsApp'}`);
        setQrCodeDialog(false);
        setQrCode(null);
      } else {
        toast.info('Aguardando conexão...');
      }
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao verificar status');
    } finally {
      setCheckingStatus(null);
    }
  };

  const handleLogout = async (connection: Connection) => {
    try {
      if (isUazapi(connection)) {
        await uazapiApi.disconnect(connection.id);
      } else {
        await api(`/api/evolution/${connection.id}/logout`, { method: 'POST' });
      }
      
      setConnections(prev => prev.map(c => 
        c.id === connection.id 
          ? { ...c, status: 'disconnected', phone_number: undefined } 
          : c
      ));
      
      toast.success('Desconectado com sucesso');
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao desconectar');
    }
  };

  const handleDelete = async (connection: Connection) => {
    try {
      let deleteUrl: string;
      if (isUazapi(connection)) {
        // Use the native UAZAPI remove method which calls the backend DELETE /api/uazapi/:id
        // which in turn should call UAZAPI delete instance endpoint
        await uazapiApi.remove(connection.id);
      } else if (isWapiConn(connection)) {
        deleteUrl = `/api/connections/${connection.id}`;
        await api(deleteUrl, { method: 'DELETE' });
      } else {
        deleteUrl = `/api/evolution/${connection.id}`;
        await api(deleteUrl, { method: 'DELETE' });
      }
      
      setConnections(prev => prev.filter(c => c.id !== connection.id));
      toast.success('Conexão excluída com sucesso');
    } catch (error: any) {
      console.error('Error deleting connection:', error);
      toast.error(error?.message || 'Erro ao excluir conexão');
    }
  };

  const handleWebhookDiagnostic = async (connection: Connection) => {
    setDiagLoading(connection.id);
    try {
      const result = await api<any>(`/api/evolution/${connection.id}/webhook-diagnostic`);
      setDiagResults(prev => ({ ...prev, [connection.id]: result }));
      
      if (result.healthy) {
        toast.success('Webhook está saudável!');
      } else if (result.errors?.length > 0) {
        toast.warning(`Problemas encontrados: ${result.errors.length}`);
      }
    } catch (error: any) {
      toast.error('Erro ao diagnosticar webhook');
      setDiagResults(prev => ({ ...prev, [connection.id]: { error: error.message } }));
    } finally {
      setDiagLoading(null);
    }
  };

  const handleReconfigureWebhook = async (connection: Connection) => {
    setDiagLoading(connection.id);
    try {
      await api(`/api/evolution/${connection.id}/reconfigure-webhook`, { method: 'POST' });
      toast.success('Webhook reconfigurado!');
      // Re-run diagnostic
      await handleWebhookDiagnostic(connection);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao reconfigurar webhook');
    } finally {
      setDiagLoading(null);
    }
  };

  const handleConfigureWapiWebhooks = async (connection: Connection) => {
    const isWapi = connection.provider === 'wapi' || !!connection.instance_id;

    if (!isWapi) {
      toast.info('Esta ação é apenas para conexões W-API');
      return;
    }

    setConfiguringWapiWebhooks(connection.id);
    try {
      const result = await api<{ success: boolean; message?: string }>(
        `/api/connections/${connection.id}/configure-webhooks`,
        { method: 'POST' }
      );

      if (result.success) {
        toast.success(result.message || 'Webhooks configurados com sucesso');
      } else {
        toast.error(result.message || 'Falha ao configurar webhooks');
      }
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao configurar webhooks');
    } finally {
      setConfiguringWapiWebhooks(null);
    }
  };

  const handleSyncWapiContacts = async (connection: Connection) => {
    const isWapi = connection.provider === 'wapi' || !!connection.instance_id;

    if (!isWapi) {
      toast.info('Esta ação é apenas para conexões W-API');
      return;
    }

    if (connection.status !== 'connected') {
      toast.warning('A conexão precisa estar conectada para sincronizar contatos');
      return;
    }

    setSyncingContacts(connection.id);
    try {
      const result = await api<{ 
        success: boolean; 
        total: number; 
        imported: number; 
        updated: number; 
        skipped: number;
        error?: string;
      }>(`/api/wapi/${connection.id}/sync-contacts`, { method: 'POST' });

      if (result.success) {
        toast.success(
          `Sincronização concluída! ${result.imported} novos, ${result.updated} atualizados, ${result.skipped} ignorados (Total: ${result.total})`
        );
      } else {
        toast.error(result.error || 'Erro ao sincronizar contatos');
      }
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao sincronizar contatos');
    } finally {
      setSyncingContacts(null);
    }
  };

  const handleOpenEditDialog = (connection: Connection) => {
    setEditingConnection(connection);
    setEditName(connection.name);
    setEditInstanceId(connection.instance_id || '');
    setEditWapiToken(''); // Don't show existing token for security
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingConnection) return;
    
    if (!editName.trim()) {
      toast.error('Digite um nome para a conexão');
      return;
    }

    const isWapi = editingConnection.provider === 'wapi' || !!editingConnection.instance_id;
    
    if (isWapi && !editInstanceId.trim()) {
      toast.error('Instance ID é obrigatório');
      return;
    }

    setSavingEdit(true);
    try {
      const body: Record<string, string> = { name: editName };
      
      if (isWapi) {
        body.instance_id = editInstanceId;
        if (editWapiToken.trim()) {
          body.wapi_token = editWapiToken;
        }
      }

      await api(`/api/connections/${editingConnection.id}`, {
        method: 'PATCH',
        body,
      });

      setConnections(prev => prev.map(c => 
        c.id === editingConnection.id 
          ? { ...c, name: editName, instance_id: editInstanceId } 
          : c
      ));

      toast.success('Conexão atualizada!');
      setEditDialogOpen(false);
      setEditingConnection(null);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao atualizar conexão');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleMigrateConversations = async () => {
    if (!migrateFromConnection || !migrateToConnectionId) return;
    if (migrateConfirmText !== migrateFromConnection.name) {
      toast.error('Digite o nome exato da conexão de origem para confirmar');
      return;
    }
    setMigrating(true);
    try {
      const result = await api<{
        success: boolean;
        summary: { merged: Record<string, number>; updated: Record<string, number>; skipped: string[] };
      }>(`/api/connection-migration/migrate`, {
        method: 'POST',
        body: {
          from_connection_id: migrateFromConnection.id,
          to_connection_id: migrateToConnectionId,
        },
      });
      const movedConvs = result.summary.updated['conversations'] || 0;
      const mergedConvs = result.summary.merged['conversations'] || 0;
      toast.success(
        `Migração concluída: ${movedConvs} conversas movidas` +
        (mergedConvs ? `, ${mergedConvs} mescladas` : '')
      );
      setMigrateDialogOpen(false);
      setMigrateFromConnection(null);
      setMigrateToConnectionId('');
      setMigrateConfirmText('');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao migrar conversas');
    } finally {
      setMigrating(false);
    }
  };

  const fetchWebhookEvents = useCallback(async (connection: Connection) => {
    setWebhookEventsLoading(true);
    setWebhookEventsError(null);
    try {
      let result;
      if (isUazapi(connection)) {
        result = await uazapiApi.webhookEvents(connection.id);
      } else {
        result = await api<{ events: any[] }>(`/api/evolution/${connection.id}/webhook-events?limit=50`);
      }
      setWebhookEvents(result.events || []);
    } catch (error: any) {
      setWebhookEventsError(error.message || 'Erro ao buscar eventos do webhook');
    } finally {
      setWebhookEventsLoading(false);
    }
  }, []);

  const handleOpenWebhookViewer = async (connection: Connection) => {
    setWebhookViewerConnection(connection);
    setWebhookViewerOpen(true);
    await fetchWebhookEvents(connection);
  };

  const handleClearWebhookEvents = async () => {
    if (!webhookViewerConnection) return;
    try {
      if (isUazapi(webhookViewerConnection)) {
        // Assume the same endpoint works with DELETE or we'll need to check
        await api(`/api/uazapi/${webhookViewerConnection.id}/webhook-events`, { method: 'DELETE' });
      } else {
        await api(`/api/evolution/${webhookViewerConnection.id}/webhook-events`, { method: 'DELETE' });
      }
      setWebhookEvents([]);
      toast.success('Eventos limpos');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao limpar eventos');
    }
  };

  useEffect(() => {
    if (!webhookViewerOpen || !webhookViewerConnection) return;

    const interval = setInterval(() => {
      fetchWebhookEvents(webhookViewerConnection);
    }, 2000);

    return () => clearInterval(interval);
  }, [webhookViewerOpen, webhookViewerConnection, fetchWebhookEvents]);

  // Auto-check status when QR dialog is open
  useEffect(() => {
    if (!qrCodeDialog || !selectedConnection) return;

    const interval = setInterval(async () => {
      try {
        let status: string;
        let phoneNumber: string | undefined;
        if (isUazapi(selectedConnection)) {
          const r = await uazapiApi.status(selectedConnection.id);
          status = r.status;
          phoneNumber = r.phoneNumber;
        } else {
          const result = await api<{ status: string; phoneNumber?: string }>(`/api/evolution/${selectedConnection.id}/status`);
          status = result.status;
          phoneNumber = result.phoneNumber;
        }
        
        if (status === 'connected') {
          setConnections(prev => prev.map(c => 
            c.id === selectedConnection.id 
              ? { ...c, status, phone_number: phoneNumber } 
              : c
          ));
          setQrCodeDialog(false);
          setQrCode(null);
          toast.success(`WhatsApp conectado: ${phoneNumber || ''}`);
          clearInterval(interval);
        }
      } catch (error) {
        // Ignore errors during polling
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [qrCodeDialog, selectedConnection]);

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between animate-slide-up">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Conexões WhatsApp</h1>
            <p className="mt-1 text-muted-foreground">
              Gerencie suas conexões com o WhatsApp
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Plan limits badge */}
            {planLimits && (
              <Badge variant="outline" className="text-sm py-1 px-3">
                {connections.length} / {planLimits.max_connections} conexões
                {planLimits.plan_name && (
                  <span className="ml-1 text-muted-foreground">({planLimits.plan_name})</span>
                )}
              </Badge>
            )}

            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <DialogTrigger asChild>
                <Button 
                  variant="gradient"
                  disabled={planLimits && connections.length >= planLimits.max_connections}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Nova Conexão
                </Button>
              </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Nova Conexão WhatsApp</DialogTitle>
                <DialogDescription>
                  Escolha o provedor e configure sua conexão.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {/* Provider Selection */}
                <div className="space-y-2">
                  <Label>Provedor</Label>
                  <Select 
                    value={newConnectionProvider} 
                    onValueChange={(value: 'evolution' | 'wapi' | 'uazapi') => setNewConnectionProvider(value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o provedor" />
                    </SelectTrigger>
                    <SelectContent>
                      {uazapiAvailable && (
                        <SelectItem value="uazapi">
                          <div className="flex items-center gap-2">
                            <Radio className="h-4 w-4" />
                            <span>UAZAPI (recomendado)</span>
                          </div>
                        </SelectItem>
                      )}
                      <SelectItem value="evolution">
                        <div className="flex items-center gap-2">
                          <Radio className="h-4 w-4" />
                          <span>Evolution API</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="wapi">
                        <div className="flex items-center gap-2">
                          <Radio className="h-4 w-4" />
                          <span>W-API</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {newConnectionProvider === 'uazapi'
                      ? 'UAZAPI: A instância é criada automaticamente no servidor configurado pelo super-admin. QR Code aberto em seguida.'
                      : newConnectionProvider === 'evolution' 
                        ? 'Evolution API: Gera QR Code para conexão' 
                        : hasIntegratorToken
                          ? 'W-API: Instância será criada automaticamente via integrador'
                          : 'W-API: Configure o token do integrador ou forneça dados manualmente'}
                  </p>
                </div>

                {/* Connection Name */}
                <div className="space-y-2">
                  <Label>Nome da Conexão</Label>
                  <Input 
                    placeholder="Ex: WhatsApp Principal"
                    value={newConnectionName}
                    onChange={(e) => setNewConnectionName(e.target.value)}
                  />
                </div>

                {/* W-API: Integrator mode or manual mode */}
                {newConnectionProvider === 'wapi' && (
                  <>
                    {hasIntegratorToken ? (
                      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-primary" />
                          <span className="text-sm font-medium">Token do Integrador configurado</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          A instância será criada automaticamente. Basta informar o nome acima.
                        </p>
                        <div className="text-xs text-muted-foreground space-y-1">
                          <p>• Rejeição de chamadas: <span className="text-foreground">Desabilitada</span></p>
                          <p>• Grupos: <span className="text-foreground">Habilitados</span></p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-yellow-500" />
                            <span className="text-sm font-medium">Token do Integrador não configurado</span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Solicite ao administrador para configurar o token no painel SuperAdmin, ou preencha os dados manualmente abaixo.
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label>Instance ID</Label>
                          <Input 
                            placeholder="Seu Instance ID da W-API"
                            value={newConnectionInstanceId}
                            onChange={(e) => setNewConnectionInstanceId(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Token</Label>
                          <Input 
                            type="password"
                            placeholder="Seu Token da W-API"
                            value={newConnectionWapiToken}
                            onChange={(e) => setNewConnectionWapiToken(e.target.value)}
                          />
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setShowCreateDialog(false); resetCreateForm(); }}>
                  Cancelar
                </Button>
                <Button onClick={handleCreateConnection} disabled={creating}>
                  {creating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Criando...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      Criar
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => { setErrorLogsOpen(true); loadErrorLogs(); }}
          >
            <FileWarning className="h-4 w-4 mr-2" />
            Log de Falhas
          </Button>
          </div>
        </div>

        {/* Connections Grid */}
        {connections.length === 0 ? (
          <Card className="animate-fade-in">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Phone className="h-16 w-16 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Nenhuma conexão
              </h3>
              <p className="text-muted-foreground text-center max-w-md mb-6">
                Crie sua primeira conexão WhatsApp para começar a enviar mensagens.
              </p>
              <Button variant="gradient" onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Criar Conexão
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {connections.map((connection) => (
              <Card key={connection.id} className="animate-fade-in shadow-card">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{connection.name}</CardTitle>
                    <Badge 
                      variant={connection.status === 'connected' ? 'default' : 'outline'}
                      className={connection.status === 'connected' ? 'bg-green-500' : ''}
                    >
                      {connection.status === 'connected' ? (
                        <><Wifi className="h-3 w-3 mr-1" /> Conectado</>
                      ) : (
                        <><WifiOff className="h-3 w-3 mr-1" /> Desconectado</>
                      )}
                    </Badge>
                  </div>
                  <CardDescription className="text-xs">
                    {(connection.provider === 'wapi' || !!connection.instance_id)
                      ? (connection.instance_id || 'W-API')
                      : (connection.instance_name || '')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Quick Status Info */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-1.5 p-2 rounded bg-muted/50">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="truncate">
                        {connection.phone_number || "Sem telefone"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 p-2 rounded bg-muted/50">
                      <Badge variant="outline" className="text-[10px] px-1.5">
                        {isUazapi(connection) ? 'UAZAPI' : isWapiConn(connection) ? 'W-API' : 'Evolution'}
                      </Badge>
                      <code className="text-[10px] truncate flex-1">
                        {(connection.provider === 'wapi' || !!connection.instance_id) 
                          ? connection.instance_id 
                          : connection.instance_name}
                      </code>
                    </div>
                  </div>

                  {/* Groups Toggle */}
                  <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/30">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Grupos</p>
                        <p className="text-xs text-muted-foreground">Receber mensagens de grupos</p>
                      </div>
                    </div>
                    <Switch
                      checked={connection.show_groups || false}
                      onCheckedChange={async (checked) => {
                        try {
                          await api(`/api/connections/${connection.id}`, {
                            method: 'PATCH',
                            body: { show_groups: checked }
                          });
                          setConnections(prev => prev.map(c => 
                            c.id === connection.id ? { ...c, show_groups: checked } : c
                          ));
                          toast.success(checked ? 'Grupos habilitados' : 'Grupos desabilitados');
                        } catch (error: any) {
                          toast.error(error.message || 'Erro ao atualizar');
                        }
                      }}
                    />
                  </div>

                  {/* Lead Distribution Button */}
                  <div 
                    className="flex items-center justify-between rounded-lg border p-3 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => {
                      setLeadDistributionConnection(connection);
                      setLeadDistributionDialogOpen(true);
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <UserCheck className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Distribuição de Leads</p>
                        <p className="text-xs text-muted-foreground">Distribuir leads automaticamente</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      Configurar
                    </Badge>
                  </div>

                  <div className="flex gap-2">
                    {connection.status === 'connected' ? (
                      <>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="flex-1"
                          onClick={() => {
                            setTestConnection(connection);
                            setTestDialogOpen(true);
                          }}
                        >
                          <Send className="h-4 w-4 mr-1" />
                          Testar
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleCheckStatus(connection)}
                          disabled={checkingStatus === connection.id}
                        >
                          {checkingStatus === connection.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                        </Button>
                        <Button 
                          variant="destructive" 
                          size="sm"
                          onClick={() => handleLogout(connection)}
                        >
                          <Unplug className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button 
                          variant="default" 
                          size="sm"
                          className="flex-1"
                          onClick={() => handleGetQRCode(connection)}
                        >
                          <QrCode className="h-4 w-4 mr-1" />
                          Conectar
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleCheckStatus(connection)}
                          disabled={checkingStatus === connection.id}
                          title="Verificar status"
                        >
                          {checkingStatus === connection.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                        </Button>
                      </>
                    )}

                    {/* Full Diagnostic Panel */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setDiagnosticConnection(connection);
                        setDiagnosticPanelOpen(true);
                      }}
                      title="Painel de diagnóstico completo"
                    >
                      <Activity className="h-4 w-4" />
                    </Button>

                    {/* W-API: Configure webhooks */}
                    {(connection.provider === 'wapi' || !!connection.instance_id) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleConfigureWapiWebhooks(connection)}
                        disabled={configuringWapiWebhooks === connection.id}
                        title="Configurar webhooks (W-API)"
                      >
                        {configuringWapiWebhooks === connection.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Settings2 className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                    
                    {/* W-API: Sync contacts */}
                    {(connection.provider === 'wapi' || !!connection.instance_id) && connection.status === 'connected' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSyncWapiContacts(connection)}
                        disabled={syncingContacts === connection.id}
                        title="Sincronizar contatos do WhatsApp"
                      >
                        {syncingContacts === connection.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                    
                    {/* Webhook Diagnostic (Evolution & UAZAPI) */}
                    {!isWapiConn(connection) && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={async () => {
                              if (isUazapi(connection)) {
                                handleOpenWebhookViewer(connection);
                              } else {
                                handleWebhookDiagnostic(connection);
                              }
                            }}
                            disabled={diagLoading === connection.id}
                          >
                            {diagLoading === connection.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : diagResults[connection.id]?.healthy ? (
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            ) : diagResults[connection.id]?.errors?.length > 0 ? (
                              <AlertTriangle className="h-4 w-4 text-yellow-500" />
                            ) : (
                              <Settings2 className="h-4 w-4" />
                            )}
                          </Button>
                        </PopoverTrigger>
                        {!isUazapi(connection) && diagResults[connection.id] && (
                          <PopoverContent className="w-80">
                            <div className="space-y-2">
                              <h4 className="font-semibold">Diagnóstico Webhook</h4>
                              <div className="text-xs space-y-1">
                                <p>Status: {diagResults[connection.id].instanceStatus?.state || 'unknown'}</p>
                                <p>URL: {diagResults[connection.id].evolutionWebhook?.url || 'Não configurado'}</p>
                                {diagResults[connection.id].errors?.map((err: string, i: number) => (
                                  <p key={i} className="text-destructive">⚠️ {err}</p>
                                ))}
                              </div>
                              {!diagResults[connection.id].healthy && (
                                <Button size="sm" onClick={() => handleReconfigureWebhook(connection)} className="w-full mt-2">
                                  Reconfigurar Webhook
                                </Button>
                              )}
                            </div>
                          </PopoverContent>
                        )}
                        {isUazapi(connection) && (
                          <PopoverContent className="w-64 p-3">
                            <div className="space-y-3">
                              <h4 className="font-semibold text-sm">Configuração UAZAPI</h4>
                              <p className="text-xs text-muted-foreground">
                                Clique para abrir o monitor de eventos ou sincronizar webhooks.
                              </p>
                              <div className="flex flex-col gap-2">
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  className="w-full justify-start"
                                  onClick={() => handleOpenWebhookViewer(connection)}
                                >
                                  <Eye className="h-4 w-4 mr-2" />
                                  Ver Logs (Webhooks)
                                </Button>
                                <Button 
                                  size="sm" 
                                  className="w-full justify-start"
                                  onClick={async () => {
                                    try {
                                      await uazapiApi.reconfigureWebhook(connection.id);
                                      toast.success("Webhook sincronizado com UAZAPI!");
                                    } catch (e: any) {
                                      toast.error("Erro ao sincronizar webhook: " + e.message);
                                    }
                                  }}
                                >
                                  <RefreshCw className="h-4 w-4 mr-2" />
                                  Sincronizar Webhook
                                </Button>
                              </div>
                            </div>
                          </PopoverContent>
                        )}
                      </Popover>
                    )}
                    
                    {/* Edit button - all connections can edit name */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenEditDialog(connection)}
                      title="Editar conexão"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>

                    {/* Migrate conversations button */}
                    {connections.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setMigrateFromConnection(connection);
                          setMigrateToConnectionId("");
                          setMigrateConfirmText("");
                          setMigrateDialogOpen(true);
                        }}
                        title="Migrar conversas para outra conexão"
                      >
                        <ArrowRightLeft className="h-4 w-4" />
                      </Button>
                    )}

                    {/* Delete button - always visible */}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle className="text-destructive flex items-center gap-2">
                            <FileWarning className="h-5 w-5" />
                            EXCLUIR CONEXÃO E APAGAR TUDO?
                          </AlertDialogTitle>
                          <AlertDialogDescription className="space-y-3">
                            <p className="font-bold text-foreground">
                              ⚠️ ATENÇÃO: Esta ação é IRREVERSÍVEL.
                            </p>
                            <p>
                              Ao excluir a conexão "<span className="font-semibold">{connection.name}</span>", você perderá o vínculo com todas as conversas e históricos vinculados a este número no sistema.
                            </p>
                            {connection.status === 'connected' && (
                              <p className="text-destructive font-medium">
                                Esta conexão está ATIVA e será interrompida imediatamente.
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground italic">
                              Tem certeza que deseja prosseguir com a exclusão definitiva?
                            </p>
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(connection)}>
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Webhook Viewer Dialog */}
        <Dialog
          open={webhookViewerOpen}
          onOpenChange={(open) => {
            setWebhookViewerOpen(open);
            if (!open) {
              setWebhookViewerConnection(null);
              setWebhookEvents([]);
              setWebhookEventsError(null);
            }
          }}
        >
          <DialogContent className="sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>Monitor do Webhook</DialogTitle>
              <DialogDescription>
                Aqui você vê os últimos eventos que o backend recebeu da {webhookViewerConnection && isUazapi(webhookViewerConnection) ? 'UAZAPI' : 'Evolution'} para esta instância.
              </DialogDescription>
            </DialogHeader>

            <div className="flex items-center justify-between gap-2">
              <div className="text-sm text-muted-foreground">
                {webhookViewerConnection ? (
                  <span>
                    Instância: <span className="text-foreground">{webhookViewerConnection.instance_name}</span>
                  </span>
                ) : (
                  'Selecione uma conexão.'
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => webhookViewerConnection && fetchWebhookEvents(webhookViewerConnection)}
                  disabled={!webhookViewerConnection || webhookEventsLoading}
                >
                  {webhookEventsLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Atualizando...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Atualizar
                    </>
                  )}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleClearWebhookEvents}
                  disabled={!webhookViewerConnection}
                >
                  Limpar
                </Button>
              </div>
            </div>

            {webhookEventsError && (
              <div className="text-sm text-destructive">{webhookEventsError}</div>
            )}

            <ScrollArea className="h-[420px] rounded-md border border-border">
              <div className="p-3 space-y-3">
                {webhookEvents.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    Nenhum evento recebido ainda.
                  </div>
                ) : (
                  webhookEvents.map((ev, idx) => (
                    <div key={idx} className="rounded-md border border-border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium text-foreground">
                          {ev.normalizedEvent || ev.event || 'evento'}
                        </div>
                        <div className="text-xs text-muted-foreground">{ev.at}</div>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        <div>Headers: {ev.headers ? Object.keys(ev.headers).filter(Boolean).join(', ') : '-'}</div>
                      </div>
                      {ev.preview && (
                        <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-foreground/90">
                          {ev.preview}
                        </pre>
                      )}
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>

        {/* QR Code Dialog */}
        <Dialog open={qrCodeDialog} onOpenChange={(open) => {
          setQrCodeDialog(open);
          if (!open) {
            setPairingCode(null);
            setPhoneCodeNumber("");
          }
        }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <QrCode className="h-5 w-5 text-primary" />
                Conectar WhatsApp
              </DialogTitle>
              <DialogDescription>
                {selectedConnection?.provider === 'wapi' || selectedConnection?.instance_id
                  ? 'Escolha o método de conexão: QR Code ou Código por Telefone.'
                  : 'Escaneie o QR Code com seu WhatsApp para conectar.'}
              </DialogDescription>
            </DialogHeader>
            
            {(selectedConnection?.provider === 'wapi' || selectedConnection?.instance_id) ? (
              <Tabs defaultValue="qrcode" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="qrcode" className="flex items-center gap-1.5">
                    <QrCode className="h-4 w-4" />
                    QR Code
                  </TabsTrigger>
                  <TabsTrigger value="phonecode" className="flex items-center gap-1.5">
                    <Smartphone className="h-4 w-4" />
                    Código por Telefone
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="qrcode">
                  <div className="flex flex-col items-center justify-center py-6">
                    {loadingQr ? (
                      <div className="flex h-64 w-64 items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/50">
                        <Loader2 className="h-12 w-12 animate-spin text-primary" />
                      </div>
                    ) : qrCode ? (
                      <div className="rounded-xl border-2 border-primary/20 bg-white p-4">
                        <img
                          src={qrCode.startsWith("data:") ? qrCode : `data:image/png;base64,${qrCode}`}
                          alt="QR Code WhatsApp"
                          className="h-64 w-64"
                        />
                      </div>
                    ) : (
                      <div className="flex h-64 w-64 items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/50">
                        <div className="text-center">
                          <QrCode className="mx-auto h-16 w-16 text-muted-foreground/50" />
                          <p className="mt-4 text-sm text-muted-foreground">
                            Clique em atualizar para gerar o QR Code
                          </p>
                        </div>
                      </div>
                    )}
                    <div className="flex gap-2 mt-4">
                      <Button variant="outline" onClick={handleRefreshQRCode} disabled={loadingQr}>
                        <RefreshCw className={`h-4 w-4 mr-2 ${loadingQr ? 'animate-spin' : ''}`} />
                        Atualizar
                      </Button>
                      {selectedConnection && (
                        <Button variant="default" onClick={() => handleCheckStatus(selectedConnection)} disabled={checkingStatus === selectedConnection.id}>
                          {checkingStatus === selectedConnection.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plug className="h-4 w-4 mr-2" />}
                          Verificar
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-4 text-center">
                      O status será verificado automaticamente a cada 5 segundos
                    </p>
                  </div>
                </TabsContent>

                <TabsContent value="phonecode">
                  <div className="flex flex-col items-center justify-center py-6 space-y-4">
                    <div className="text-center space-y-2">
                      <Smartphone className="mx-auto h-12 w-12 text-primary" />
                      <p className="text-sm text-muted-foreground">
                        Digite o número do WhatsApp para receber o código de pareamento.
                      </p>
                    </div>

                    <div className="w-full space-y-3">
                      <div className="space-y-2">
                        <Label htmlFor="phone-code-number">Número com DDD e código do país</Label>
                        <Input
                          id="phone-code-number"
                          placeholder="5511999999999"
                          value={phoneCodeNumber}
                          onChange={(e) => setPhoneCodeNumber(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Ex: 5511999999999 (Brasil = 55 + DDD + número)
                        </p>
                      </div>

                      <Button
                        className="w-full"
                        onClick={async () => {
                          if (!phoneCodeNumber.trim() || !selectedConnection) {
                            toast.error("Digite o número de telefone");
                            return;
                          }
                          setLoadingPairingCode(true);
                          setPairingCode(null);
                          try {
                            const result = await api<{ success: boolean; code?: string; error?: string }>(
                              `/api/connections/${selectedConnection.id}/pairing-code`,
                              { method: 'POST', body: { phoneNumber: phoneCodeNumber } }
                            );
                            if (result.success && result.code) {
                              setPairingCode(result.code);
                              toast.success("Código gerado! Insira no WhatsApp.");
                            } else {
                              toast.error(result.error || "Erro ao gerar código");
                            }
                          } catch (error: any) {
                            toast.error(error.message || "Erro ao gerar código de pareamento");
                          } finally {
                            setLoadingPairingCode(false);
                          }
                        }}
                        disabled={loadingPairingCode || !phoneCodeNumber.trim()}
                      >
                        {loadingPairingCode ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Gerando código...
                          </>
                        ) : (
                          <>
                            <Phone className="h-4 w-4 mr-2" />
                            Gerar Código
                          </>
                        )}
                      </Button>
                    </div>

                    {pairingCode && (
                      <div className="w-full rounded-xl border-2 border-primary/20 bg-muted/50 p-6 text-center space-y-2">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Código de Pareamento</p>
                        <p className="text-3xl font-mono font-bold tracking-[0.3em] text-primary">
                          {pairingCode}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Abra o WhatsApp → Configurações → Dispositivos conectados → Conectar dispositivo → Insira o código acima
                        </p>
                      </div>
                    )}

                    {selectedConnection && (
                      <Button variant="outline" onClick={() => handleCheckStatus(selectedConnection)} disabled={checkingStatus === selectedConnection.id}>
                        {checkingStatus === selectedConnection.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plug className="h-4 w-4 mr-2" />}
                        Verificar Conexão
                      </Button>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            ) : (
              /* Evolution API - only QR Code */
              <div className="flex flex-col items-center justify-center py-6">
                {loadingQr ? (
                  <div className="flex h-64 w-64 items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/50">
                    <Loader2 className="h-12 w-12 animate-spin text-primary" />
                  </div>
                ) : qrCode ? (
                  <div className="rounded-xl border-2 border-primary/20 bg-white p-4">
                    <img
                      src={qrCode.startsWith("data:") ? qrCode : `data:image/png;base64,${qrCode}`}
                      alt="QR Code WhatsApp"
                      className="h-64 w-64"
                    />
                  </div>
                ) : (
                  <div className="flex h-64 w-64 items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/50">
                    <div className="text-center">
                      <QrCode className="mx-auto h-16 w-16 text-muted-foreground/50" />
                      <p className="mt-4 text-sm text-muted-foreground">
                        Clique em atualizar para gerar o QR Code
                      </p>
                    </div>
                  </div>
                )}
                <div className="flex gap-2 mt-4">
                  <Button variant="outline" onClick={handleRefreshQRCode} disabled={loadingQr}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${loadingQr ? 'animate-spin' : ''}`} />
                    Atualizar
                  </Button>
                  {selectedConnection && (
                    <Button variant="default" onClick={() => handleCheckStatus(selectedConnection)} disabled={checkingStatus === selectedConnection.id}>
                      {checkingStatus === selectedConnection.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plug className="h-4 w-4 mr-2" />}
                      Verificar
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-4 text-center">
                  O status será verificado automaticamente a cada 5 segundos
                </p>
              </div>
            )}
          </DialogContent>
        </Dialog>
        {/* Test Message Dialog */}
        <TestMessageDialog
          connection={testConnection}
          open={testDialogOpen}
          onClose={() => {
            setTestDialogOpen(false);
            setTestConnection(null);
          }}
        />
        
        {/* Diagnostic Panel Dialog */}
        <Dialog 
          open={diagnosticPanelOpen} 
          onOpenChange={(open) => {
            setDiagnosticPanelOpen(open);
            if (!open) setDiagnosticConnection(null);
          }}
        >
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            {diagnosticConnection && (
              <WebhookDiagnosticPanel 
                connection={diagnosticConnection} 
                onClose={() => setDiagnosticPanelOpen(false)}
              />
            )}
          </DialogContent>
        </Dialog>

        {/* Edit Connection Dialog */}
        <Dialog 
          open={editDialogOpen} 
          onOpenChange={(open) => {
            setEditDialogOpen(open);
            if (!open) {
              setEditingConnection(null);
              setEditName('');
              setEditInstanceId('');
              setEditWapiToken('');
            }
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Editar Conexão</DialogTitle>
              <DialogDescription>
                {editingConnection && (editingConnection.provider === 'wapi' || !!editingConnection.instance_id)
                  ? 'Atualize os dados da sua conexão W-API.'
                  : 'Dê um nome amigável para sua conexão.'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Nome Amigável</Label>
                <Input 
                  placeholder="Ex: WhatsApp Principal, Vendas, Suporte..."
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Este nome será exibido no chat e em toda a plataforma
                </p>
              </div>
              
              {/* W-API specific fields */}
              {editingConnection && (editingConnection.provider === 'wapi' || !!editingConnection.instance_id) && (
                <>
                  <div className="space-y-2">
                    <Label>Instance ID</Label>
                    <Input 
                      placeholder="Seu Instance ID da W-API"
                      value={editInstanceId}
                      onChange={(e) => setEditInstanceId(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Token (deixe em branco para manter o atual)</Label>
                    <Input 
                      type="password"
                      placeholder="Novo token (opcional)"
                      value={editWapiToken}
                      onChange={(e) => setEditWapiToken(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Por segurança, o token atual não é exibido.
                    </p>
                  </div>
                </>
              )}

              {/* UAZAPI: webhook (re)configure button */}
              {editingConnection && editingConnection.provider === 'uazapi' && (
                <div className="space-y-2 rounded-md border p-3 bg-muted/30">
                  <Label>Webhook UAZAPI</Label>
                  <p className="text-xs text-muted-foreground">
                    Cria/atualiza o webhook desta instância no servidor UAZAPI apontando para este sistema.
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={async () => {
                      if (!editingConnection) return;
                      try {
                        const r = await uazapiApi.reconfigureWebhook(editingConnection.id);
                        if (r.ok) toast.success('Webhook UAZAPI configurado!');
                        else toast.error('Falha ao configurar webhook UAZAPI');
                      } catch (e: any) {
                        toast.error(e.message || 'Erro ao configurar webhook');
                      }
                    }}
                  >
                    Criar / Reconfigurar Webhook
                  </Button>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSaveEdit} disabled={savingEdit}>
                {savingEdit ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  'Salvar'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Lead Distribution Dialog */}
        <LeadDistributionDialog
          open={leadDistributionDialogOpen}
          onOpenChange={setLeadDistributionDialogOpen}
          connection={leadDistributionConnection}
        />

        {/* Error Logs Dialog */}
        <Dialog open={errorLogsOpen} onOpenChange={setErrorLogsOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileWarning className="h-5 w-5 text-destructive" />
                Log de Falhas de Conexão
              </DialogTitle>
              <DialogDescription>
                Últimas falhas de envio e eventos de erro das conexões
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[55vh]">
              {errorLogsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : errorLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <CheckCircle className="h-10 w-10 mb-2" />
                  <p className="text-sm">Nenhuma falha registrada</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {errorLogs.map((log: any) => (
                    <div key={log.id} className="border rounded-lg p-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <Badge variant={log.event_type === 'send_message_failed' ? 'destructive' : 'secondary'} className="text-xs">
                          {log.event_type === 'send_message_failed' ? 'Falha no Envio' :
                           log.event_type === 'connection_deleted' ? 'Conexão Excluída' :
                           log.event_type}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(log.created_at).toLocaleString('pt-BR')}
                        </span>
                      </div>
                      {log.error_message && (
                        <p className="text-sm text-destructive">{log.error_message}</p>
                      )}
                      {log.details && (
                        <details className="text-xs">
                          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                            Detalhes técnicos
                          </summary>
                          <pre className="mt-1 p-2 rounded bg-muted text-[10px] overflow-x-auto whitespace-pre-wrap">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </DialogContent>
        </Dialog>

      </div>
    </MainLayout>
  );
};

export default Conexao;
