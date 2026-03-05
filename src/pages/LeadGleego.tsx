import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Key, Loader2, Save, Search } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const LeadGleego = () => {
  const { user } = useAuth();
  const [apiKey, setApiKey] = useState("");
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);

  const isAdmin = ['owner', 'admin', 'manager'].includes(user?.role || '');

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const data = await api<{ api_key: string; configured: boolean }>("/api/lead-gleego/config");
      setApiKey(data.api_key);
      setConfigured(data.configured);
    } catch (error: any) {
      console.error("Failed to load config:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api("/api/lead-gleego/config", { method: "PUT", body: { api_key: apiKey } });
      toast.success("Configuração salva com sucesso!");
      setConfigured(!!apiKey);
    } catch (error: any) {
      toast.error(error.message || "Erro ao salvar configuração");
    } finally {
      setSaving(false);
    }
  };

  const handleSSO = async () => {
    setSsoLoading(true);
    try {
      const data = await api<{ redirect_url: string }>("/api/lead-gleego/sso", { method: "POST" });
      window.open(data.redirect_url, "_blank");
    } catch (error: any) {
      toast.error(error.message || "Erro ao autenticar no Lead Gleego");
    } finally {
      setSsoLoading(false);
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Search className="h-6 w-6 text-primary" />
              Lead Gleego
            </h1>
            <p className="text-muted-foreground">
              Extração e prospecção de leads integrada
            </p>
          </div>
          <Badge variant={configured ? "default" : "secondary"}>
            {configured ? "Configurado" : "Não configurado"}
          </Badge>
        </div>

        {/* SSO Access Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ExternalLink className="h-5 w-5" />
              Acessar Lead Gleego
            </CardTitle>
            <CardDescription>
              Clique no botão abaixo para acessar o Lead Extractor com login automático (SSO).
              Seu email precisa estar cadastrado no Lead Gleego.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={handleSSO}
              disabled={!configured || ssoLoading}
              size="lg"
              className="w-full sm:w-auto"
            >
              {ssoLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <ExternalLink className="h-4 w-4 mr-2" />
              )}
              Abrir Lead Gleego
            </Button>
            {!configured && (
              <p className="text-sm text-destructive mt-2">
                Configure a chave API abaixo para ativar o acesso.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Config Card - Admin only */}
        {isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                Configuração da Integração
              </CardTitle>
              <CardDescription>
                Insira a chave SSO fornecida pelo Lead Gleego para ativar a integração.
                Esta chave é compartilhada entre os dois sistemas.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="api-key">Chave API (SSO Key)</Label>
                <Input
                  id="api-key"
                  type="password"
                  placeholder="gleego-sso-chave-secreta-..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  A mesma chave configurada no sistema Lead Gleego.
                </p>
              </div>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Salvar Configuração
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  );
};

export default LeadGleego;
