import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useOrgSMTPConfig, useUserSMTPConfig, useSMTPConfigMutations, useSMTPStatus } from "@/hooks/use-email";
import { Mail, Server, CheckCircle, XCircle, Loader2, Send, Eye, EyeOff, HelpCircle, ChevronDown, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export function SMTPConfigPanel() {
  const [activeTab, setActiveTab] = useState<"org" | "user">("org");
  
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Configuração de Email (SMTP)
            </CardTitle>
            <CardDescription>
              Configure o servidor SMTP para envio de emails pelo sistema
            </CardDescription>
          </div>
          <SMTPStatusBadge />
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "org" | "user")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="org">Organização</TabsTrigger>
            <TabsTrigger value="user">Pessoal</TabsTrigger>
          </TabsList>
          
          <TabsContent value="org" className="mt-4">
            <OrgSMTPForm />
          </TabsContent>
          
          <TabsContent value="user" className="mt-4">
            <UserSMTPForm />
          </TabsContent>
        </Tabs>

        {/* Gmail Help Section */}
        <EmailProvidersHelpSection />
      </CardContent>
    </Card>
  );
}

function EmailProvidersHelpSection() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeProvider, setActiveProvider] = useState<"gmail" | "outlook">("gmail");

  const fillDefaults = (provider: "gmail" | "outlook") => {
    const configs = {
      gmail: { host: 'smtp.gmail.com', port: 587, secure: true },
      outlook: { host: 'smtp.office365.com', port: 587, secure: true }
    };
    window.dispatchEvent(new CustomEvent('fill-gmail-defaults', {
      detail: configs[provider]
    }));
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mt-6">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="w-full justify-between p-4 h-auto border rounded-lg hover:bg-accent">
          <div className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-primary" />
            <span className="font-medium">Como usar Gmail ou Outlook como SMTP?</span>
          </div>
          <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3">
        <div className="rounded-lg border bg-accent/30 p-4 space-y-4">
          {/* Provider Tabs */}
          <Tabs value={activeProvider} onValueChange={(v) => setActiveProvider(v as "gmail" | "outlook")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="gmail">Gmail</TabsTrigger>
              <TabsTrigger value="outlook">Outlook / Hotmail</TabsTrigger>
            </TabsList>

            {/* Gmail Instructions */}
            <TabsContent value="gmail" className="mt-4 space-y-4">
              <div className="space-y-3">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs">1</span>
                  Ative a verificação em 2 etapas
                </h4>
                <p className="text-sm text-muted-foreground pl-7">
                  Acesse sua conta Google e ative a verificação em duas etapas.
                </p>
                <a 
                  href="https://myaccount.google.com/security" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline flex items-center gap-1 pl-7"
                >
                  Configurações de segurança do Google
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              <div className="space-y-3">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs">2</span>
                  Crie uma Senha de App
                </h4>
                <p className="text-sm text-muted-foreground pl-7">
                  Gere uma senha específica para este aplicativo (16 caracteres, sem espaços).
                </p>
                <a 
                  href="https://myaccount.google.com/apppasswords" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline flex items-center gap-1 pl-7"
                >
                  Criar senha de app no Google
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              <div className="space-y-3">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs">3</span>
                  Configurações SMTP
                </h4>
                <div className="pl-7 grid grid-cols-2 gap-2 text-sm">
                  <div className="bg-background rounded px-3 py-2">
                    <span className="text-muted-foreground">Servidor:</span>
                    <code className="ml-2 font-mono">smtp.gmail.com</code>
                  </div>
                  <div className="bg-background rounded px-3 py-2">
                    <span className="text-muted-foreground">Porta:</span>
                    <code className="ml-2 font-mono">587</code>
                  </div>
                </div>
              </div>

              <Button variant="outline" size="sm" onClick={() => fillDefaults("gmail")} className="w-full">
                <Mail className="h-4 w-4 mr-2" />
                Preencher configurações do Gmail
              </Button>
            </TabsContent>

            {/* Outlook Instructions */}
            <TabsContent value="outlook" className="mt-4 space-y-4">
              <div className="space-y-3">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs">1</span>
                  Ative a verificação em 2 etapas
                </h4>
                <p className="text-sm text-muted-foreground pl-7">
                  Acesse sua conta Microsoft e ative a verificação em duas etapas.
                </p>
                <a 
                  href="https://account.microsoft.com/security" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline flex items-center gap-1 pl-7"
                >
                  Configurações de segurança da Microsoft
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              <div className="space-y-3">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs">2</span>
                  Crie uma Senha de App
                </h4>
                <p className="text-sm text-muted-foreground pl-7">
                  Gere uma senha específica para aplicativos.
                </p>
                <a 
                  href="https://account.live.com/proofs/AppPassword" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline flex items-center gap-1 pl-7"
                >
                  Criar senha de app na Microsoft
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              <div className="space-y-3">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs">3</span>
                  Configurações SMTP
                </h4>
                <div className="pl-7 grid grid-cols-2 gap-2 text-sm">
                  <div className="bg-background rounded px-3 py-2">
                    <span className="text-muted-foreground">Servidor:</span>
                    <code className="ml-2 font-mono text-xs">smtp.office365.com</code>
                  </div>
                  <div className="bg-background rounded px-3 py-2">
                    <span className="text-muted-foreground">Porta:</span>
                    <code className="ml-2 font-mono">587</code>
                  </div>
                </div>
              </div>

              <Button variant="outline" size="sm" onClick={() => fillDefaults("outlook")} className="w-full">
                <Mail className="h-4 w-4 mr-2" />
                Preencher configurações do Outlook
              </Button>
            </TabsContent>
          </Tabs>

          <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <span className="text-yellow-600 text-lg">⚠️</span>
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">Importante:</strong> Use a <em>Senha de App</em> gerada, não sua senha normal. 
              A senha de app é diferente da senha de login.
              A senha de app tem 16 caracteres sem espaços.
            </p>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function SMTPStatusBadge() {
  const { data: status, isLoading } = useSMTPStatus();

  if (isLoading) {
    return <Badge variant="secondary"><Loader2 className="h-3 w-3 animate-spin mr-1" />Verificando</Badge>;
  }

  if (!status?.configured) {
    return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Não configurado</Badge>;
  }

  if (!status.verified) {
    return <Badge variant="outline" className="text-yellow-600"><Server className="h-3 w-3 mr-1" />Pendente verificação</Badge>;
  }

  return (
    <Badge variant="default" className="bg-green-600">
      <CheckCircle className="h-3 w-3 mr-1" />
      Verificado ({status.source === 'user' ? 'Pessoal' : 'Org'})
    </Badge>
  );
}

function OrgSMTPForm() {
  const { data: config, isLoading } = useOrgSMTPConfig();
  const { saveOrgConfig, testOrgConfig } = useSMTPConfigMutations();
  const [showPassword, setShowPassword] = useState(false);
  
  const [form, setForm] = useState({
    host: "",
    port: 587,
    secure: true,
    username: "",
    password: "",
    from_name: "",
    from_email: "",
    reply_to: "",
  });

  // Listen for Gmail defaults event
  useEffect(() => {
    const handleGmailDefaults = (e: CustomEvent) => {
      setForm(prev => ({
        ...prev,
        host: e.detail.host,
        port: e.detail.port,
        secure: e.detail.secure,
      }));
    };
    window.addEventListener('fill-gmail-defaults', handleGmailDefaults as EventListener);
    return () => window.removeEventListener('fill-gmail-defaults', handleGmailDefaults as EventListener);
  }, []);

  useEffect(() => {
    if (config) {
      setForm({
        host: config.host,
        port: config.port,
        secure: config.secure,
        username: config.username,
        password: "", // Don't show encrypted password
        from_name: config.from_name,
        from_email: config.from_email,
        reply_to: config.reply_to || "",
      });
    }
  }, [config]);

  const handleSave = () => {
    if (!form.host || !form.username || !form.password || !form.from_email) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    saveOrgConfig.mutate(form);
  };

  const handleTest = () => {
    testOrgConfig.mutate(undefined);
  };

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Configuração compartilhada por toda a organização. Será usada quando o usuário não tiver configuração pessoal.
      </p>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Servidor SMTP *</Label>
          <Input
            value={form.host}
            onChange={(e) => setForm({ ...form, host: e.target.value })}
            placeholder="smtp.exemplo.com"
          />
        </div>
        <div className="space-y-2">
          <Label>Porta *</Label>
          <Input
            type="number"
            value={form.port}
            onChange={(e) => setForm({ ...form, port: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Usuário *</Label>
          <Input
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            placeholder="usuario@exemplo.com"
          />
        </div>
        <div className="space-y-2">
          <Label>Senha *</Label>
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder={config ? "••••••••" : "Senha"}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-full"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <Switch
          checked={form.secure}
          onCheckedChange={(v) => setForm({ ...form, secure: v })}
        />
        <Label>Conexão segura (TLS/SSL)</Label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Nome do remetente *</Label>
          <Input
            value={form.from_name}
            onChange={(e) => setForm({ ...form, from_name: e.target.value })}
            placeholder="Minha Empresa"
          />
        </div>
        <div className="space-y-2">
          <Label>Email do remetente *</Label>
          <Input
            type="email"
            value={form.from_email}
            onChange={(e) => setForm({ ...form, from_email: e.target.value })}
            placeholder="noreply@exemplo.com"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Reply-To (opcional)</Label>
        <Input
          type="email"
          value={form.reply_to}
          onChange={(e) => setForm({ ...form, reply_to: e.target.value })}
          placeholder="contato@exemplo.com"
        />
      </div>

      <div className="flex gap-2 pt-4">
        <Button onClick={handleSave} disabled={saveOrgConfig.isPending}>
          {saveOrgConfig.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Salvar configuração
        </Button>
        <Button variant="outline" onClick={handleTest} disabled={!config || testOrgConfig.isPending}>
          {testOrgConfig.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
          Enviar teste
        </Button>
      </div>

      {config && (
        <p className="text-xs text-muted-foreground">
          Última verificação: {config.last_verified_at 
            ? new Date(config.last_verified_at).toLocaleString('pt-BR')
            : 'Nunca'}
        </p>
      )}
    </div>
  );
}

function UserSMTPForm() {
  const { data: config, isLoading } = useUserSMTPConfig();
  const { saveUserConfig, testUserConfig } = useSMTPConfigMutations();
  const [showPassword, setShowPassword] = useState(false);
  const [usePersonal, setUsePersonal] = useState(false);
  
  const [form, setForm] = useState({
    host: "",
    port: 587,
    secure: true,
    username: "",
    password: "",
    from_name: "",
    from_email: "",
    reply_to: "",
  });

  // Listen for Gmail defaults event
  useEffect(() => {
    const handleGmailDefaults = (e: CustomEvent) => {
      setForm(prev => ({
        ...prev,
        host: e.detail.host,
        port: e.detail.port,
        secure: e.detail.secure,
      }));
    };
    window.addEventListener('fill-gmail-defaults', handleGmailDefaults as EventListener);
    return () => window.removeEventListener('fill-gmail-defaults', handleGmailDefaults as EventListener);
  }, []);

  useEffect(() => {
    if (config) {
      setUsePersonal(config.is_active);
      setForm({
        host: config.host,
        port: config.port,
        secure: config.secure,
        username: config.username,
        password: "",
        from_name: config.from_name,
        from_email: config.from_email,
        reply_to: config.reply_to || "",
      });
    }
  }, [config]);

  const handleSave = () => {
    if (!form.host || !form.username || !form.password || !form.from_email) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    saveUserConfig.mutate({ ...form, is_active: true });
  };

  const handleDisable = () => {
    saveUserConfig.mutate({ ...form, is_active: false });
    setUsePersonal(false);
  };

  const handleTest = () => {
    testUserConfig.mutate(undefined);
  };

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Configure seu próprio SMTP para enviar emails com sua identidade pessoal.
        </p>
        {config?.is_active && (
          <Button variant="ghost" size="sm" onClick={handleDisable}>
            Usar configuração da organização
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Servidor SMTP *</Label>
          <Input
            value={form.host}
            onChange={(e) => setForm({ ...form, host: e.target.value })}
            placeholder="smtp.exemplo.com"
          />
        </div>
        <div className="space-y-2">
          <Label>Porta *</Label>
          <Input
            type="number"
            value={form.port}
            onChange={(e) => setForm({ ...form, port: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Usuário *</Label>
          <Input
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            placeholder="usuario@exemplo.com"
          />
        </div>
        <div className="space-y-2">
          <Label>Senha *</Label>
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder={config ? "••••••••" : "Senha"}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-full"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <Switch
          checked={form.secure}
          onCheckedChange={(v) => setForm({ ...form, secure: v })}
        />
        <Label>Conexão segura (TLS/SSL)</Label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Seu nome *</Label>
          <Input
            value={form.from_name}
            onChange={(e) => setForm({ ...form, from_name: e.target.value })}
            placeholder="João Silva"
          />
        </div>
        <div className="space-y-2">
          <Label>Seu email *</Label>
          <Input
            type="email"
            value={form.from_email}
            onChange={(e) => setForm({ ...form, from_email: e.target.value })}
            placeholder="joao@exemplo.com"
          />
        </div>
      </div>

      <div className="flex gap-2 pt-4">
        <Button onClick={handleSave} disabled={saveUserConfig.isPending}>
          {saveUserConfig.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Salvar configuração pessoal
        </Button>
        <Button variant="outline" onClick={handleTest} disabled={!config?.is_active || testUserConfig.isPending}>
          {testUserConfig.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
          Enviar teste
        </Button>
      </div>
    </div>
  );
}
