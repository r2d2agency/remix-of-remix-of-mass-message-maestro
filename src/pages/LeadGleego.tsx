import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Loader2, Search, Settings } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Link } from "react-router-dom";

const LeadGleego = () => {
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [ssoLoading, setSsoLoading] = useState(false);

  useEffect(() => {
    api<{ configured: boolean }>("/api/lead-gleego/config")
      .then((data) => setConfigured(data.configured))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ExternalLink className="h-5 w-5" />
              Acessar Lead Gleego
            </CardTitle>
            <CardDescription>
              Clique no botão abaixo para acessar o Lead Extractor com login automático (SSO).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={handleSSO} disabled={!configured || ssoLoading} size="lg" className="w-full sm:w-auto">
              {ssoLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ExternalLink className="h-4 w-4 mr-2" />}
              Abrir Lead Gleego
            </Button>
            {!configured && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <Settings className="h-4 w-4" />
                Configure a chave API em{" "}
                <Link to="/configuracoes" className="underline font-medium">
                  Configurações → Integrações
                </Link>
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
};

export default LeadGleego;
