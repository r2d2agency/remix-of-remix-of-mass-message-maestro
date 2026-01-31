import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Mail, Send, AlertCircle } from "lucide-react";
import { useSMTPStatus, useEmailTemplates, useSendEmail } from "@/hooks/use-email";
import { toast } from "sonner";

interface SendEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Pre-filled data
  toEmail?: string;
  toName?: string;
  contextType?: string;
  contextId?: string;
  // Variables for template interpolation
  variables?: Record<string, string>;
}

export function SendEmailDialog({ 
  open, 
  onOpenChange,
  toEmail = "",
  toName = "",
  contextType,
  contextId,
  variables = {}
}: SendEmailDialogProps) {
  const { data: smtpStatus, isLoading: loadingStatus } = useSMTPStatus();
  const { data: templates = [] } = useEmailTemplates();
  const sendEmail = useSendEmail();

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [form, setForm] = useState({
    to_email: "",
    to_name: "",
    subject: "",
    body_html: "",
  });

  // Reset form when dialog opens with new data
  useEffect(() => {
    if (open) {
      setForm({
        to_email: toEmail,
        to_name: toName,
        subject: "",
        body_html: "",
      });
      setSelectedTemplateId("");
    }
  }, [open, toEmail, toName]);

  // Apply template when selected
  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    
    if (templateId === "custom") {
      return;
    }

    const template = templates.find(t => t.id === templateId);
    if (template) {
      // Interpolate variables
      let subject = template.subject;
      let body = template.body_html;

      Object.entries(variables).forEach(([key, value]) => {
        const regex = new RegExp(`\\{\\s*${key}\\s*\\}`, 'gi');
        subject = subject.replace(regex, value || '');
        body = body.replace(regex, value || '');
      });

      setForm(prev => ({
        ...prev,
        subject,
        body_html: body,
      }));
    }
  };

  const handleSend = async () => {
    if (!form.to_email) {
      toast.error("Email do destinatário é obrigatório");
      return;
    }
    if (!form.subject) {
      toast.error("Assunto é obrigatório");
      return;
    }

    try {
      await sendEmail.mutateAsync({
        to_email: form.to_email,
        to_name: form.to_name,
        subject: form.subject,
        body_html: form.body_html,
        template_id: selectedTemplateId && selectedTemplateId !== "custom" ? selectedTemplateId : undefined,
        variables,
        context_type: contextType,
        context_id: contextId,
        send_immediately: true,
      });
      onOpenChange(false);
    } catch (error) {
      // Error is handled by the mutation
    }
  };

  const isConfigured = smtpStatus?.configured && smtpStatus?.verified;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Enviar E-mail
          </DialogTitle>
        </DialogHeader>

        {loadingStatus ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : !isConfigured ? (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <AlertCircle className="h-12 w-12 text-yellow-500" />
            <div>
              <p className="font-medium">SMTP não configurado</p>
              <p className="text-sm text-muted-foreground">
                Configure o servidor SMTP em Configurações → E-mail antes de enviar emails.
              </p>
            </div>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Template selector */}
            <div className="space-y-2">
              <Label>Template</Label>
              <Select value={selectedTemplateId} onValueChange={handleTemplateSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um template ou escreva do zero" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">Escrever do zero</SelectItem>
                  {templates.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Recipient */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Email do destinatário *</Label>
                <Input
                  type="email"
                  value={form.to_email}
                  onChange={(e) => setForm({ ...form, to_email: e.target.value })}
                  placeholder="email@exemplo.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Nome (opcional)</Label>
                <Input
                  value={form.to_name}
                  onChange={(e) => setForm({ ...form, to_name: e.target.value })}
                  placeholder="Nome do destinatário"
                />
              </div>
            </div>

            {/* Subject */}
            <div className="space-y-2">
              <Label>Assunto *</Label>
              <Input
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                placeholder="Assunto do email"
              />
            </div>

            {/* Body */}
            <div className="space-y-2">
              <Label>Mensagem</Label>
              <Textarea
                value={form.body_html}
                onChange={(e) => setForm({ ...form, body_html: e.target.value })}
                placeholder="Escreva sua mensagem..."
                rows={8}
                className="resize-none"
              />
            </div>

            {/* Variables info */}
            {Object.keys(variables).length > 0 && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground mb-2">Variáveis disponíveis:</p>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(variables).map(([key, value]) => (
                    <Badge key={key} variant="secondary" className="text-xs">
                      {`{${key}}`}: {value || "(vazio)"}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSend} disabled={sendEmail.isPending}>
                {sendEmail.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Enviar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
