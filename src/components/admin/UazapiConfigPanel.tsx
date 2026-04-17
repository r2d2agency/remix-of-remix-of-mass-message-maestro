import { useEffect, useState } from "react";
import { uazapiApi, type UazapiServer } from "@/lib/uazapi-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Plus, Server, Trash2, CheckCircle2, XCircle, Pencil } from "lucide-react";

export function UazapiConfigPanel() {
  const [servers, setServers] = useState<UazapiServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<UazapiServer | null>(null);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    server_url: "",
    admin_token: "",
    is_default: true,
    notes: "",
  });

  const load = async () => {
    setLoading(true);
    try {
      setServers(await uazapiApi.listServers());
    } catch (e) {
      toast.error("Erro ao carregar servidores UAZAPI");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const reset = () => {
    setForm({ name: "", server_url: "", admin_token: "", is_default: true, notes: "" });
    setEditing(null);
  };

  const startEdit = (s: UazapiServer) => {
    setEditing(s);
    setForm({
      name: s.name,
      server_url: s.server_url,
      admin_token: "",
      is_default: s.is_default,
      notes: s.notes || "",
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name || !form.server_url || (!editing && !form.admin_token)) {
      toast.error("Nome, URL e admin token são obrigatórios");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await uazapiApi.updateServer(editing.id, {
          name: form.name,
          server_url: form.server_url,
          ...(form.admin_token ? { admin_token: form.admin_token } : {}),
          is_default: form.is_default,
          notes: form.notes,
        });
        toast.success("Servidor atualizado");
      } else {
        await uazapiApi.createServer(form);
        toast.success("Servidor cadastrado");
      }
      setOpen(false);
      reset();
      load();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (s: UazapiServer) => {
    if (!confirm(`Remover servidor "${s.name}"?`)) return;
    try {
      await uazapiApi.deleteServer(s.id);
      toast.success("Removido");
      load();
    } catch {
      toast.error("Erro ao remover");
    }
  };

  const test = async (s: UazapiServer) => {
    setTestingId(s.id);
    try {
      const r = await uazapiApi.testServer(s.id);
      if (r.ok) toast.success("Conexão OK com o servidor UAZAPI");
      else toast.error(`Falha (HTTP ${r.status})`);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao testar");
    } finally {
      setTestingId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            UAZAPI — Servidores Globais
          </CardTitle>
          <CardDescription>
            Configure o servidor UAZAPI usado pelas organizações para criar instâncias.
            O servidor padrão é o usado por todos os clientes.
          </CardDescription>
        </div>

        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) reset();
          }}
        >
          <DialogTrigger asChild>
            <Button variant="gradient">
              <Plus className="h-4 w-4 mr-2" />
              Novo Servidor
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Editar servidor UAZAPI" : "Novo servidor UAZAPI"}</DialogTitle>
              <DialogDescription>
                Os clientes usarão esse servidor para criar instâncias e conectar números.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Nome interno</Label>
                <Input
                  placeholder="Ex: UAZAPI Produção"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>URL do servidor</Label>
                <Input
                  placeholder="https://meu-servidor.uazapi.com"
                  value={form.server_url}
                  onChange={(e) => setForm({ ...form, server_url: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Admin Token {editing && <span className="text-xs text-muted-foreground">(deixe vazio para manter)</span>}</Label>
                <Input
                  type="password"
                  placeholder="admintoken do servidor"
                  value={form.admin_token}
                  onChange={(e) => setForm({ ...form, admin_token: e.target.value })}
                />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">Servidor padrão</p>
                  <p className="text-xs text-muted-foreground">Usado para criar novas instâncias</p>
                </div>
                <Switch
                  checked={form.is_default}
                  onCheckedChange={(v) => setForm({ ...form, is_default: v })}
                />
              </div>
              <div className="space-y-1">
                <Label>Observações</Label>
                <Textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={save} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>

      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : servers.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nenhum servidor UAZAPI cadastrado. Adicione um para que os clientes possam criar instâncias.
          </div>
        ) : (
          servers.map((s) => (
            <div
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
            >
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{s.name}</span>
                  {s.is_default && <Badge variant="default">Padrão</Badge>}
                  {s.is_active ? (
                    <Badge variant="secondary" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Ativo
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1">
                      <XCircle className="h-3 w-3" /> Inativo
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">{s.server_url}</p>
                {s.notes && <p className="text-xs text-muted-foreground">{s.notes}</p>}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => test(s)}
                  disabled={testingId === s.id}
                >
                  {testingId === s.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Testar"
                  )}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => startEdit(s)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove(s)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
