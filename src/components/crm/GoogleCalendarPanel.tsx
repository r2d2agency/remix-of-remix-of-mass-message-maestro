import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useGoogleCalendarStatus, useGoogleCalendarAuth, useGoogleCalendarDisconnect } from "@/hooks/use-google-calendar";
import { Calendar, CheckCircle, XCircle, Loader2, ExternalLink, RefreshCw, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export function GoogleCalendarPanel() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: status, isLoading, refetch } = useGoogleCalendarStatus();
  const connectMutation = useGoogleCalendarAuth();
  const disconnectMutation = useGoogleCalendarDisconnect();

  // Handle OAuth callback messages
  useEffect(() => {
    const success = searchParams.get("google_success");
    const error = searchParams.get("google_error");

    if (success) {
      toast.success("Google Calendar conectado com sucesso!");
      refetch();
      // Clean up URL
      searchParams.delete("google_success");
      setSearchParams(searchParams, { replace: true });
    }

    if (error) {
      let errorMessage = "Erro ao conectar Google Calendar";
      switch (error) {
        case "access_denied":
          errorMessage = "Acesso negado. Você precisa autorizar o acesso ao calendário.";
          break;
        case "invalid_state":
          errorMessage = "Sessão expirada. Tente novamente.";
          break;
        default:
          errorMessage = `Erro: ${error}`;
      }
      toast.error(errorMessage);
      // Clean up URL
      searchParams.delete("google_error");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, refetch]);

  const handleConnect = () => {
    connectMutation.mutate();
  };

  const handleDisconnect = () => {
    disconnectMutation.mutate();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Google Calendar
            </CardTitle>
            <CardDescription>
              Sincronize suas tarefas e compromissos com o Google Calendar
            </CardDescription>
          </div>
          <ConnectionStatusBadge status={status} isLoading={isLoading} />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : status?.connected ? (
          <div className="space-y-4">
            {/* Connected account info */}
            <div className="flex items-center justify-between p-4 rounded-lg bg-accent/50">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Calendar className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">{status.name || status.email}</p>
                  <p className="text-sm text-muted-foreground">{status.email}</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={handleDisconnect} disabled={disconnectMutation.isPending}>
                {disconnectMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Desconectar"
                )}
              </Button>
            </div>

            {/* Token expired warning */}
            {status.tokenExpired && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">Token expirado. Reconecte sua conta.</span>
                <Button size="sm" variant="outline" onClick={handleConnect}>
                  Reconectar
                </Button>
              </div>
            )}

            {/* Last sync info */}
            {status.lastSync && (
              <p className="text-xs text-muted-foreground">
                Última sincronização: {new Date(status.lastSync).toLocaleString("pt-BR")}
              </p>
            )}

            {/* Usage info */}
            <div className="rounded-lg border p-4 space-y-2">
              <h4 className="font-medium text-sm">Como usar:</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  Tarefas do CRM podem ser sincronizadas automaticamente
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  Clique no ícone de calendário em qualquer tarefa para sincronizar
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  Eventos aparecem no seu Google Calendar pessoal
                </li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Conecte sua conta Google para sincronizar automaticamente suas tarefas e compromissos
              do CRM com o Google Calendar. Cada usuário pode conectar sua própria conta.
            </p>

            <div className="rounded-lg border p-4 space-y-2">
              <h4 className="font-medium text-sm">Benefícios:</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Veja compromissos do CRM no seu calendário pessoal</li>
                <li>• Receba notificações do Google Calendar</li>
                <li>• Sincronize com outros dispositivos automaticamente</li>
                <li>• Cada usuário usa sua própria conta Google</li>
              </ul>
            </div>

            <Button onClick={handleConnect} disabled={connectMutation.isPending} className="w-full">
              {connectMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <ExternalLink className="h-4 w-4 mr-2" />
              )}
              Conectar Google Calendar
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              Você será redirecionado para o Google para autorizar o acesso
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ConnectionStatusBadge({ status, isLoading }: { status?: { connected: boolean; tokenExpired?: boolean }; isLoading: boolean }) {
  if (isLoading) {
    return (
      <Badge variant="secondary">
        <Loader2 className="h-3 w-3 animate-spin mr-1" />
        Verificando
      </Badge>
    );
  }

  if (!status?.connected) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        <XCircle className="h-3 w-3 mr-1" />
        Não conectado
      </Badge>
    );
  }

  if (status.tokenExpired) {
    return (
      <Badge variant="destructive">
        <AlertCircle className="h-3 w-3 mr-1" />
        Token expirado
      </Badge>
    );
  }

  return (
    <Badge variant="default" className="bg-green-600">
      <CheckCircle className="h-3 w-3 mr-1" />
      Conectado
    </Badge>
  );
}
