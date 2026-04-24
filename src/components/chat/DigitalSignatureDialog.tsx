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
import { FileSignature, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface DigitalSignatureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSend: (documentName: string) => Promise<void>;
}

export function DigitalSignatureDialog({
  open,
  onOpenChange,
  onSend,
}: DigitalSignatureDialogProps) {
  const [documentName, setDocumentName] = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!documentName.trim()) {
      toast.error("Por favor, informe o nome ou descrição do documento");
      return;
    }

    setSending(true);
    try {
      await onSend(documentName);
      toast.success("Solicitação de assinatura enviada!");
      setDocumentName("");
      onOpenChange(false);
    } catch (error) {
      toast.error("Erro ao enviar solicitação de assinatura");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSignature className="h-5 w-5 text-primary" />
            Solicitar Assinatura Digital
          </DialogTitle>
          <DialogDescription>
            Envie um link para o cliente assinar um documento digitalmente.
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
              disabled={sending}
            />
          </div>
          <div className="bg-muted p-3 rounded-md text-xs text-muted-foreground">
            <p>O cliente receberá uma mensagem com o link seguro para assinatura eletrônica via plataforma integrada.</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancelar
          </Button>
          <Button onClick={handleSend} disabled={sending}>
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Enviar Solicitação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
