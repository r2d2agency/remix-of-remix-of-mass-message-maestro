import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmailTemplate, useEmailTemplateMutations } from "@/hooks/use-email";
import { RichEmailEditor } from "./RichEmailEditor";
import { EMAIL_TEMPLATE_PRESETS, EmailTemplatePreset } from "./email-template-presets";
import { Loader2, Sparkles, FileText, Mail, ShoppingCart, Book, Users, Briefcase, Eye, Scale } from "lucide-react";
import { cn } from "@/lib/utils";

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
  { value: "general", label: "Geral", icon: Mail },
  { value: "crm", label: "CRM", icon: Briefcase },
  { value: "campaign", label: "Campanhas", icon: ShoppingCart },
  { value: "flow", label: "Fluxos", icon: FileText },
  { value: "juridico", label: "Jurídico", icon: Scale },
];

const getCategoryIcon = (category: string) => {
  const cat = CATEGORIES.find(c => c.value === category);
  return cat?.icon || Mail;
};

export function EmailTemplateEditor({ template, open, onOpenChange }: EmailTemplateEditorProps) {
  const { createTemplate, updateTemplate } = useEmailTemplateMutations();
  const [activeTab, setActiveTab] = useState<string>("editor");
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [showPreview, setShowPreview] = useState(false);
  
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
      setActiveTab("editor");
    } else {
      setForm({
        name: "",
        description: "",
        category: "general",
        subject: "",
        body_html: "",
        body_text: "",
      });
      setActiveTab("templates");
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

  const usePreset = (preset: EmailTemplatePreset) => {
    setForm({
      name: preset.name,
      description: preset.description,
      category: preset.category,
      subject: preset.subject,
      body_html: preset.body_html,
      body_text: "",
    });
    setActiveTab("editor");
  };

  const handlePreview = () => {
    // Replace variables with example values for preview
    let html = form.body_html;
    html = html.replace(/{nome}/g, "João Silva");
    html = html.replace(/{email}/g, "joao@exemplo.com");
    html = html.replace(/{telefone}/g, "(11) 99999-9999");
    html = html.replace(/{empresa}/g, "Sua Empresa");
    html = html.replace(/{deal_title}/g, "Proposta Comercial");
    html = html.replace(/{valor}/g, "R$ 1.500,00");
    html = html.replace(/{etapa}/g, "Negociação");
    html = html.replace(/{funil}/g, "Vendas");
    html = html.replace(/{data}/g, new Date().toLocaleDateString("pt-BR"));
    setPreviewHtml(html);
    setShowPreview(true);
  };

  const isPending = createTemplate.isPending || updateTemplate.isPending;

  const groupedPresets = {
    welcome: EMAIL_TEMPLATE_PRESETS.filter(p => p.id.includes("welcome")),
    course: EMAIL_TEMPLATE_PRESETS.filter(p => p.id.includes("course")),
    ebook: EMAIL_TEMPLATE_PRESETS.filter(p => p.id.includes("ebook")),
    crm: EMAIL_TEMPLATE_PRESETS.filter(p => p.id.includes("crm")),
    legal: EMAIL_TEMPLATE_PRESETS.filter(p => p.category === "juridico"),
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[95vh] flex flex-col p-0 gap-0" aria-describedby={undefined}>
          <DialogHeader className="p-6 pb-4 border-b">
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              {template ? "Editar Template" : "Novo Template de Email"}
            </DialogTitle>
            <DialogDescription>
              {template ? "Edite o template de email existente" : "Crie um novo template ou comece a partir de um modelo pronto"}
            </DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
            <div className="border-b px-6">
              <TabsList className="h-12 bg-transparent">
                <TabsTrigger value="templates" className="gap-2" disabled={!!template}>
                  <Sparkles className="h-4 w-4" />
                  Templates Prontos
                </TabsTrigger>
                <TabsTrigger value="editor" className="gap-2">
                  <FileText className="h-4 w-4" />
                  Editor
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-hidden">
              {/* Templates Tab */}
              <TabsContent value="templates" className="m-0 h-full">
                <ScrollArea className="h-[calc(95vh-200px)]">
                  <div className="p-6 space-y-8">
                    {/* Welcome Templates */}
                    <div>
                      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <Users className="h-5 w-5 text-blue-500" />
                        Boas-vindas
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {groupedPresets.welcome.map((preset) => (
                          <PresetCard key={preset.id} preset={preset} onUse={usePreset} />
                        ))}
                      </div>
                    </div>

                    {/* Course Templates */}
                    <div>
                      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <ShoppingCart className="h-5 w-5 text-purple-500" />
                        Vendas de Cursos
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {groupedPresets.course.map((preset) => (
                          <PresetCard key={preset.id} preset={preset} onUse={usePreset} />
                        ))}
                      </div>
                    </div>

                    {/* E-book Templates */}
                    <div>
                      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <Book className="h-5 w-5 text-orange-500" />
                        E-books
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {groupedPresets.ebook.map((preset) => (
                          <PresetCard key={preset.id} preset={preset} onUse={usePreset} />
                        ))}
                      </div>
                    </div>

                    {/* CRM Templates */}
                    <div>
                      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <Briefcase className="h-5 w-5 text-green-500" />
                        CRM / Comercial
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {groupedPresets.crm.map((preset) => (
                          <PresetCard key={preset.id} preset={preset} onUse={usePreset} />
                        ))}
                      </div>
                    </div>

                    {/* Legal Templates */}
                    <div>
                      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <Scale className="h-5 w-5 text-slate-500" />
                        Jurídico
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {groupedPresets.legal.map((preset) => (
                          <PresetCard key={preset.id} preset={preset} onUse={usePreset} />
                        ))}
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>

              {/* Editor Tab */}
              <TabsContent value="editor" className="m-0 h-full">
                <ScrollArea className="h-[calc(95vh-200px)]">
                  <div className="p-6 space-y-4">
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
                            {CATEGORIES.map(cat => {
                              const Icon = cat.icon;
                              return (
                                <SelectItem key={cat.value} value={cat.value}>
                                  <div className="flex items-center gap-2">
                                    <Icon className="h-4 w-4" />
                                    {cat.label}
                                  </div>
                                </SelectItem>
                              );
                            })}
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
                      <Label className="text-sm">Variáveis disponíveis (clique para inserir no corpo)</Label>
                      <div className="flex flex-wrap gap-1">
                        {AVAILABLE_VARIABLES.map(v => (
                          <Badge
                            key={v.key}
                            variant="outline"
                            className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                            onClick={() => insertVariable(v.key)}
                          >
                            {`{${v.key}}`}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Corpo do email *</Label>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handlePreview}
                          disabled={!form.body_html}
                          type="button"
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          Preview
                        </Button>
                      </div>
                      <RichEmailEditor
                        value={form.body_html}
                        onChange={(html) => setForm({ ...form, body_html: html })}
                        placeholder="Comece a escrever seu email..."
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
                </ScrollArea>
              </TabsContent>
            </div>
          </Tabs>

          <DialogFooter className="p-6 pt-4 border-t">
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

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-3xl max-h-[90vh]" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Preview do Email</DialogTitle>
            <DialogDescription>
              Assunto: {form.subject.replace(/{nome}/g, "João Silva")}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh]">
            <div 
              className="bg-white rounded-lg"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Preset Card Component
function PresetCard({ preset, onUse }: { preset: EmailTemplatePreset; onUse: (p: EmailTemplatePreset) => void }) {
  const [showPreview, setShowPreview] = useState(false);
  const Icon = getCategoryIcon(preset.category);

  return (
    <>
      <Card className="p-4 hover:border-primary/50 transition-colors group">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-muted">
              <Icon className="h-4 w-4" />
            </div>
            <div>
              <h4 className="font-medium text-sm">{preset.name}</h4>
              <p className="text-xs text-muted-foreground line-clamp-1">{preset.description}</p>
            </div>
          </div>
        </div>
        
        <div className="text-xs text-muted-foreground mb-3 line-clamp-1">
          <strong>Assunto:</strong> {preset.subject}
        </div>
        
        {/* Mini Preview */}
        <div 
          className="bg-muted/50 rounded-lg p-3 h-24 overflow-hidden text-xs mb-3 cursor-pointer hover:bg-muted transition-colors"
          onClick={() => setShowPreview(true)}
          dangerouslySetInnerHTML={{ 
            __html: preset.body_html.slice(0, 500) + "..." 
          }}
          style={{ transform: "scale(0.7)", transformOrigin: "top left", width: "143%" }}
        />
        
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => setShowPreview(true)}
          >
            <Eye className="h-3 w-3 mr-1" />
            Preview
          </Button>
          <Button
            size="sm"
            className="flex-1"
            onClick={() => onUse(preset)}
          >
            Usar este
          </Button>
        </div>
      </Card>

      {/* Full Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-3xl max-h-[90vh]" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{preset.name}</DialogTitle>
            <DialogDescription>
              Assunto: {preset.subject}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[65vh]">
            <div 
              className="bg-white rounded-lg"
              dangerouslySetInnerHTML={{ __html: preset.body_html }}
            />
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreview(false)}>
              Fechar
            </Button>
            <Button onClick={() => { onUse(preset); setShowPreview(false); }}>
              Usar este Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}