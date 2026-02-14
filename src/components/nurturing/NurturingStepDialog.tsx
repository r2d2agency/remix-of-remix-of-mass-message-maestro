import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MessageSquare, Mail, Clock, Loader2, Upload, X, FileText, ImageIcon, Video, Music } from "lucide-react";
import { NurturingStep, useNurturingMutations } from "@/hooks/use-nurturing";
import { RichEmailEditor } from "@/components/email/RichEmailEditor";
import { useUpload } from "@/hooks/use-upload";
import { resolveMediaUrl } from "@/lib/media";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface NurturingStepDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sequenceId: string;
  step?: NurturingStep | null;
  nextStepOrder?: number;
  onSuccess?: () => void;
}

const MEDIA_TYPE_ICONS: Record<string, React.ElementType> = {
  image: ImageIcon,
  video: Video,
  audio: Music,
  document: FileText,
};

const MEDIA_TYPE_ACCEPT: Record<string, string> = {
  image: "image/*",
  video: "video/*",
  audio: "audio/*",
  document: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv",
};

export function NurturingStepDialog({
  open,
  onOpenChange,
  sequenceId,
  step,
  nextStepOrder = 1,
  onSuccess,
}: NurturingStepDialogProps) {
  const { addStep, updateStep } = useNurturingMutations();
  const { uploadFile, isUploading, progress } = useUpload();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isEditing = !!step;

  // Form state
  const [channel, setChannel] = useState<"whatsapp" | "email">("whatsapp");
  const [delayValue, setDelayValue] = useState("1");
  const [delayUnit, setDelayUnit] = useState<"minutes" | "hours" | "days">("days");
  const [skipIfReplied, setSkipIfReplied] = useState(true);

  // WhatsApp content
  const [whatsappContent, setWhatsappContent] = useState("");
  const [whatsappMediaUrl, setWhatsappMediaUrl] = useState("");
  const [whatsappMediaType, setWhatsappMediaType] = useState("");

  // Email content
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");

  // Reset form when dialog opens/closes or step changes
  useEffect(() => {
    if (open) {
      if (step) {
        setChannel(step.channel);
        setDelayValue(String(step.delay_value));
        setDelayUnit(step.delay_unit);
        setSkipIfReplied(step.skip_if_replied);
        setWhatsappContent(step.whatsapp_content || "");
        setWhatsappMediaUrl(step.whatsapp_media_url || "");
        setWhatsappMediaType(step.whatsapp_media_type || "");
        setEmailSubject(step.email_subject || "");
        setEmailBody(step.email_body || "");
      } else {
        setChannel("whatsapp");
        setDelayValue("1");
        setDelayUnit("days");
        setSkipIfReplied(true);
        setWhatsappContent("");
        setWhatsappMediaUrl("");
        setWhatsappMediaType("");
        setEmailSubject("");
        setEmailBody("");
      }
    }
  }, [open, step]);

  const handleSubmit = () => {
    const baseData = {
      delay_value: parseInt(delayValue) || 1,
      delay_unit: delayUnit,
      channel,
      skip_if_replied: skipIfReplied,
      whatsapp_content: channel === "whatsapp" ? whatsappContent : null,
      whatsapp_media_url: channel === "whatsapp" && whatsappMediaUrl ? whatsappMediaUrl : null,
      whatsapp_media_type: channel === "whatsapp" && whatsappMediaType ? whatsappMediaType : null,
      email_subject: channel === "email" ? emailSubject : null,
      email_body: channel === "email" ? emailBody : null,
    };

    if (isEditing && step) {
      updateStep.mutate(
        { stepId: step.id, sequenceId, ...baseData },
        {
          onSuccess: () => {
            onOpenChange(false);
            onSuccess?.();
          },
        }
      );
    } else {
      addStep.mutate(
        { sequenceId, step_order: nextStepOrder, ...baseData },
        {
          onSuccess: () => {
            onOpenChange(false);
            onSuccess?.();
          },
        }
      );
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const url = await uploadFile(file);
      if (url) {
        setWhatsappMediaUrl(url);
        // Auto-detect media type
        if (file.type.startsWith("image/")) setWhatsappMediaType("image");
        else if (file.type.startsWith("video/")) setWhatsappMediaType("video");
        else if (file.type.startsWith("audio/")) setWhatsappMediaType("audio");
        else setWhatsappMediaType("document");
        toast.success("Arquivo enviado com sucesso!");
      }
    } catch (error: any) {
      toast.error(error.message || "Erro ao enviar arquivo");
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const clearMedia = () => {
    setWhatsappMediaUrl("");
    setWhatsappMediaType("");
  };

  const isValid =
    (channel === "whatsapp" && whatsappContent.trim()) ||
    (channel === "email" && emailSubject.trim() && emailBody.trim());

  const isPending = addStep.isPending || updateStep.isPending;

  const MediaIcon = whatsappMediaType ? MEDIA_TYPE_ICONS[whatsappMediaType] || FileText : FileText;
  const resolvedUrl = resolveMediaUrl(whatsappMediaUrl);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar Passo" : "Adicionar Passo"}
          </DialogTitle>
          <DialogDescription>
            Configure o canal, timing e conteúdo do passo
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Channel Selection */}
          <div className="space-y-2">
            <Label>Canal</Label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setChannel("whatsapp")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 p-4 rounded-lg border-2 transition-colors",
                  channel === "whatsapp"
                    ? "border-green-500 bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400"
                    : "border-border hover:border-muted-foreground/50"
                )}
              >
                <MessageSquare className="h-5 w-5" />
                <span className="font-medium">WhatsApp</span>
              </button>
              <button
                type="button"
                onClick={() => setChannel("email")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 p-4 rounded-lg border-2 transition-colors",
                  channel === "email"
                    ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400"
                    : "border-border hover:border-muted-foreground/50"
                )}
              >
                <Mail className="h-5 w-5" />
                <span className="font-medium">Email</span>
              </button>
            </div>
          </div>

          {/* Delay Configuration */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Aguardar antes de enviar
            </Label>
            <div className="flex gap-2">
              <Input
                type="number"
                min="1"
                value={delayValue}
                onChange={(e) => setDelayValue(e.target.value)}
                className="w-24"
              />
              <Select value={delayUnit} onValueChange={(v) => setDelayUnit(v as typeof delayUnit)}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="minutes">Minutos</SelectItem>
                  <SelectItem value="hours">Horas</SelectItem>
                  <SelectItem value="days">Dias</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Tempo de espera após o passo anterior (ou inscrição para o primeiro passo)
            </p>
          </div>

          {/* Content based on channel */}
          {channel === "whatsapp" ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Mensagem WhatsApp</Label>
                <Textarea
                  placeholder="Olá {{nome}}, tudo bem?&#10;&#10;Gostaria de saber como posso ajudar..."
                  value={whatsappContent}
                  onChange={(e) => setWhatsappContent(e.target.value)}
                  rows={6}
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  Use {"{{variavel}}"} para personalização. Ex: {"{{nome}}"}, {"{{empresa}}"}
                </p>
              </div>

              {/* Media Upload Section */}
              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Mídia (opcional)
                </Label>

                {whatsappMediaUrl ? (
                  <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                    {/* Preview */}
                    {whatsappMediaType === "image" && resolvedUrl ? (
                      <img
                        src={resolvedUrl}
                        alt="preview"
                        className="h-16 w-16 rounded-lg object-cover border flex-shrink-0"
                      />
                    ) : (
                      <div className="h-16 w-16 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                        <MediaIcon className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {whatsappMediaType === "image" ? "Imagem" :
                         whatsappMediaType === "video" ? "Vídeo" :
                         whatsappMediaType === "audio" ? "Áudio" : "Documento"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{whatsappMediaUrl}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={clearMedia}
                      type="button"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Upload button */}
                    <div
                      className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {isUploading ? (
                        <div className="space-y-2">
                          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                          <p className="text-sm text-muted-foreground">Enviando... {progress}%</p>
                        </div>
                      ) : (
                        <>
                          <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                          <p className="text-sm font-medium">Clique para enviar arquivo</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Imagem, vídeo, áudio ou documento
                          </p>
                        </>
                      )}
                    </div>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
                      onChange={handleFileUpload}
                      className="hidden"
                    />

                    {/* Or paste URL */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-px bg-border" />
                      <span className="text-xs text-muted-foreground">ou cole a URL</span>
                      <div className="flex-1 h-px bg-border" />
                    </div>

                    <div className="flex gap-2">
                      <Input
                        placeholder="https://..."
                        value={whatsappMediaUrl}
                        onChange={(e) => setWhatsappMediaUrl(e.target.value)}
                        className="flex-1"
                      />
                      <Select
                        value={whatsappMediaType || "none"}
                        onValueChange={(v) => setWhatsappMediaType(v === "none" ? "" : v)}
                      >
                        <SelectTrigger className="w-36">
                          <SelectValue placeholder="Tipo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Tipo...</SelectItem>
                          <SelectItem value="image">Imagem</SelectItem>
                          <SelectItem value="video">Vídeo</SelectItem>
                          <SelectItem value="audio">Áudio</SelectItem>
                          <SelectItem value="document">Documento</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Assunto do Email</Label>
                <Input
                  placeholder="Olá {{nome}}, tenho uma proposta especial..."
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Corpo do Email</Label>
                <RichEmailEditor
                  value={emailBody}
                  onChange={setEmailBody}
                  placeholder="Comece a escrever seu email..."
                />
                <p className="text-xs text-muted-foreground">
                  Use {"{{variavel}}"} para personalização. Ex: {"{{nome}}"}, {"{{empresa}}"}
                </p>
              </div>
            </div>
          )}

          {/* Options */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="skip-if-replied"
              checked={skipIfReplied}
              onCheckedChange={(c) => setSkipIfReplied(c === true)}
            />
            <Label htmlFor="skip-if-replied" className="text-sm cursor-pointer">
              Pular este passo se o contato já respondeu anteriormente
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || isPending}>
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEditing ? "Salvar Alterações" : "Adicionar Passo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
