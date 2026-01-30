import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Type,
  Image,
  Video,
  Mic,
  FileText,
  Trash2,
  GripVertical,
  Variable,
  Upload,
  Loader2,
  File,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUpload } from "@/hooks/use-upload";
import { toast } from "sonner";

export type MessageItemType = "text" | "image" | "video" | "audio" | "document" | "gallery";

export interface GalleryImage {
  url: string;
  fileName?: string;
}

export interface MessageItem {
  id: string;
  type: MessageItemType;
  content: string;
  mediaUrl?: string;
  caption?: string;
  ptt?: boolean; // Push-to-talk for audio (send as voice message)
  fileName?: string; // Original file name for documents
  galleryImages?: GalleryImage[]; // For gallery type - up to 10 images
}

interface MessageItemEditorProps {
  item: MessageItem;
  index: number;
  onUpdate: (id: string, updates: Partial<MessageItem>) => void;
  onDelete: (id: string) => void;
  insertVariable: (id: string, variable: string) => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}

const typeConfig = {
  text: {
    icon: Type,
    label: "Texto",
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    accept: "",
  },
  image: {
    icon: Image,
    label: "Imagem",
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    accept: "image/jpeg,image/png,image/gif,image/webp",
  },
  video: {
    icon: Video,
    label: "Vídeo",
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
    accept: "video/mp4,video/webm,video/ogg,video/quicktime",
  },
  audio: {
    icon: Mic,
    label: "Áudio",
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
    accept: "audio/mpeg,audio/mp3,audio/ogg,audio/wav,audio/webm,audio/aac,audio/m4a",
  },
  document: {
    icon: FileText,
    label: "Documento",
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    accept: ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.zip,.rar",
  },
  gallery: {
    icon: Image,
    label: "Galeria",
    color: "text-teal-500",
    bgColor: "bg-teal-500/10",
    accept: "image/jpeg,image/png,image/gif,image/webp",
  },
};

