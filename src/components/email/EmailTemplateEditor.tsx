import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { EmailTemplate, useEmailTemplateMutations } from "@/hooks/use-email";
import { Loader2 } from "lucide-react";

interface EmailTemplateEditorProps {
  template: EmailTemplate | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const AVAILABLE_VARIABLES = [
  { key: "nome", label: "Nome do contato" },
  { key: "email", label: "Email do contato" },
  { key: "telefone", label: "Telefone do contato" },
  { key: "empresa", label: "Nome da empresa" },
  { key: "deal_title", label: "Título da negociação" },
  { key: "valor", label: "Valor da negociação" },
  { key: "etapa", label: "Etapa atual" },
  { key: "funil", label: "Nome do funil" },
  { key: "data", label: "Data atual" },
];

const CATEGORIES = [
  { value: "general", label: "Geral" },
  { value: "crm", label: "CRM" },
  { value: "campaign", label: "Campanhas" },
  { value: "flow", label: "Fluxos" },
];

export function EmailTemplateEditor({ template, open, onOpenChange }: EmailTemplateEditorProps) {
  const { createTemplate, updateTemplate } = useEmailTemplateMutations();
  
  const [form, setForm] = useState({
    name: "",
    description: "",
    category: "general",
    subject: "",
    body_html: "",
    body_text: "",
  });

  useEffect(() => {
    if (template) {
      setForm({
        name: template.name,
        description: template.description || "",
        category: template.category,
        subject: template.subject,
        body_html: template.body_html,
        body_text: template.body_text || "",
      });
    } else {
      setForm({
        name: "",
        description: "",
        category: "general",
        subject: "",
        body_html: "",
        body_text: "",
      });
    }
  }, [template, open]);

  const handleSave = () => {
    if (!form.name || !form.subject || !form.body_html) {
      return;
    }

    if (template) {
      updateTemplate.mutate({ id: template.id, ...form });
    } else {
      createTemplate.mutate(form);
    }
    onOpenChange(false);
  };

  const insertVariable = (key: string) => {
    const variable = `{${key}}`;
    setForm(prev => ({
      ...prev,
      body_html: prev.body_html + variable,
    }));
  };

  const isPending = createTemplate.isPending || updateTemplate.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{template ? "Editar Template" : "Novo Template de Email"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome do template *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex: Boas-vindas"
              />
            </div>
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm({ ...form, category: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(cat => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Descrição</Label>
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Descrição breve do template"
            />
          </div>

          <div className="space-y-2">
            <Label>Assunto *</Label>
            <Input
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              placeholder="Ex: Olá {nome}, temos novidades!"
            />
          </div>

          {/* Variables */}
          <div className="space-y-2">
            <Label className="text-sm">Variáveis disponíveis (clique para inserir)</Label>
            <div className="flex flex-wrap gap-1">
              {AVAILABLE_VARIABLES.map(v => (
                <Badge
                  key={v.key}
                  variant="outline"
                  className="cursor-pointer hover:bg-primary hover:text-primary-foreground"
                  onClick={() => insertVariable(v.key)}
                >
                  {`{${v.key}}`}
                </Badge>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Corpo do email (HTML) *</Label>
            <Textarea
              value={form.body_html}
              onChange={(e) => setForm({ ...form, body_html: e.target.value })}
              placeholder="<h1>Olá {nome}</h1><p>Seu email aqui...</p>"
              rows={12}
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label>Versão texto (opcional)</Label>
            <Textarea
              value={form.body_text}
              onChange={(e) => setForm({ ...form, body_text: e.target.value })}
              placeholder="Versão sem formatação para clientes de email antigos"
              rows={4}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={!form.name || !form.subject || !form.body_html || isPending}
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {template ? "Salvar" : "Criar Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
