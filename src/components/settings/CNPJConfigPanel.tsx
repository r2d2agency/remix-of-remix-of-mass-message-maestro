import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, Save, Loader2, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";

export function CNPJConfigPanel() {
  const [token, setToken] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://cnpj.gleego.com.br");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasToken, setHasToken] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const data = await api<any>("/api/cnpj/config");
      if (data) {
        setBaseUrl(data.base_url || "https://cnpj.gleego.com.br");
        setHasToken(!!data.api_token_masked);
      }
    } catch (e) {
      // No config yet
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await api("/api/cnpj/config", {
        method: "POST",
        body: { api_token: token || undefined, base_url: baseUrl },
      });
      toast.success("Configuração CNPJ salva com sucesso!");
      setHasToken(!!token || hasToken);
      setToken("");
      loadConfig();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar configuração");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="animate-fade-in shadow-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          Consulta CNPJ (Gleego)
          {hasToken ? (
            <Badge variant="outline" className="ml-2 text-green-600 border-green-600">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Configurado
            </Badge>
          ) : (
            <Badge variant="outline" className="ml-2 text-orange-500 border-orange-500">
              <AlertCircle className="h-3 w-3 mr-1" />
              Não configurado
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Consulte dados de empresas automaticamente pelo CNPJ usando a API Gleego.{" "}
          <a
            href="https://cnpj.gleego.com.br/api-docs"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline inline-flex items-center gap-1"
          >
            Ver documentação <ExternalLink className="h-3 w-3" />
          </a>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>URL Base da API</Label>
          <Input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://cnpj.gleego.com.br"
          />
        </div>

        <div className="space-y-2">
          <Label>API Token</Label>
          <Input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={hasToken ? "••••••••(token salvo - digite para alterar)" : "Cole seu token aqui"}
          />
          <p className="text-xs text-muted-foreground">
            Crie sua API Key no painel administrativo do Gleego.
          </p>
        </div>

        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Salvar Configuração
        </Button>
      </CardContent>
    </Card>
  );
}
