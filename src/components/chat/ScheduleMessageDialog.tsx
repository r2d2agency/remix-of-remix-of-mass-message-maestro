import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarClock, Loader2, Trash2, Image, X, FileText } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { ScheduledMessage } from "@/hooks/use-chat";
import { useUpload } from "@/hooks/use-upload";
import { toast } from "sonner";

interface ScheduleMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSchedule: (data: {
    content?: string;
    message_type?: string;
    media_url?: string;
    media_mimetype?: string;
    scheduled_at: string;
  }) => Promise<void>;
  scheduledMessages: ScheduledMessage[];
  onCancelScheduled: (id: string) => Promise<void>;
  sending?: boolean;
}

export function ScheduleMessageDialog({
  open,
  onOpenChange,
  onSchedule,
  scheduledMessages,
  onCancelScheduled,
  sending,
}: ScheduleMessageDialogProps) {
  const [content, setContent] = useState("");
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [time, setTime] = useState("09:00");
  const [showCalendar, setShowCalendar] = useState(false);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaMimetype, setMediaMimetype] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"text" | "image" | "document">("text");
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { uploadFile, isUploading } = useUpload();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check if it's an image
    const isImage = file.type.startsWith("image/");
    const isDocument = !isImage;

    try {
      // Create preview for images
      if (isImage) {
        const reader = new FileReader();
        reader.onload = (event) => {
          setMediaPreview(event.target?.result as string);
        };
        reader.readAsDataURL(file);
      } else {
        setMediaPreview(null);
      }

      // Upload file
      const url = await uploadFile(file);
      if (url) {
        setMediaUrl(url);
        setMediaMimetype(file.type);
        setMediaType(isImage ? "image" : "document");
        toast.success("Arquivo carregado com sucesso!");
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Erro ao carregar arquivo");
      clearMedia();
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const clearMedia = () => {
    setMediaPreview(null);
    setMediaUrl(null);
    setMediaMimetype(null);
    setMediaType("text");
  };

  const handleSchedule = async () => {
    if (!date) return;
    
    // Must have either content or media
    if (!content.trim() && !mediaUrl) {
      toast.error("Adicione uma mensagem ou imagem");
      return;
    }

    const [hours, minutes] = time.split(":").map(Number);
    const scheduledDate = new Date(date);
    scheduledDate.setHours(hours, minutes, 0, 0);

    await onSchedule({
      content: content.trim() || undefined,
      message_type: mediaUrl ? mediaType : "text",
      media_url: mediaUrl || undefined,
      media_mimetype: mediaMimetype || undefined,
      scheduled_at: scheduledDate.toISOString(),
    });

    // Reset form
    setContent("");
    setDate(undefined);
    setTime("09:00");
    clearMedia();
    
    // Close dialog after scheduling
    onOpenChange(false);
  };

  const formatScheduledDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  };

  const getMessageIcon = (msg: ScheduledMessage) => {
    if (msg.message_type === "image") return <Image className="h-3 w-3" />;
    if (msg.message_type === "document") return <FileText className="h-3 w-3" />;
    return null;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5" />
            Agendar Mensagem
          </DialogTitle>
          <DialogDescription>
            Programe uma mensagem para ser enviada automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Image/Document Upload */}
          <div className="space-y-2">
            <Label>Anexo (opcional)</Label>
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="flex-1"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Carregando...
                  </>
                ) : (
                  <>
                    <Image className="h-4 w-4 mr-2" />
                    Adicionar imagem ou documento
                  </>
                )}
              </Button>
            </div>

            {/* Media Preview */}
            {mediaUrl && (
              <div className="relative inline-block">
                {mediaType === "image" && mediaPreview ? (
                  <img
                    src={mediaPreview}
                    alt="Preview"
                    className="max-h-32 rounded-lg border"
                  />
                ) : (
                  <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                    <FileText className="h-5 w-5" />
                    <span className="text-sm">Documento anexado</span>
                  </div>
                )}
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="absolute -top-2 -right-2 h-6 w-6"
                  onClick={clearMedia}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>

          {/* Message content */}
          <div className="space-y-2">
            <Label>Mensagem {mediaUrl ? "(legenda)" : ""}</Label>
            <Textarea
              placeholder={mediaUrl ? "Digite uma legenda (opcional)..." : "Digite a mensagem..."}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
            />
          </div>

          {/* Date picker */}
          <div className="space-y-2">
            <Label>Data</Label>
            <Popover open={showCalendar} onOpenChange={setShowCalendar}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !date && "text-muted-foreground"
                  )}
                >
                  <CalendarClock className="mr-2 h-4 w-4" />
                  {date ? format(date, "PPP", { locale: ptBR }) : "Selecione a data"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 z-50" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(d) => {
                    setDate(d);
                    setShowCalendar(false);
                  }}
                  disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                  locale={ptBR}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Time picker */}
          <div className="space-y-2">
            <Label>Horário</Label>
            <Input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>

          {/* Scheduled messages list */}
          {scheduledMessages.length > 0 && (
            <div className="space-y-2">
              <Label className="text-muted-foreground">Mensagens agendadas</Label>
              <div className="max-h-[150px] overflow-y-auto space-y-2">
                {scheduledMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className="flex items-start gap-2 p-2 rounded-lg bg-muted text-sm"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        {getMessageIcon(msg)}
                        {formatScheduledDate(msg.scheduled_at)}
                      </p>
                      {msg.media_url && (
                        <p className="text-xs text-primary">
                          {msg.message_type === "image" ? "📷 Imagem" : "📄 Documento"}
                        </p>
                      )}
                      {msg.content && <p className="line-clamp-2">{msg.content}</p>}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive hover:text-destructive flex-shrink-0"
                      onClick={() => onCancelScheduled(msg.id)}
                      title="Cancelar"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSchedule}
            disabled={(!content.trim() && !mediaUrl) || !date || sending || isUploading}
          >
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Agendando...
              </>
            ) : (
              "Agendar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
