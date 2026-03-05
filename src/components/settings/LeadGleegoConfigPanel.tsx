import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Save, Loader2, CheckCircle2, AlertCircle, Key } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";

export function LeadGleegoConfigPanel() {
  const [apiKey, setApiKey] = useState("");
  const [configured, setConfigured] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const data = await api<{ api_key: string; configured: boolean }>("/api/lead-gleego/config");
      setConfigured(data.configured);
    } catch {
      // not configured
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await api("/api/lead-gleego/config", { method: "PUT", body: { api_key: apiKey } });
      toast.success("Configuração Lead Gleego salva!");
      setConfigured(!!apiKey);
      setApiKey("");
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar");
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
          <Search className="h-5 w-5 text-primary" />
          Lead Gleego (SSO)
          {configured ? (
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
          Configure a chave SSO para que os usuários acessem o Lead Gleego diretamente pelo menu lateral.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Key className="h-4 w-4" />
            Chave API (SSO Key)
          </Label>
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={configured ? "••••••••(chave salva - digite para alterar)" : "gleego-sso-chave-secreta-..."}
          />
          <p className="text-xs text-muted-foreground">
            A mesma chave configurada no sistema Lead Gleego.
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
