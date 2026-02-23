import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Scale, Save, Loader2, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { useAASPConfig, useAASPActions } from "@/hooks/use-aasp";
import { useConnectionStatus } from "@/hooks/use-connection-status";
import { toast } from "sonner";

export function AASPConfigPanel() {
  const { config, isLoading, saveConfig } = useAASPConfig();
  const { syncNow } = useAASPActions();
  const { connections } = useConnectionStatus({});

  const [token, setToken] = useState("");
  const [notifyPhone, setNotifyPhone] = useState("");
  const [connectionId, setConnectionId] = useState("");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (config) {
      setNotifyPhone(config.notify_phone || "");
      setConnectionId(config.connection_id || "");
      setIsActive(config.is_active);
    }
  }, [config]);

  const handleSave = async () => {
    if (!config && !token) {
      toast.error("Token da API é obrigatório na primeira configuração");
      return;
    }

    try {
      const body: any = {
        notify_phone: notifyPhone || undefined,
        connection_id: connectionId || undefined,
        is_active: isActive,
      };

      // Only send token if user typed a new one
      if (token) {
        body.api_token = token;
      }

      await saveConfig.mutateAsync(body);
      toast.success("Configuração AASP salva com sucesso!");
      setToken(""); // Clear after save
    } catch (error: any) {
      toast.error(error.message || "Erro ao salvar configuração");
    }
  };

  const handleSync = async () => {
    try {
      const result = await syncNow.mutateAsync();
      if (result.success) {
        toast.success(`Sincronização concluída: ${result.newCount} novas intimações encontradas`);
      } else {
        toast.error("Falha na sincronização");
      }
    } catch (error: any) {
      toast.error(error.message || "Erro ao sincronizar");
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-primary" />
            Integração AASP - Intimações
          </CardTitle>
          <CardDescription>
            Configure o acesso à API de Intimações da AASP para receber notificações automáticas
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status */}
          {config && (
            <div className="flex items-center gap-2">
              <Badge variant={config.is_active ? "default" : "secondary"}>
                {config.is_active ? "Ativo" : "Inativo"}
              </Badge>
              {config.last_sync_at && (
                <span className="text-xs text-muted-foreground">
                  Última sincronização: {new Date(config.last_sync_at).toLocaleString('pt-BR')}
                </span>
              )}
            </div>
          )}

          {/* Token */}
          <div className="space-y-2">
            <Label htmlFor="aasp-token">Token da API AASP</Label>
            <Input
              id="aasp-token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={config ? config.api_token_masked || "••••••••" : "Cole seu token aqui"}
            />
            <p className="text-xs text-muted-foreground">
              Token fornecido pela AASP para acesso à API de intimações
            </p>
          </div>

          {/* Active toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Sincronização automática</Label>
              <p className="text-xs text-muted-foreground">Consultar novas intimações a cada hora</p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          {/* WhatsApp notification */}
          <div className="space-y-2">
            <Label htmlFor="aasp-phone">Número para notificação WhatsApp</Label>
            <Input
              id="aasp-phone"
              value={notifyPhone}
              onChange={(e) => setNotifyPhone(e.target.value)}
              placeholder="5511999999999"
            />
            <p className="text-xs text-muted-foreground">
              Receba uma mensagem no WhatsApp quando houver novas intimações
            </p>
          </div>

          {/* Connection for notifications */}
          <div className="space-y-2">
            <Label>Conexão para envio</Label>
            <Select value={connectionId} onValueChange={setConnectionId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a conexão WhatsApp" />
              </SelectTrigger>
              <SelectContent>
                {connections.map((conn: any) => (
                  <SelectItem key={conn.id} value={conn.id}>
                    {conn.name || conn.instance_name || conn.instance_id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saveConfig.isPending} className="flex-1">
              {saveConfig.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Salvar Configuração
            </Button>

            {config && (
              <Button variant="outline" onClick={handleSync} disabled={syncNow.isPending}>
                {syncNow.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Sincronizar Agora
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