export function MessageItemEditor({
  item,
  index,
  onUpdate,
  onDelete,
  insertVariable,
  dragHandleProps,
}: MessageItemEditorProps) {
  const config = typeConfig[item.type];
  const Icon = config.icon;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, isUploading } = useUpload();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const url = await uploadFile(file);
      if (url) {
        onUpdate(item.id, { mediaUrl: url, fileName: file.name });
        toast.success("Arquivo enviado com sucesso!");
      }
    } catch (error) {
      toast.error("Erro ao enviar arquivo");
    }
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="group relative rounded-lg border border-border bg-card p-4 transition-all hover:border-primary/50">
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <div 
          className="flex items-center gap-2 text-muted-foreground cursor-grab active:cursor-grabbing"
          {...dragHandleProps}
        >
          <GripVertical className="h-4 w-4" />
        </div>
        <div className={cn("flex items-center gap-2 px-2 py-1 rounded-md", config.bgColor)}>
          <Icon className={cn("h-4 w-4", config.color)} />
          <span className={cn("text-xs font-medium", config.color)}>
            {config.label} {index + 1}
          </span>
        </div>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => onDelete(item.id)}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>

      {/* Content based on type */}
      {item.type === "text" ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Mensagem de texto</Label>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-xs"
                onClick={() => insertVariable(item.id, "nome")}
              >
                <Variable className="h-3 w-3 mr-1" />
                nome
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-xs"
                onClick={() => insertVariable(item.id, "telefone")}
              >
                telefone
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-xs"
                onClick={() => insertVariable(item.id, "email")}
              >
                email
              </Button>
            </div>
          </div>
          <Textarea
            placeholder="Digite sua mensagem aqui... Use {{nome}}, {{telefone}}, {{email}} para personalizar"
            value={item.content}
            onChange={(e) => onUpdate(item.id, { content: e.target.value })}
            className="min-h-[100px] resize-none"
          />
          <p className="text-xs text-muted-foreground">
            Variáveis disponíveis: <code className="bg-muted px-1 rounded">{'{{nome}}'}</code>, <code className="bg-muted px-1 rounded">{'{{telefone}}'}</code>, <code className="bg-muted px-1 rounded">{'{{email}}'}</code>, <code className="bg-muted px-1 rounded">{'{{empresa}}'}</code>, <code className="bg-muted px-1 rounded">{'{{cargo}}'}</code>, <code className="bg-muted px-1 rounded">{'{{obs}}'}</code>
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept={config.accept}
            className="hidden"
            onChange={handleFileSelect}
          />

          {/* Media Upload */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              {item.mediaUrl ? `${config.label} carregado` : `Enviar ${config.label.toLowerCase()}`}
            </Label>
            
            {item.mediaUrl ? (
              <div className="flex items-center gap-2 p-2 rounded-lg border bg-muted/50">
                <div className={cn("p-2 rounded", config.bgColor)}>
                  <Icon className={cn("h-4 w-4", config.color)} />
                </div>
                <span className="text-sm flex-1 truncate">
                  {item.fileName || "Arquivo carregado"}
                </span>
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => onUpdate(item.id, { mediaUrl: undefined, fileName: undefined })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button 
                variant="outline" 
                className="w-full h-20 border-dashed flex flex-col gap-2"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <span className="text-xs">Enviando...</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-6 w-6" />
                    <span className="text-xs">Clique para selecionar {config.label.toLowerCase()}</span>
                  </>
                )}
              </Button>
            )}
          </div>

          {/* PTT option for audio */}
          {item.type === "audio" && (
            <div className="flex items-center justify-between rounded-lg bg-accent/50 p-3">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Enviar como áudio gravado</Label>
                <p className="text-xs text-muted-foreground">
                  O áudio será enviado como mensagem de voz (PTT)
                </p>
              </div>
              <Switch
                checked={item.ptt ?? true}
                onCheckedChange={(checked) => onUpdate(item.id, { ptt: checked })}
              />
            </div>
          )}

          {/* Preview for images */}
          {item.type === "image" && item.mediaUrl && (
            <div className="relative rounded-lg overflow-hidden bg-muted aspect-video max-w-[200px]">
              <img
                src={item.mediaUrl}
                alt="Preview"
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            </div>
          )}

          {/* Audio preview */}
          {item.type === "audio" && item.mediaUrl && (
            <div className="rounded-lg bg-muted p-3">
              <audio controls className="w-full h-8">
                <source src={item.mediaUrl} />
                Seu navegador não suporta áudio.
              </audio>
            </div>
          )}

          {/* Video preview */}
          {item.type === "video" && item.mediaUrl && (
            <div className="relative rounded-lg overflow-hidden bg-muted aspect-video max-w-[300px]">
              <video controls className="w-full h-full">
                <source src={item.mediaUrl} />
                Seu navegador não suporta vídeo.
              </video>
            </div>
          )}

          {/* Document preview */}
          {item.type === "document" && item.mediaUrl && (
            <div className="flex items-center gap-3 rounded-lg bg-muted p-3">
              <div className="flex items-center justify-center w-10 h-10 bg-red-500 rounded">
                <File className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {item.fileName || 'documento'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {item.fileName?.split('.').pop()?.toUpperCase() || 'DOC'}
                </p>
              </div>
              <a 
                href={item.mediaUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline"
              >
                Abrir
              </a>
            </div>
          )}

          {/* Caption for media */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Legenda (opcional)</Label>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => insertVariable(item.id, "nome")}
                >
                  <Variable className="h-3 w-3 mr-1" />
                  nome
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => insertVariable(item.id, "telefone")}
                >
                  telefone
                </Button>
              </div>
            </div>
            <Textarea
              placeholder="Adicione uma legenda... Use {{nome}} para personalizar"
              value={item.caption || ""}
              onChange={(e) => onUpdate(item.id, { caption: e.target.value })}
              className="min-h-[60px] resize-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}
