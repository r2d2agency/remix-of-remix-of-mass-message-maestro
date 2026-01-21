import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Settings, Shield, Bell, Save, Sun, Moon, Monitor } from "lucide-react";
import { useTheme, Theme } from "@/hooks/use-theme";

const Configuracoes = () => {
  const { theme, setTheme } = useTheme();

  return (
    <MainLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="animate-slide-up">
          <h1 className="text-3xl font-bold text-foreground">Configurações</h1>
          <p className="mt-1 text-muted-foreground">
            Gerencie as configurações do sistema
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Appearance Settings */}
          <Card className="animate-fade-in shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sun className="h-5 w-5 text-primary" />
                Aparência
              </CardTitle>
              <CardDescription>
                Escolha o tema do sistema
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <RadioGroup
                value={theme}
                onValueChange={(value) => setTheme(value as Theme)}
                className="grid gap-3"
              >
                <div className="flex items-center space-x-3 rounded-lg border border-border p-4 hover:bg-accent/50 transition-colors cursor-pointer">
                  <RadioGroupItem value="light" id="light" />
                  <Label htmlFor="light" className="flex items-center gap-3 cursor-pointer flex-1">
                    <div className="p-2 rounded-full bg-amber-100 dark:bg-amber-900/30">
                      <Sun className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <p className="font-medium">Modo Claro</p>
                      <p className="text-sm text-muted-foreground">
                        Interface clara e luminosa
                      </p>
                    </div>
                  </Label>
                </div>
                
                <div className="flex items-center space-x-3 rounded-lg border border-border p-4 hover:bg-accent/50 transition-colors cursor-pointer">
                  <RadioGroupItem value="dark" id="dark" />
                  <Label htmlFor="dark" className="flex items-center gap-3 cursor-pointer flex-1">
                    <div className="p-2 rounded-full bg-indigo-100 dark:bg-indigo-900/30">
                      <Moon className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                      <p className="font-medium">Modo Escuro</p>
                      <p className="text-sm text-muted-foreground">
                        Interface escura, ideal para ambientes com pouca luz
                      </p>
                    </div>
                  </Label>
                </div>
                
                <div className="flex items-center space-x-3 rounded-lg border border-border p-4 hover:bg-accent/50 transition-colors cursor-pointer">
                  <RadioGroupItem value="system" id="system" />
                  <Label htmlFor="system" className="flex items-center gap-3 cursor-pointer flex-1">
                    <div className="p-2 rounded-full bg-slate-100 dark:bg-slate-800">
                      <Monitor className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                    </div>
                    <div>
                      <p className="font-medium">Automático</p>
                      <p className="text-sm text-muted-foreground">
                        Segue a preferência do sistema operacional
                      </p>
                    </div>
                  </Label>
                </div>
              </RadioGroup>
            </CardContent>
          </Card>

          {/* General Settings */}
          <Card className="animate-fade-in shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-primary" />
                Configurações Gerais
              </CardTitle>
              <CardDescription>
                Ajustes básicos do sistema
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Auto-refresh</Label>
                  <p className="text-sm text-muted-foreground">
                    Atualizar dados automaticamente
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
            </CardContent>
          </Card>

          {/* Notification Settings */}
          <Card className="animate-fade-in shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-primary" />
                Notificações
              </CardTitle>
              <CardDescription>
                Configure alertas e notificações
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Campanha Concluída</Label>
                  <p className="text-sm text-muted-foreground">
                    Notificar quando uma campanha terminar
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Erros de Envio</Label>
                  <p className="text-sm text-muted-foreground">
                    Alertar sobre falhas de entrega
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Conexão Perdida</Label>
                  <p className="text-sm text-muted-foreground">
                    Notificar se a conexão cair
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
            </CardContent>
          </Card>

          {/* Security Settings */}
          <Card className="animate-fade-in shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Segurança do WhatsApp
              </CardTitle>
              <CardDescription>
                Proteções para evitar bloqueio da sua conta
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label htmlFor="maxMessagesDay">Limite diário de mensagens</Label>
                  <Input
                    id="maxMessagesDay"
                    type="number"
                    defaultValue="500"
                    placeholder="Ex: 500"
                  />
                  <p className="text-xs text-muted-foreground">
                    Máximo de mensagens por dia
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="minPause">Pausa mínima (seg)</Label>
                    <Input
                      id="minPause"
                      type="number"
                      defaultValue="30"
                      placeholder="Ex: 30"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="maxPause">Pausa máxima (seg)</Label>
                    <Input
                      id="maxPause"
                      type="number"
                      defaultValue="120"
                      placeholder="Ex: 120"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end">
          <Button variant="gradient" size="lg">
            <Save className="h-4 w-4" />
            Salvar Todas as Configurações
          </Button>
        </div>
      </div>
    </MainLayout>
  );
};

export default Configuracoes;
