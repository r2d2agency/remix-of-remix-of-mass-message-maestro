import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { FileSignature, Send, Loader2, Mail, MessageSquare, Calendar } from "lucide-react";
import { toast } from "sonner";

interface DigitalSignatureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSend?: (data: any) => Promise<void>;
}

export function DigitalSignatureDialog({
  open,
  onOpenChange,
  onSend,
}: DigitalSignatureDialogProps) {
  const [loading, setLoading] = useState(false);
  const [documentName, setDocumentName] = useState("");
  const [channel, setChannel] = useState("whatsapp");
  const [deadline, setDeadline] = useState(new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]);

  const handleSend = async () => {
    if (!documentName.trim()) {
      toast.error("Por favor, informe o nome do documento");
      return;
    }

    setLoading(true);
    try {
      if (onSend) {
        await onSend({
          name: documentName,
          channel,
          deadline
        });
      }
      toast.success("Solicitação de assinatura enviada com sucesso!");
      onOpenChange(false);
    } catch (error) {
      toast.error("Erro ao enviar solicitação");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSignature className="h-5 w-5 text-primary" />
            Solicitar Assinatura Digital
          </DialogTitle>
          <DialogDescription>
            O cliente receberá um link seguro para visualizar e assinar o documento.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="docName">Nome do Documento / Contrato</Label>
            <Input
              id="docName"
              placeholder="Ex: Contrato de Prestação de Serviços"
              value={documentName}
              onChange={(e) => setDocumentName(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Canal de Envio</Label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      WhatsApp
                    </div>
                  </SelectItem>
                  <SelectItem value="email">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      E-mail
                    </div>
                  </SelectItem>
                  <SelectItem value="both">Ambos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Prazo</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input 
                  type="date" 
                  className="pl-9 h-10" 
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Validação e Segurança</Label>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox id="reminders" defaultChecked />
                <label htmlFor="reminders" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Lembretes automáticos
                </label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="ip" defaultChecked disabled />
                <label htmlFor="ip" className="text-sm font-medium leading-none text-muted-foreground">
                  Registro de IP e Dispositivo (Obrigatório)
                </label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="selfie" />
                <label htmlFor="selfie" className="text-sm font-medium leading-none">
                  Solicitar Selfie do Assinante
                </label>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSend} disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Enviar Link de Assinatura
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
