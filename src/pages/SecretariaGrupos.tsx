import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  Bot, Users, Settings, Activity, Plus, Trash2, Save, Loader2, Shield, Clock, MessageSquare, BellRing, Phone, Smartphone, Wifi, AlertTriangle, Pencil, BarChart3, RefreshCw, Timer
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { MainLayout } from "@/components/layout/MainLayout";
import { useGroupSecretary, type SecretaryConfig, type SecretaryMember, type SecretaryLog, type SecretaryStats, type AvailableUser, type MonitoredGroup } from "@/hooks/use-group-secretary";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function SecretariaGrupos() {
  const {
    getConfig, saveConfig, getMembers, addMember, removeMember, getLogs, getAvailableUsers, getGroups, getStats, updateMemberPhone
  } = useGroupSecretary();

  const [config, setConfig] = useState<SecretaryConfig>({
    is_active: false, connection_ids: null, group_jids: null,
    create_crm_task: true, show_popup_alert: true, min_confidence: 0.6,
    ai_provider: null, ai_model: null,
    notify_external_enabled: false, notify_external_phone: '',
    notify_members_whatsapp: false, default_connection_id: null,
    followup_enabled: false, followup_hours: 4,
    daily_digest_enabled: false, daily_digest_hour: 8,
    auto_reply_enabled: false, auto_reply_message: '',
  });
  const [members, setMembers] = useState<SecretaryMember[]>([]);
  const [logs, setLogs] = useState<SecretaryLog[]>([]);
  const [stats, setStats] = useState<SecretaryStats | null>(null);
  const [availableUsers, setAvailableUsers] = useState<AvailableUser[]>([]);
  const [allGroups, setAllGroups] = useState<MonitoredGroup[]>([]);
  const [groupFilter, setGroupFilter] = useState("");
  const [connectionFilter, setConnectionFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [phoneDialogOpen, setPhoneDialogOpen] = useState(false);
  const [editingPhoneMember, setEditingPhoneMember] = useState<{ user_id: string; user_name: string } | null>(null);
  const [editingPhone, setEditingPhone] = useState("");
  const [newMember, setNewMember] = useState({
    user_id: "", aliases: "", role_description: "", departments: "",
  });

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [cfg, mems, lgs, users, groups, sts] = await Promise.all([
        getConfig(), getMembers(), getLogs(), getAvailableUsers(), getGroups(), getStats().catch(() => null),
      ]);
      setConfig(cfg);
      setMembers(mems);
      setLogs(lgs);
      setAvailableUsers(users);
      setAllGroups(groups);
      setStats(sts);
    } catch (err: any) {
      toast.error(err.message || "Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      const saved = await saveConfig(config);
      setConfig(saved);
      toast.success("Configuração salva!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleAddMember = async () => {
    if (!newMember.user_id) {
      toast.error("Selecione um usuário");
      return;
    }
    try {
      await addMember({
        user_id: newMember.user_id,
        aliases: newMember.aliases.split(",").map((a) => a.trim()).filter(Boolean),
        role_description: newMember.role_description,
        departments: newMember.departments.split(",").map((d) => d.trim()).filter(Boolean),
      });
      toast.success("Membro adicionado!");
      setAddDialogOpen(false);
      setNewMember({ user_id: "", aliases: "", role_description: "", departments: "" });
      const mems = await getMembers();
      setMembers(mems);
    } catch (err: any) {
      toast.error(err.message || "Erro ao adicionar");
    }
  };

  const handleRemoveMember = async (id: string) => {
    try {
      await removeMember(id);
      setMembers((prev) => prev.filter((m) => m.id !== id));
      toast.success("Membro removido");
    } catch (err: any) {
      toast.error(err.message || "Erro ao remover");
    }
  };

  const openPhoneDialog = (userId: string, userName: string) => {
    setEditingPhoneMember({ user_id: userId, user_name: userName });
    setEditingPhone("");
    setPhoneDialogOpen(true);
  };

  const handleSavePhone = async () => {
    if (!editingPhoneMember || !editingPhone.trim()) {
      toast.error("Informe o número");
      return;
    }
    try {
      await updateMemberPhone(editingPhoneMember.user_id, editingPhone.trim());
      toast.success(`Telefone de ${editingPhoneMember.user_name} atualizado!`);
      setPhoneDialogOpen(false);
      const mems = await getMembers();
      setMembers(mems);
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar telefone");
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Bot className="h-6 w-6 text-primary" />
              Secretária IA de Grupos
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Monitora grupos de WhatsApp e detecta solicitações direcionadas à equipe
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Label htmlFor="active" className="text-sm">
              {config.is_active ? "Ativa" : "Inativa"}
            </Label>
            <Switch
              id="active"
              checked={config.is_active}
              onCheckedChange={(v) => setConfig((c) => ({ ...c, is_active: v }))}
            />
          </div>
        </div>

        <Tabs defaultValue="members">
          <TabsList>
            <TabsTrigger value="members" className="gap-1">
              <Users className="h-3.5 w-3.5" />
              Membros
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-1">
              <Settings className="h-3.5 w-3.5" />
              Configurações
            </TabsTrigger>
            <TabsTrigger value="stats" className="gap-1">
              <BarChart3 className="h-3.5 w-3.5" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="logs" className="gap-1">
              <Activity className="h-3.5 w-3.5" />
              Logs
            </TabsTrigger>
          </TabsList>

          {/* MEMBERS TAB */}
          <TabsContent value="members" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Configure quais membros da equipe a IA deve identificar nos grupos
              </p>
              <Button size="sm" onClick={() => setAddDialogOpen(true)} className="gap-1">
                <Plus className="h-3.5 w-3.5" />
                Adicionar Membro
              </Button>
            </div>

            {/* Warning: members without phone when notify_members_whatsapp is active */}
            {config.notify_members_whatsapp && members.length > 0 && (() => {
              const noPhone = members.filter(m => !m.whatsapp_phone && !m.phone);
              if (noPhone.length === 0) return null;
              return (
                <Alert variant="destructive" className="border-destructive/30 bg-destructive/5">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-sm space-y-2">
                    <p>
                      <strong>{noPhone.length} membro(s)</strong> sem telefone cadastrado e não receberão notificações WhatsApp:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {noPhone.map(m => (
                        <Button
                          key={m.user_id}
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1 border-destructive/30 hover:bg-destructive/10"
                          onClick={() => openPhoneDialog(m.user_id, m.user_name)}
                        >
                          <Phone className="h-3 w-3" />
                          {m.user_name}
                        </Button>
                      ))}
                    </div>
                  </AlertDescription>
                </Alert>
              );
            })()}

            {members.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>Nenhum membro configurado</p>
                  <p className="text-xs mt-1">
                    Adicione membros da equipe para que a IA possa identificá-los nas mensagens
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3">
                {members.map((member) => (
                  <Card key={member.id}>
                     <CardContent className="p-4 flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{member.user_name}</span>
                          <Badge variant="secondary" className="text-xs">
                            {member.email}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Phone className="h-3 w-3 text-muted-foreground" />
                          {member.whatsapp_phone || member.phone ? (
                            <span className="text-xs text-foreground font-mono">
                              {member.whatsapp_phone || member.phone}
                            </span>
                          ) : (
                            <span className="text-xs text-destructive">
                              Sem telefone cadastrado
                            </span>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5"
                            onClick={() => openPhoneDialog(member.user_id, member.user_name)}
                            title="Editar telefone"
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </div>
                        {member.aliases?.length > 0 && (
                          <div className="flex gap-1 flex-wrap">
                            <span className="text-xs text-muted-foreground">Apelidos:</span>
                            {member.aliases.map((alias, i) => (
                              <Badge key={i} variant="outline" className="text-xs">
                                {alias}
                              </Badge>
                            ))}
                          </div>
                        )}
                        {member.departments?.length > 0 && (
                          <div className="flex gap-1 flex-wrap">
                            <span className="text-xs text-muted-foreground">Áreas:</span>
                            {member.departments.map((dept, i) => (
                              <Badge key={i} variant="outline" className="text-xs">
                                {dept}
                              </Badge>
                            ))}
                          </div>
                        )}
                        {member.role_description && (
                          <p className="text-xs text-muted-foreground">
                            {member.role_description}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => handleRemoveMember(member.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* SETTINGS TAB */}
          <TabsContent value="settings" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Grupos Monitorados
                </CardTitle>
                <CardDescription>
                  Selecione quais grupos a secretária IA deve monitorar. Se nenhum for selecionado, todos os grupos serão monitorados.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {allGroups.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum grupo encontrado nas conexões.</p>
                ) : (
                  <>
                    {(() => {
                      const connections = [...new Map(allGroups.map(g => [g.connection_id, g.connection_name])).entries()];
                      const filteredGroups = allGroups
                        .filter(g => connectionFilter === "all" || g.connection_id === connectionFilter)
                        .filter(g => !groupFilter || g.group_name?.toLowerCase().includes(groupFilter.toLowerCase()));
                      return (
                        <>
                          {connections.length > 1 && (
                            <div className="space-y-1.5 mb-2">
                              <Label className="text-xs">Conexão</Label>
                              <Select value={connectionFilter} onValueChange={setConnectionFilter}>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">Todas as conexões</SelectItem>
                                  {connections.map(([id, name]) => (
                                    <SelectItem key={id} value={id}>{name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                          <Input
                            placeholder="Filtrar grupos por nome..."
                            value={groupFilter}
                            onChange={(e) => setGroupFilter(e.target.value)}
                            className="mb-2"
                          />
                          <div className="flex gap-2 mb-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setConfig(c => ({ ...c, group_jids: filteredGroups.map(g => g.remote_jid) }))}
                            >
                              Selecionar {connectionFilter !== "all" ? "desta conexão" : "todos"}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setConfig(c => ({ ...c, group_jids: null }))}
                            >
                              Limpar (monitorar todos)
                            </Button>
                          </div>
                          <ScrollArea className="h-[250px] border rounded-md p-2">
                            <div className="space-y-1">
                              {filteredGroups.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-4">Nenhum grupo encontrado</p>
                              ) : (
                                filteredGroups.map((group) => {
                                  const isSelected = config.group_jids?.includes(group.remote_jid) ?? false;
                                  return (
                                    <label
                                      key={group.remote_jid}
                                      className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer"
                                    >
                                      <Checkbox
                                        checked={isSelected}
                                        onCheckedChange={(checked) => {
                                          setConfig(c => {
                                            const current = c.group_jids || [];
                                            if (checked) {
                                              return { ...c, group_jids: [...current, group.remote_jid] };
                                            } else {
                                              const updated = current.filter(j => j !== group.remote_jid);
                                              return { ...c, group_jids: updated.length > 0 ? updated : null };
                                            }
                                          });
                                        }}
                                      />
                                      <div className="flex-1 min-w-0">
                                        <span className="text-sm font-medium truncate block">
                                          {group.group_name || group.remote_jid}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                          {group.connection_name}
                                        </span>
                                      </div>
                                    </label>
                                  );
                                })
                              )}
                            </div>
                          </ScrollArea>
                        </>
                      );
                    })()}
                    {config.group_jids && config.group_jids.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {config.group_jids.length} grupo(s) selecionado(s)
                      </p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Comportamento</CardTitle>
                <CardDescription>Configure como a secretária IA deve agir</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Criar tarefa no CRM</Label>
                    <p className="text-xs text-muted-foreground">
                      Cria uma tarefa atribuída ao responsável identificado
                    </p>
                  </div>
                  <Switch
                    checked={config.create_crm_task}
                    onCheckedChange={(v) => setConfig((c) => ({ ...c, create_crm_task: v }))}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Exibir popup na tela</Label>
                    <p className="text-xs text-muted-foreground">
                      Mostra notificação popup com som quando alguém é mencionado
                    </p>
                  </div>
                  <Switch
                    checked={config.show_popup_alert}
                    onCheckedChange={(v) => setConfig((c) => ({ ...c, show_popup_alert: v }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Confiança mínima: {Math.round((config.min_confidence || 0.6) * 100)}%</Label>
                  <Slider
                    value={[config.min_confidence || 0.6]}
                    min={0.3}
                    max={1}
                    step={0.05}
                    onValueChange={([v]) => setConfig((c) => ({ ...c, min_confidence: v }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Quanto maior, mais preciso mas pode perder detecções sutis
                  </p>
                </div>

                {/* Notify matched member via WhatsApp */}
                <div className="border-t pt-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-primary" />
                    <Label className="font-medium">Notificar Responsável via WhatsApp</Label>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Ativar notificação ao responsável</Label>
                      <p className="text-xs text-muted-foreground">
                        Quando a IA detecta uma solicitação, envia mensagem no WhatsApp pessoal do membro identificado
                      </p>
                    </div>
                    <Switch
                      checked={config.notify_members_whatsapp || false}
                      onCheckedChange={(v) => setConfig((c) => ({ ...c, notify_members_whatsapp: v }))}
                    />
                  </div>
                </div>

                {/* Default connection */}
                {(config.notify_members_whatsapp || config.notify_external_enabled) && (
                  <div className="border-t pt-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Wifi className="h-4 w-4 text-primary" />
                      <Label className="font-medium">Conexão Padrão para Notificações</Label>
                    </div>
                    <Select
                      value={config.default_connection_id || "auto"}
                      onValueChange={(v) => setConfig((c) => ({ ...c, default_connection_id: v === "auto" ? null : v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Automática (primeira disponível)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Automática (primeira disponível)</SelectItem>
                        {allGroups
                          .reduce((acc, g) => {
                            if (!acc.find(c => c.id === g.connection_id)) {
                              acc.push({ id: g.connection_id, name: g.connection_name });
                            }
                            return acc;
                          }, [] as { id: string; name: string }[])
                          .map(conn => (
                            <SelectItem key={conn.id} value={conn.id}>{conn.name}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Define qual conexão WhatsApp será usada para enviar as notificações
                    </p>
                  </div>
                )}

                {/* External notification */}
                <div className="border-t pt-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <BellRing className="h-4 w-4 text-primary" />
                    <Label className="font-medium">Notificação Externa (Número Fixo)</Label>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Ativar notificação externa</Label>
                      <p className="text-xs text-muted-foreground">
                        Envia detecções para um número externo adicional (ex: gestor)
                      </p>
                    </div>
                    <Switch
                      checked={config.notify_external_enabled || false}
                      onCheckedChange={(v) => setConfig((c) => ({ ...c, notify_external_enabled: v }))}
                    />
                  </div>
                  {config.notify_external_enabled && (
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1">
                        <Phone className="h-3.5 w-3.5" />
                        Número WhatsApp
                      </Label>
                      <Input
                        placeholder="5511999999999 (com DDI)"
                        value={config.notify_external_phone || ''}
                        onChange={(e) => setConfig((c) => ({ ...c, notify_external_phone: e.target.value }))}
                      />
                      <p className="text-xs text-muted-foreground">
                        Número completo com DDI. A cada detecção, um resumo será enviado além da notificação ao responsável.
                      </p>
                    </div>
                  )}
                </div>

                {/* Follow-up automático */}
                <div className="border-t pt-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 text-primary" />
                    <Label className="font-medium">Follow-up Automático</Label>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Ativar follow-up</Label>
                      <p className="text-xs text-muted-foreground">
                        Envia lembrete ao responsável se a tarefa não for concluída
                      </p>
                    </div>
                    <Switch
                      checked={config.followup_enabled || false}
                      onCheckedChange={(v) => setConfig((c) => ({ ...c, followup_enabled: v }))}
                    />
                  </div>
                  {config.followup_enabled && (
                    <div className="space-y-1.5">
                      <Label>Horas para follow-up: {config.followup_hours || 4}h</Label>
                      <Slider
                        value={[config.followup_hours || 4]}
                        min={1} max={48} step={1}
                        onValueChange={([v]) => setConfig((c) => ({ ...c, followup_hours: v }))}
                      />
                    </div>
                  )}
                </div>

                {/* Resumo diário */}
                <div className="border-t pt-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Timer className="h-4 w-4 text-primary" />
                    <Label className="font-medium">Resumo Diário</Label>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Ativar resumo diário</Label>
                      <p className="text-xs text-muted-foreground">
                        Envia resumo das detecções para o número externo todo dia
                      </p>
                    </div>
                    <Switch
                      checked={config.daily_digest_enabled || false}
                      onCheckedChange={(v) => setConfig((c) => ({ ...c, daily_digest_enabled: v }))}
                    />
                  </div>
                  {config.daily_digest_enabled && (
                    <div className="space-y-1.5">
                      <Label>Horário do envio</Label>
                      <Select
                        value={String(config.daily_digest_hour ?? 8)}
                        onValueChange={(v) => setConfig((c) => ({ ...c, daily_digest_hour: parseInt(v) }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 24 }, (_, i) => (
                            <SelectItem key={i} value={String(i)}>{String(i).padStart(2, '0')}:00</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Configuração de IA</CardTitle>
                <CardDescription>
                  Deixe vazio para usar a IA configurada na organização
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Provedor</Label>
                    <Select
                      value={config.ai_provider || "default"}
                      onValueChange={(v) =>
                        setConfig((c) => ({ ...c, ai_provider: v === "default" ? null : v }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Padrão da organização" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Padrão da organização</SelectItem>
                        <SelectItem value="openai">OpenAI</SelectItem>
                        <SelectItem value="gemini">Gemini</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Modelo</Label>
                    <Input
                      value={config.ai_model || ""}
                      onChange={(e) => setConfig((c) => ({ ...c, ai_model: e.target.value || null }))}
                      placeholder="Ex: gpt-4o-mini"
                    />
                  </div>
                </div>
                {config.ai_provider && config.ai_provider !== "default" && (
                  <div className="space-y-1.5">
                    <Label>API Key (específica)</Label>
                    <Input
                      type="password"
                      value={config.ai_api_key || ""}
                      onChange={(e) => setConfig((c) => ({ ...c, ai_api_key: e.target.value || null }))}
                      placeholder="sk-..."
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            <Button onClick={handleSaveConfig} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar Configurações
            </Button>
          </TabsContent>

          {/* STATS TAB */}
          <TabsContent value="stats" className="space-y-4">
            {!stats ? (
              <Card><CardContent className="p-8 text-center text-muted-foreground">
                <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>Nenhuma estatística disponível ainda</p>
              </CardContent></Card>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Card><CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold">{stats.overall.total}</p>
                    <p className="text-xs text-muted-foreground">Detecções (7d)</p>
                  </CardContent></Card>
                  <Card><CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold">{stats.overall.matched}</p>
                    <p className="text-xs text-muted-foreground">Com responsável</p>
                  </CardContent></Card>
                  <Card><CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold text-destructive">{stats.overall.urgent}</p>
                    <p className="text-xs text-muted-foreground">Urgentes</p>
                  </CardContent></Card>
                  <Card><CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold">{stats.overall.avg_processing_ms}ms</p>
                    <p className="text-xs text-muted-foreground">Tempo médio</p>
                  </CardContent></Card>
                </div>

                <Card>
                  <CardHeader><CardTitle className="text-base">Carga por Membro</CardTitle></CardHeader>
                  <CardContent>
                    {stats.members.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Sem dados no período</p>
                    ) : (
                      <div className="space-y-3">
                        {stats.members.map((m) => {
                          const pending = stats.pending_tasks.find(p => p.assigned_to === m.matched_user_id);
                          return (
                            <div key={m.matched_user_id} className="flex items-center justify-between p-2 rounded-md border">
                              <div>
                                <span className="font-medium text-sm">{m.matched_user_name}</span>
                                <div className="flex gap-2 mt-0.5">
                                  <Badge variant="secondary" className="text-xs">{m.total_requests} solicitações</Badge>
                                  {parseInt(m.urgent_count) > 0 && <Badge variant="destructive" className="text-xs">{m.urgent_count} urgentes</Badge>}
                                  {pending && <Badge variant="outline" className="text-xs">⏳ {pending.pending_count} pendentes</Badge>}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="w-24 bg-muted rounded-full h-2">
                                  <div
                                    className="bg-primary rounded-full h-2"
                                    style={{ width: `${Math.min(100, (parseInt(m.total_requests) / Math.max(1, parseInt(stats.members[0]?.total_requests || '1'))) * 100)}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* LOGS TAB */}
          <TabsContent value="logs" className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Últimas detecções da secretária IA
            </p>

            {logs.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  <Activity className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>Nenhuma detecção registrada</p>
                </CardContent>
              </Card>
            ) : (
              <ScrollArea className="h-[500px]">
                <div className="space-y-2">
                  {logs.map((log) => (
                    <Card key={log.id}>
                      <CardContent className="p-3 space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Shield className="h-3.5 w-3.5 text-primary" />
                            <span className="text-sm font-medium">
                              {log.detected_request || "Sem descrição"}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {formatDistanceToNow(new Date(log.created_at), {
                              addSuffix: true,
                              locale: ptBR,
                            })}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground pl-5 space-y-0.5">
                          <p>
                            <strong>Grupo:</strong> {log.group_name || "—"} •{" "}
                            <strong>De:</strong> {log.sender_name || "—"}
                          </p>
                          <p>
                            <strong>Responsável:</strong>{" "}
                            {log.matched_user_name || "Não identificado"} •{" "}
                            <strong>Confiança:</strong>{" "}
                            {Math.round((log.confidence || 0) * 100)}%
                          </p>
                          {log.message_content && (
                            <p className="italic truncate max-w-md">
                              "{log.message_content}"
                            </p>
                          )}
                          <div className="flex gap-2 mt-1">
                            {log.crm_task_id && (
                              <Badge variant="outline" className="text-xs">
                                Tarefa CRM criada
                              </Badge>
                            )}
                            {log.alert_id && (
                              <Badge variant="outline" className="text-xs">
                                Popup enviado
                              </Badge>
                            )}
                            {log.processing_time_ms && (
                              <Badge variant="secondary" className="text-xs">
                                {log.processing_time_ms}ms
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>
        </Tabs>

        {/* ADD MEMBER DIALOG */}
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar Membro</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Usuário</Label>
                <Select
                  value={newMember.user_id}
                  onValueChange={(v) => setNewMember((p) => ({ ...p, user_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableUsers
                      .filter((u) => !members.some((m) => m.user_id === u.id))
                      .map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name} ({u.email})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Apelidos (separados por vírgula)</Label>
                <Input
                  value={newMember.aliases}
                  onChange={(e) => setNewMember((p) => ({ ...p, aliases: e.target.value }))}
                  placeholder="Ex: João, Joãozinho, JM"
                />
                <p className="text-xs text-muted-foreground">
                  Nomes pelos quais a pessoa é chamada nos grupos
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Áreas/Departamentos (separados por vírgula)</Label>
                <Input
                  value={newMember.departments}
                  onChange={(e) => setNewMember((p) => ({ ...p, departments: e.target.value }))}
                  placeholder="Ex: Financeiro, Vendas, Suporte"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Descrição do cargo</Label>
                <Textarea
                  value={newMember.role_description}
                  onChange={(e) => setNewMember((p) => ({ ...p, role_description: e.target.value }))}
                  placeholder="Ex: Responsável pelo financeiro e cobranças"
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleAddMember}>Adicionar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* EDIT PHONE DIALOG */}
        <Dialog open={phoneDialogOpen} onOpenChange={setPhoneDialogOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                Cadastrar WhatsApp
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Informe o número WhatsApp de <strong>{editingPhoneMember?.user_name}</strong> para receber notificações da Secretária IA.
              </p>
              <div className="space-y-1.5">
                <Label>Número WhatsApp</Label>
                <Input
                  value={editingPhone}
                  onChange={(e) => setEditingPhone(e.target.value)}
                  placeholder="5511999999999 (com DDI)"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPhoneDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSavePhone}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
