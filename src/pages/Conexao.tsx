import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConnectionStatus } from "@/components/dashboard/ConnectionStatus";
import { Plug, QrCode, RefreshCw, Settings2, Save, Unplug } from "lucide-react";
import { useEvolution } from "@/hooks/use-evolution";
import { toast } from "sonner";

const Conexao = () => {
  const {
    config,
    connectionState,
    isLoading,
    qrCode,
    saveConfig,
    connect,
    disconnect,
    refreshQRCode,
    isConfigured,
  } = useEvolution();

  const [apiUrl, setApiUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [instanceName, setInstanceName] = useState("");

  // Carregar config salva nos inputs
  useEffect(() => {
    if (config) {
      setApiUrl(config.apiUrl);
      setApiKey(config.apiKey);
      setInstanceName(config.instanceName);
    }
  }, [config]);

  const handleSaveConfig = () => {
    if (!apiUrl || !apiKey || !instanceName) {
      toast.error("Preencha todos os campos!");
      return;
    }

    saveConfig({
      apiUrl: apiUrl.replace(/\/$/, ""), // Remove trailing slash
      apiKey,
      instanceName,
    });
  };

  const handleConnect = async () => {
    if (!isConfigured) {
      toast.error("Salve a configuração primeiro!");
      return;
    }
    await connect();
  };

  return (
    <MainLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="animate-slide-up">
          <h1 className="text-3xl font-bold text-foreground">Conexão</h1>
          <p className="mt-1 text-muted-foreground">
            Configure sua conexão com a Evolution API
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Connection Form */}
          <Card className="animate-fade-in shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings2 className="h-5 w-5 text-primary" />
                Configuração da API
              </CardTitle>
              <CardDescription>
                Insira as credenciais da sua Evolution API (URL, Token e Instância)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="apiUrl">URL da API</Label>
                <Input
                  id="apiUrl"
                  placeholder="https://sua-evolution-api.com"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Ex: https://api.seudominio.com.br
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="apiKey">API Key (Token)</Label>
                <Input
                  id="apiKey"
                  type="password"
                  placeholder="Seu token de autenticação"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="instanceName">Nome da Instância</Label>
                <Input
                  id="instanceName"
                  placeholder="minha-instancia"
                  value={instanceName}
                  onChange={(e) => setInstanceName(e.target.value)}
                />
              </div>
              
              <div className="flex gap-2">
                <Button
                  onClick={handleSaveConfig}
                  variant="outline"
                  className="flex-1"
                  disabled={isLoading}
                >
                  <Save className="h-4 w-4" />
                  Salvar
                </Button>
                
                {connectionState.status === "connected" ? (
                  <Button
                    onClick={disconnect}
                    variant="destructive"
                    className="flex-1"
                    disabled={isLoading}
                  >
                    <Unplug className="h-4 w-4" />
                    Desconectar
                  </Button>
                ) : (
                  <Button
                    onClick={handleConnect}
                    className="flex-1"
                    variant="gradient"
                    disabled={isLoading || !isConfigured}
                  >
                    {isLoading ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Conectando...
                      </>
                    ) : (
                      <>
                        <Plug className="h-4 w-4" />
                        Conectar
                      </>
                    )}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* QR Code Area */}
          <Card className="animate-fade-in shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <QrCode className="h-5 w-5 text-primary" />
                QR Code
              </CardTitle>
              <CardDescription>
                Escaneie o QR Code com seu WhatsApp
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-8">
                {qrCode ? (
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
                        {connectionState.status === "connected"
                          ? "WhatsApp conectado!"
                          : "Clique em Conectar para gerar o QR Code"}
                      </p>
                    </div>
                  </div>
                )}
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={refreshQRCode}
                  disabled={isLoading || !isConfigured}
                >
                  <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                  Atualizar QR Code
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Connection Status */}
        <div className="animate-fade-in">
          <h2 className="mb-4 text-lg font-semibold text-foreground">
            Status da Conexão
          </h2>
          <ConnectionStatus
            status={connectionState.status}
            instanceName={config?.instanceName || "Não configurado"}
            phoneNumber={connectionState.phoneNumber}
          />
        </div>
      </div>
    </MainLayout>
  );
};

export default Conexao;
