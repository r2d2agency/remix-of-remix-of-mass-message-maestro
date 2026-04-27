import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Upload, Loader2, FileText, X, ClipboardPaste } from "lucide-react";
import { addDocument } from "@/hooks/use-documents-store";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface DocumentUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TYPE_LABELS: Record<string, string> = {
  contrato: "Contrato de honorários",
  procuracao: "Procuração",
  declaracao: "Declaração",
  termo: "Termo de ciência",
  outro: "Outros",
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function DocumentUploadDialog({ open, onOpenChange }: DocumentUploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState<"draft" | "in_analysis">("draft");
  const [client, setClient] = useState("");
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setName("");
      setType("");
      setClient("");
      setStatus("draft");
      setProgress(0);
      setUploading(false);
      setDragOver(false);
    }
  }, [open]);

  const handleSetFile = (f: File | null) => {
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      toast({ title: "Arquivo muito grande", description: "O limite é 10MB.", variant: "destructive" });
      return;
    }
    setFile(f);
    if (!name) setName(f.name.replace(/\.[^.]+$/, ""));
  };

  // Paste (Ctrl+V) support while dialog is open
  useEffect(() => {
    if (!open) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.kind === "file") {
          const f = it.getAsFile();
          if (f) {
            handleSetFile(f);
            toast({ title: "Arquivo colado", description: f.name });
            e.preventDefault();
            break;
          }
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleSetFile(f);
  };

  const handleUpload = async () => {
    if (!file) {
      toast({ title: "Selecione um arquivo", description: "Arraste, cole (Ctrl+V) ou clique para escolher.", variant: "destructive" });
      return;
    }
    if (!name.trim()) {
      toast({ title: "Informe o nome do documento", variant: "destructive" });
      return;
    }
    setUploading(true);
    setProgress(0);

    // Simulated progressive upload
    await new Promise<void>((resolve) => {
      let p = 0;
      const tick = () => {
        p += Math.random() * 18 + 8;
        if (p >= 100) {
          setProgress(100);
          setTimeout(resolve, 250);
        } else {
          setProgress(Math.min(99, Math.round(p)));
          setTimeout(tick, 180);
        }
      };
      tick();
    });

    addDocument({
      name: name.trim(),
      client_name: client.trim() || "—",
      type: TYPE_LABELS[type] || "Outros",
      status,
      responsible_name: "Você",
      file_name: file.name,
      file_size: file.size,
      file_type: file.type,
    });

    toast({ title: "Documento cadastrado", description: name });
    setUploading(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Novo Documento</DialogTitle>
          <DialogDescription>
            Arraste um arquivo, cole com Ctrl+V ou clique para selecionar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Arquivo</Label>
            <div
              ref={dropRef}
              onClick={() => !file && inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={cn(
                "border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center gap-2 transition-colors min-h-[160px]",
                dragOver ? "border-primary bg-primary/5" : "border-border",
                !file && "cursor-pointer hover:bg-muted/50"
              )}
            >
              {file ? (
                <div className="w-full space-y-3">
                  <div className="flex items-center gap-3 p-3 rounded-md bg-muted/50">
                    <FileText className="h-8 w-8 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
                    </div>
                    {!uploading && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => { e.stopPropagation(); setFile(null); setProgress(0); }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  {(uploading || progress > 0) && (
                    <div className="space-y-1">
                      <Progress value={progress} className="h-2" />
                      <p className="text-xs text-muted-foreground text-right">{progress}%</p>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Arraste um arquivo ou clique para selecionar</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <ClipboardPaste className="h-3 w-3" /> Ou cole com Ctrl+V
                  </p>
                  <p className="text-xs text-muted-foreground">PDF, DOCX, JPG, PNG (máx 10MB)</p>
                </>
              )}
              <input
                ref={inputRef}
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,image/*,application/pdf"
                onChange={(e) => handleSetFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Nome do Documento</Label>
            <Input id="name" placeholder="Ex: Contrato de Honorários - João Silva" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="client">Cliente</Label>
            <Input id="client" placeholder="Nome do cliente" value={client} onChange={(e) => setClient(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="contrato">Contrato de honorários</SelectItem>
                  <SelectItem value="procuracao">Procuração</SelectItem>
                  <SelectItem value="declaracao">Declaração</SelectItem>
                  <SelectItem value="termo">Termo de ciência</SelectItem>
                  <SelectItem value="outro">Outros</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status Inicial</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as "draft" | "in_analysis")}>
                <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Rascunho</SelectItem>
                  <SelectItem value="in_analysis">Em análise</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={uploading}>Cancelar</Button>
          <Button onClick={handleUpload} disabled={uploading}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {uploading ? "Enviando..." : "Cadastrar Documento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
