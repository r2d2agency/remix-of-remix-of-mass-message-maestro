import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLeadWebhooks, useLeadWebhookMutations, useWebhookLogs, getWebhookUrl, LeadWebhook } from "@/hooks/use-lead-webhooks";
import { useCRMFunnels } from "@/hooks/use-crm";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { 
  Plus, 
  Webhook, 
  Copy, 
  RefreshCw, 
  Trash2, 
  Settings, 
  Activity,
  CheckCircle,
  XCircle,
  ExternalLink,
  Code,
  Loader2,
  AlertCircle,
  Eye
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function LeadWebhooks() {
  const { data: webhooks = [], isLoading } = useLeadWebhooks();
  const { data: funnels = [] } = useCRMFunnels();
  const { data: members = [] } = useQuery({
    queryKey: ["org-members-for-webhooks"],
    queryFn: async () => {
      const response = await api<{ members: Array<{ user_id: string; name: string; email: string; role: string }> }>("/api/organizations/current");
      return response.members || [];
    },
  });
  const { createWebhook, updateWebhook, deleteWebhook, regenerateToken } = useLeadWebhookMutations();

  const [showEditor, setShowEditor] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<LeadWebhook | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [selectedWebhookId, setSelectedWebhookId] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    description: "",
    funnel_id: "",
    stage_id: "",
    owner_id: "",
    default_value: 0,
    default_probability: 10,
    field_mapping: {} as Record<string, string>,
  });

  const selectedFunnel = funnels.find(f => f.id === form.funnel_id);

  const handleCreate = () => {
    setEditingWebhook(null);
    setForm({
      name: "",
      description: "",
      funnel_id: "",
      stage_id: "",
      owner_id: "",
      default_value: 0,
      default_probability: 10,
      field_mapping: {},
    });
    setShowEditor(true);
  };

  const handleEdit = (webhook: LeadWebhook) => {
    setEditingWebhook(webhook);
    setForm({
      name: webhook.name,
      description: webhook.description || "",
      funnel_id: webhook.funnel_id || "",
      stage_id: webhook.stage_id || "",
      owner_id: webhook.owner_id || "",
      default_value: webhook.default_value,
      default_probability: webhook.default_probability,
      field_mapping: webhook.field_mapping || {},
    });
    setShowEditor(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }

    try {
      if (editingWebhook) {
        await updateWebhook.mutateAsync({ id: editingWebhook.id, ...form });
      } else {
        await createWebhook.mutateAsync(form);
      }
      setShowEditor(false);
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Tem certeza que deseja excluir este webhook?")) {
      await deleteWebhook.mutateAsync(id);
    }
  };

  const handleCopyUrl = (token: string) => {
    const url = getWebhookUrl(token);
    navigator.clipboard.writeText(url);
    toast.success("URL copiada para a área de transferência");
  };

  const handleRegenerateToken = async (id: string) => {
    if (confirm("Regenerar o token? O URL atual deixará de funcionar.")) {
      await regenerateToken.mutateAsync(id);
    }
  };

  const handleViewLogs = (webhookId: string) => {
    setSelectedWebhookId(webhookId);
    setShowLogs(true);
  };

  return (
    <MainLayout>
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Webhook className="h-6 w-6" />
              Webhooks de Leads
            </h1>
            <p className="text-muted-foreground">
              Receba leads de integrações externas (Zapier, Make, Meta Lead Ads, n8n, etc.)
            </p>
          </div>
          <Button onClick={handleCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            Novo Webhook
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : webhooks.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Webhook className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhum webhook configurado</h3>
              <p className="text-muted-foreground mb-4">
                Crie um webhook para começar a receber leads de integrações externas.
              </p>
              <Button onClick={handleCreate} className="gap-2">
                <Plus className="h-4 w-4" />
                Criar Primeiro Webhook
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {webhooks.map((webhook) => (
              <Card key={webhook.id} className={!webhook.is_active ? "opacity-60" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold truncate">{webhook.name}</h3>
                        <Badge variant={webhook.is_active ? "default" : "secondary"}>
                          {webhook.is_active ? "Ativo" : "Inativo"}
                        </Badge>
                        {webhook.funnel_name && (
                          <Badge variant="outline">
                            {webhook.funnel_name} → {webhook.stage_name}
                          </Badge>
                        )}
                      </div>
                      {webhook.description && (
                        <p className="text-sm text-muted-foreground mb-2">{webhook.description}</p>
                      )}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Activity className="h-3 w-3" />
                          {webhook.total_leads} leads
                        </span>
                        {webhook.last_lead_at && (
                          <span>
                            Último: {formatDistanceToNow(new Date(webhook.last_lead_at), { 
                              addSuffix: true, 
                              locale: ptBR 
                            })}
                          </span>
                        )}
                        {webhook.owner_name && (
                          <span>Responsável: {webhook.owner_name}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleCopyUrl(webhook.webhook_token)}
                        className="gap-1"
                      >
                        <Copy className="h-3 w-3" />
                        Copiar URL
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleViewLogs(webhook.id)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleEdit(webhook)}
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleDelete(webhook.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Webhook URL display */}
                  <div className="mt-3 p-2 bg-muted rounded-md">
                    <div className="flex items-center gap-2">
                      <code className="text-xs flex-1 truncate">
                        {getWebhookUrl(webhook.webhook_token)}
                      </code>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => handleRegenerateToken(webhook.id)}
                        className="h-6 px-2"
                      >
                        <RefreshCw className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Documentation Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code className="h-5 w-5" />
              Como usar
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">Enviar leads via POST</h4>
              <pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto">
{`POST /api/lead-webhooks/receive/{token}
Content-Type: application/json

{
  "name": "João Silva",
  "email": "joao@email.com",
  "phone": "11999999999",
  "company": "Empresa XYZ"
}`}
              </pre>
            </div>
            <div>
              <h4 className="font-medium mb-2">Campos suportados automaticamente</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                {["name", "full_name", "nome", "email", "phone", "telefone", "whatsapp", "company", "empresa"].map(field => (
                  <Badge key={field} variant="outline" className="justify-center">{field}</Badge>
                ))}
              </div>
            </div>
            <div>
              <h4 className="font-medium mb-2">Integrações compatíveis</h4>
              <div className="flex flex-wrap gap-2">
                {["Zapier", "Make (Integromat)", "n8n", "Meta Lead Ads", "Pabbly", "Albato", "Integrately"].map(tool => (
                  <Badge key={tool} variant="secondary">{tool}</Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Editor Dialog */}
      <Dialog open={showEditor} onOpenChange={setShowEditor}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>
              {editingWebhook ? "Editar Webhook" : "Novo Webhook"}
            </DialogTitle>
            <DialogDescription>
              Configure as opções do webhook para receber leads externos.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh] pr-4">
            <Tabs defaultValue="general" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="general">Geral</TabsTrigger>
                <TabsTrigger value="mapping">Mapeamento</TabsTrigger>
              </TabsList>

              <TabsContent value="general" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome *</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Ex: Leads do Facebook"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Descrição</Label>
                  <Textarea
                    id="description"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Descrição opcional do webhook"
                    rows={2}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Funil de destino</Label>
                    <Select 
                      value={form.funnel_id} 
                      onValueChange={(v) => setForm({ ...form, funnel_id: v, stage_id: "" })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um funil" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Nenhum (criar como Prospect)</SelectItem>
                        {funnels.map((funnel) => (
                          <SelectItem key={funnel.id} value={funnel.id}>
                            {funnel.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Etapa inicial</Label>
                    <Select 
                      value={form.stage_id} 
                      onValueChange={(v) => setForm({ ...form, stage_id: v })}
                      disabled={!form.funnel_id}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione uma etapa" />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedFunnel?.stages?.map((stage) => (
                          <SelectItem key={stage.id} value={stage.id!}>
                            {stage.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Responsável padrão</Label>
                  <Select 
                    value={form.owner_id} 
                    onValueChange={(v) => setForm({ ...form, owner_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um usuário" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Nenhum</SelectItem>
                      {members.map((member) => (
                        <SelectItem key={member.user_id} value={member.user_id}>
                          {member.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="default_value">Valor padrão (R$)</Label>
                    <Input
                      id="default_value"
                      type="number"
                      value={form.default_value}
                      onChange={(e) => setForm({ ...form, default_value: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="default_probability">Probabilidade (%)</Label>
                    <Input
                      id="default_probability"
                      type="number"
                      min={0}
                      max={100}
                      value={form.default_probability}
                      onChange={(e) => setForm({ ...form, default_probability: Number(e.target.value) })}
                    />
                  </div>
                </div>

                {editingWebhook && (
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div>
                      <p className="font-medium text-sm">Status do Webhook</p>
                      <p className="text-xs text-muted-foreground">
                        {editingWebhook.is_active ? "Recebendo leads" : "Pausado"}
                      </p>
                    </div>
                    <Switch
                      checked={editingWebhook.is_active}
                      onCheckedChange={(checked) => {
                        updateWebhook.mutate({ id: editingWebhook.id, is_active: checked });
                      }}
                    />
                  </div>
                )}
              </TabsContent>

              <TabsContent value="mapping" className="space-y-4 mt-4">
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    <AlertCircle className="h-4 w-4 inline mr-1" />
                    O mapeamento de campos é opcional. O sistema detecta automaticamente campos comuns 
                    como name, email, phone, company.
                  </p>
                </div>

                <div className="space-y-3">
                  <Label>Mapeamento personalizado</Label>
                  <p className="text-xs text-muted-foreground">
                    Mapeie campos do payload recebido para os campos do CRM
                  </p>

                  {Object.entries(form.field_mapping).map(([source, target], index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        placeholder="Campo origem (ex: lead.nome)"
                        value={source}
                        onChange={(e) => {
                          const newMapping = { ...form.field_mapping };
                          delete newMapping[source];
                          newMapping[e.target.value] = target;
                          setForm({ ...form, field_mapping: newMapping });
                        }}
                        className="flex-1"
                      />
                      <span className="text-muted-foreground">→</span>
                      <Select
                        value={target}
                        onValueChange={(v) => {
                          setForm({ 
                            ...form, 
                            field_mapping: { ...form.field_mapping, [source]: v }
                          });
                        }}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="name">Nome</SelectItem>
                          <SelectItem value="email">Email</SelectItem>
                          <SelectItem value="phone">Telefone</SelectItem>
                          <SelectItem value="company_name">Empresa</SelectItem>
                          <SelectItem value="value">Valor</SelectItem>
                          <SelectItem value="description">Descrição</SelectItem>
                          <SelectItem value="custom_fields">Campo personalizado</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          const newMapping = { ...form.field_mapping };
                          delete newMapping[source];
                          setForm({ ...form, field_mapping: newMapping });
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setForm({
                        ...form,
                        field_mapping: { ...form.field_mapping, "": "name" }
                      });
                    }}
                    className="gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Adicionar mapeamento
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditor(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSave}
              disabled={createWebhook.isPending || updateWebhook.isPending}
            >
              {(createWebhook.isPending || updateWebhook.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {editingWebhook ? "Salvar" : "Criar Webhook"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Logs Dialog */}
      <WebhookLogsDialog 
        webhookId={selectedWebhookId}
        open={showLogs}
        onOpenChange={setShowLogs}
      />
    </MainLayout>
  );
}

function WebhookLogsDialog({ 
  webhookId, 
  open, 
  onOpenChange 
}: { 
  webhookId: string | null; 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
}) {
  const { data: logs = [], isLoading } = useWebhookLogs(webhookId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Logs do Webhook</DialogTitle>
          <DialogDescription>
            Histórico de requisições recebidas por este webhook.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Nenhum log encontrado
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Mensagem</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Payload</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      {log.response_status === 200 ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {log.response_message}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {log.source_ip}
                    </TableCell>
                    <TableCell className="text-xs">
                      {formatDistanceToNow(new Date(log.created_at), {
                        addSuffix: true,
                        locale: ptBR
                      })}
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-2 py-1 rounded max-w-[200px] block truncate">
                        {JSON.stringify(log.request_body).slice(0, 50)}...
                      </code>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
