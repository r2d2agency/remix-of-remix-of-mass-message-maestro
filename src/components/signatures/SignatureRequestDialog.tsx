import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Mail, MessageSquare, Calendar } from "lucide-react";

interface SignatureRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SignatureRequestDialog({ open, onOpenChange }: SignatureRequestDialogProps) {
  const [loading, setLoading] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState("");
  const [selectedClient, setSelectedClient] = useState("");
  const [channel, setChannel] = useState("whatsapp");

  const handleSend = async () => {
    setLoading(true);
    // Simular envio
    setTimeout(() => {
      setLoading(false);
      onOpenChange(false);
    }, 1500);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>Solicitar Assinatura Eletrônica</DialogTitle>
          <DialogDescription>
            Envie um documento para assinatura segura via WhatsApp ou E-mail.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Documento para Assinar</Label>
            <Select value={selectedDoc} onValueChange={setSelectedDoc}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um documento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Contrato de Honorários - João Silva.pdf</SelectItem>
                <SelectItem value="2">Procuração Ad Judicia.pdf</SelectItem>
                <SelectItem value="upload">+ Fazer upload de novo arquivo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Cliente / Assinante</Label>
            <Select value={selectedClient} onValueChange={setSelectedClient}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o cliente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="c1">João Silva (CPF: 123.***.***-00)</SelectItem>
                <SelectItem value="c2">Maria Oliveira (CPF: 456.***.***-11)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Canal de Envio</Label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger>
                  <SelectValue placeholder="Canal" />
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
                  <SelectItem value="both">WhatsApp + E-mail</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Prazo para Assinatura</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input type="date" className="pl-10" defaultValue={new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]} />
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <Label className="text-sm font-semibold">Configurações Adicionais</Label>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox id="reminders" defaultChecked />
                <label htmlFor="reminders" className="text-sm">Lembretes automáticos (diários)</label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="selfie" />
                <label htmlFor="selfie" className="text-sm">Solicitar selfie do assinante</label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="doc_photo" />
                <label htmlFor="doc_photo" className="text-sm">Solicitar foto do documento (RG/CNH)</label>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSend} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Enviar Solicitação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
