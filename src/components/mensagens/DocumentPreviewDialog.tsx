import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink, FileText, Image, Video } from "lucide-react";
import { resolveMediaUrl } from "@/lib/media";

interface DocumentPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url?: string;
  fileName?: string;
  type?: "image" | "video" | "document" | "audio";
}

export function DocumentPreviewDialog({
  open,
  onOpenChange,
  url,
  fileName,
  type = "document",
}: DocumentPreviewDialogProps) {
  const resolvedUrl = resolveMediaUrl(url);
  const extension = fileName?.split('.').pop()?.toLowerCase() || 
    url?.split('.').pop()?.split('?')[0]?.toLowerCase() || '';

  const isImage = type === "image" || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(extension);
  const isPdf = extension === 'pdf';
  const isVideo = type === "video" || ['mp4', 'webm', 'ogg', 'mov'].includes(extension);

  const handleDownload = () => {
    if (!resolvedUrl) return;
    
    const link = document.createElement('a');
    link.href = resolvedUrl;
    link.download = fileName || 'download';
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleOpenInNewTab = () => {
    if (resolvedUrl) {
      window.open(resolvedUrl, '_blank');
    }
  };

  const renderPreview = () => {
    if (!resolvedUrl) {
      return (
        <div className="flex flex-col items-center justify-center h-64 bg-muted rounded-lg">
          <FileText className="h-16 w-16 text-muted-foreground mb-2" />
          <p className="text-muted-foreground">Preview não disponível</p>
        </div>
      );
    }

    if (isImage) {
      return (
        <div className="flex items-center justify-center bg-muted rounded-lg p-4 max-h-[60vh] overflow-auto">
          <img
            src={resolvedUrl}
            alt={fileName || "Preview"}
            className="max-w-full max-h-[55vh] object-contain rounded"
          />
        </div>
      );
    }

    if (isPdf) {
      return (
        <div className="w-full h-[60vh] bg-muted rounded-lg overflow-hidden">
          <iframe
            src={`${resolvedUrl}#toolbar=1`}
            className="w-full h-full border-0"
            title={fileName || "PDF Preview"}
          />
        </div>
      );
    }

    if (isVideo) {
      return (
        <div className="flex items-center justify-center bg-black rounded-lg overflow-hidden">
          <video
            src={resolvedUrl}
            controls
            className="max-w-full max-h-[60vh]"
          >
            Seu navegador não suporta a tag de vídeo.
          </video>
        </div>
      );
    }

    // For other document types (docx, xlsx, etc.) - show icon and info
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-muted rounded-lg gap-4">
        <FileText className="h-16 w-16 text-muted-foreground" />
        <div className="text-center">
          <p className="font-medium text-foreground">{fileName || 'Documento'}</p>
          <p className="text-sm text-muted-foreground uppercase">{extension || 'Arquivo'}</p>
        </div>
        <p className="text-sm text-muted-foreground">
          Preview não disponível para este tipo de arquivo.
        </p>
        <p className="text-sm text-muted-foreground">
          Use os botões abaixo para visualizar ou baixar.
        </p>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 truncate">
            {isImage ? <Image className="h-5 w-5" /> : 
             isVideo ? <Video className="h-5 w-5" /> : 
             <FileText className="h-5 w-5" />}
            <span className="truncate">{fileName || 'Documento'}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="mt-2">
          {renderPreview()}
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={handleOpenInNewTab} disabled={!resolvedUrl}>
            <ExternalLink className="h-4 w-4 mr-2" />
            Abrir em Nova Aba
          </Button>
          <Button onClick={handleDownload} disabled={!resolvedUrl}>
            <Download className="h-4 w-4 mr-2" />
            Baixar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
