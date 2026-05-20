import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { 
  Calendar, 
  Loader2, 
  RefreshCcw, 
  CheckCircle2, 
  AlertCircle, 
  ExternalLink,
  LogOut,
  CalendarDays,
  Settings2
} from "lucide-react";
import { 
  useGoogleCalendarStatus, 
  useGoogleCalendarAuth, 
  useGoogleCalendars, 
  useSaveSelectedCalendars, 
  useSaveDefaultCalendar, 
  useGoogleCalendarDisconnect,
  useSyncGoogleCalendar
} from "@/hooks/use-google-calendar";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export function GoogleCalendarSettings() {
  const { data: status, isLoading: isLoadingStatus } = useGoogleCalendarStatus();
  const { mutate: authenticate, isPending: isAuthenticating } = useGoogleCalendarAuth();
  const { data: calendars, isLoading: isLoadingCalendars } = useGoogleCalendars();
  const { mutate: saveSelected, isPending: isSavingSelected } = useSaveSelectedCalendars();
  const { mutate: saveDefault, isPending: isSavingDefault } = useSaveDefaultCalendar();
  const { mutate: disconnect, isPending: isDisconnecting } = useGoogleCalendarDisconnect();
  const { mutate: sync, isPending: isSyncing } = useSyncGoogleCalendar();

  const [localSelected, setLocalSelected] = useState<string[]>([]);

  // Update local selected state when calendars are loaded
  useState(() => {
    if (calendars) {
      setLocalSelected(calendars.filter(c => c.selected).map(c => c.id));
    }
  });

  const handleToggleCalendar = (id: string, checked: boolean) => {
    const newSelected = checked 
      ? [...localSelected, id]
      : localSelected.filter(item => item !== id);
    setLocalSelected(newSelected);
    saveSelected(newSelected);
  };

  if (isLoadingStatus) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!status?.connected) {
    return (
      <Card className="animate-fade-in shadow-card border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Google Calendar
          </CardTitle>
          <CardDescription>
            Conecte sua agenda para sincronizar compromissos e tarefas.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-8 text-center space-y-4">
          <div className="p-4 rounded-full bg-primary/10">
            <Calendar className="h-10 w-10 text-primary" />
          </div>
          <div className="max-w-md">
            <p className="text-sm text-muted-foreground mb-4">
              Sincronize automaticamente suas tarefas do CRM com o Google Calendar e veja seus compromissos externos aqui no sistema.
            </p>
            <Button onClick={() => authenticate()} disabled={isAuthenticating} size="lg">
              {isAuthenticating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Calendar className="h-4 w-4 mr-2" />}
              Conectar Conta Google
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="animate-fade-in shadow-card">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Google Calendar
              <Badge variant="outline" className="text-green-600 border-green-600 ml-2">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Conectado
              </Badge>
            </CardTitle>
            <CardDescription>
              {status.email}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => sync()} 
              disabled={isSyncing}
            >
              {isSyncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCcw className="h-4 w-4 mr-2" />}
              Sincronizar Agora
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => disconnect()}
              disabled={isDisconnecting}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Desconectar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3 rounded-lg border bg-accent/30 flex items-center gap-3">
              <RefreshCcw className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground uppercase font-semibold">Última Sincronização</p>
                <p className="text-sm font-medium">
                  {status.lastSync 
                    ? format(new Date(status.lastSync), "dd/MM/yyyy HH:mm", { locale: ptBR })
                    : "Nunca sincronizado"
                  }
                </p>
              </div>
            </div>
            {status.lastError && (
              <div className="p-3 rounded-lg border border-destructive/20 bg-destructive/5 flex items-center gap-3">
                <AlertCircle className="h-4 w-4 text-destructive" />
                <div>
                  <p className="text-xs text-destructive uppercase font-semibold">Último Erro</p>
                  <p className="text-sm font-medium text-destructive">{status.lastError}</p>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <CalendarDays className="h-4 w-4" />
                Agendas para Visualização
              </h3>
            </div>
            
            {isLoadingCalendars ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {calendars?.map((cal) => (
                  <div key={cal.id} className="flex items-center space-x-2 rounded-md border p-3 hover:bg-accent/50 transition-colors">
                    <Checkbox 
                      id={`cal-${cal.id}`} 
                      checked={localSelected.includes(cal.id)}
                      onCheckedChange={(checked) => handleToggleCalendar(cal.id, !!checked)}
                    />
                    <div className="flex-1 min-w-0">
                      <Label htmlFor={`cal-${cal.id}`} className="text-sm font-medium leading-none cursor-pointer flex items-center gap-2">
                        <div 
                          className="h-2 w-2 rounded-full" 
                          style={{ backgroundColor: cal.backgroundColor }}
                        />
                        <span className="truncate">{cal.summary}</span>
                        {cal.primary && <Badge variant="secondary" className="text-[10px] h-4 px-1">Principal</Badge>}
                      </Label>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              Agenda Padrão para Criação
            </h3>
            <RadioGroup 
              value={status.defaultCalendarId || "primary"} 
              onValueChange={(val) => saveDefault(val)}
              className="grid grid-cols-1 sm:grid-cols-2 gap-2"
            >
              {calendars?.filter(c => c.accessRole === 'owner' || c.accessRole === 'writer').map((cal) => (
                <div key={`default-${cal.id}`} className="flex items-center space-x-2 rounded-md border p-3 hover:bg-accent/50 transition-colors">
                  <RadioGroupItem value={cal.id} id={`default-${cal.id}`} />
                  <Label htmlFor={`default-${cal.id}`} className="flex-1 text-sm font-medium cursor-pointer truncate">
                    {cal.summary}
                  </Label>
                </div>
              ))}
            </RadioGroup>
            <p className="text-xs text-muted-foreground">
              Novas tarefas e compromissos criados no CRM serão adicionados nesta agenda.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
