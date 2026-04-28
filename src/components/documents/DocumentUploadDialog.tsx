import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Upload, Loader2, FileText, X, ClipboardPaste } from "lucide-react";
import { addDocument, fileToDataURL } from "@/hooks/use-documents-store";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface DocumentUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultClientName?: string | null;
  defaultClientPhone?: string | null;
  lockClient?: boolean;
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

export function DocumentUploadDialog({ open, onOpenChange, defaultClientName, defaultClientPhone, lockClient }: DocumentUploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState("outro");
  const [status, setStatus] = useState<"draft" | "in_analysis">("draft");
  const [client, setClient] = useState(defaultClientName || "");
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setClient(defaultClientName || "");
    } else {
      setFile(null);
      setName("");
      setType("outro");
      setClient(defaultClientName || "");
      setStatus("draft");
      setProgress(0);
      setUploading(false);
      setDragOver(false);
    }
  }, [open, defaultClientName]);

  const handleSetFile = (f: File | null | undefined) => {
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      toast({ title: "Arquivo muito grande", description: "O limite é 10MB.", variant: "destructive" });
      return;
    }
    setFile(f);
    setName((prev) => prev || f.name.replace(/\.[^.]+$/, ""));
  };

  // Paste (Ctrl+V) — listener em document captura mesmo quando o foco está no overlay do Radix
  useEffect(() => {
    if (!open) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items || items.length === 0) return;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.kind === "file") {
          const f = it.getAsFile();
          if (f) {
            e.preventDefault();
            handleSetFile(f);
            toast({ title: "Arquivo colado", description: f.name });
            return;
          }
        }
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [open]);

  // Drag & Drop a nível de janela enquanto o dialog está aberto
  useEffect(() => {
    if (!open) return;
    const prevent = (e: DragEvent) => {
      e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer?.files?.[0];
      if (f) handleSetFile(f);
    };
    const onOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer?.types?.includes("Files")) setDragOver(true);
    };
    const onLeave = (e: DragEvent) => {
      if ((e as any).clientX === 0 && (e as any).clientY === 0) setDragOver(false);
    };
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    window.addEventListener("dragenter", prevent);
    return () => {
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("dragenter", prevent);
    };
  }, [open]);

  const openPicker = () => {
    inputRef.current?.click();
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

    try {
      let dataUrl: string | undefined;
      try {
        dataUrl = await fileToDataURL(file);
      } catch (e) {
        console.warn("Falha ao gerar dataURL", e);
      }

      addDocument({
        name: name.trim(),
        client_name: client.trim() || defaultClientName || "—",
        client_phone: defaultClientPhone || undefined,
        type: TYPE_LABELS[type] || "Outros",
        status,
        responsible_name: "Você",
        file_name: file.name,
        file_size: file.size,
        file_type: file.type,
        file_data_url: dataUrl,
      });
      toast({ title: "Documento cadastrado", description: name });
      setUploading(false);
      onOpenChange(false);
    } catch (err) {
      console.error("Erro ao salvar documento:", err);
      toast({ title: "Erro ao salvar", description: String(err), variant: "destructive" });
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent ref={contentRef} className="sm:max-w-[560px]">
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
              role="button"
              tabIndex={0}
              onClick={() => { if (!file) openPicker(); }}
              onKeyDown={(e) => { if (!file && (e.key === "Enter" || e.key === " ")) openPicker(); }}
              className={cn(
                "border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center gap-2 transition-colors min-h-[160px] outline-none",
                dragOver ? "border-primary bg-primary/10 ring-2 ring-primary/30" : "border-border",
                !file && "cursor-pointer hover:bg-muted/50"
              )}
            >
              {file ? (
                <div className="w-full space-y-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-3 p-3 rounded-md bg-muted/50">
                    <FileText className="h-8 w-8 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
                    </div>
                    {!uploading && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => { setFile(null); setProgress(0); }}
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
                  {!uploading && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={openPicker}
                    >
                      Trocar arquivo
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-muted-foreground pointer-events-none" />
                  <p className="text-sm text-muted-foreground pointer-events-none">Arraste um arquivo ou clique para selecionar</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 pointer-events-none">
                    <ClipboardPaste className="h-3 w-3" /> Ou cole com Ctrl+V
                  </p>
                  <p className="text-xs text-muted-foreground pointer-events-none">PDF, DOCX, JPG, PNG (máx 10MB)</p>
                </>
              )}
            </div>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,image/*,application/pdf"
              onChange={(e) => {
                handleSetFile(e.target.files?.[0]);
                e.currentTarget.value = "";
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="doc-name">Nome do Documento</Label>
            <Input id="doc-name" placeholder="Ex: Contrato de Honorários - João Silva" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="doc-client">Cliente {lockClient && <span className="text-[10px] text-muted-foreground">(vinculado a esta conversa)</span>}</Label>
            <Input
              id="doc-client"
              placeholder="Nome do cliente"
              value={client}
              onChange={(e) => setClient(e.target.value)}
              disabled={lockClient && !!defaultClientName}
              className={lockClient && defaultClientName ? "bg-muted/50" : ""}
            />
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
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={uploading}>Cancelar</Button>
          <Button type="button" onClick={handleUpload} disabled={uploading}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {uploading ? "Enviando..." : "Cadastrar Documento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
