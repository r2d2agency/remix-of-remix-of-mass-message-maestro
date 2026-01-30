import { useState } from "react";
import { MessageItem } from "./MessageItemEditor";
import { Image, Video, Mic, FileText, Images, Eye, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DocumentPreviewDialog } from "./DocumentPreviewDialog";
import { resolveMediaUrl } from "@/lib/media";

interface MessagePreviewProps {
  items: MessageItem[];
  previewName: string;
}

export function MessagePreview({ items, previewName }: MessagePreviewProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewItem, setPreviewItem] = useState<{
    url?: string;
    fileName?: string;
    type?: "image" | "video" | "document" | "audio";
  } | null>(null);

  const replaceVariables = (text: string) => {
    return text.replace(/\{\{nome\}\}/gi, previewName);
  };

  const getFileExtension = (url?: string, fileName?: string) => {
    if (fileName) {
      const ext = fileName.split('.').pop()?.toUpperCase();
      return ext || 'DOC';
    }
    if (url) {
      const ext = url.split('.').pop()?.split('?')[0]?.toUpperCase();
      return ext || 'DOC';
    }
    return 'DOC';
  };

  const openPreview = (url?: string, fileName?: string, type?: "image" | "video" | "document" | "audio") => {
    setPreviewItem({ url, fileName, type });
    setPreviewOpen(true);
  };

  const handleDownload = (url?: string, fileName?: string) => {
    const resolvedUrl = resolveMediaUrl(url);
    if (!resolvedUrl) return;
    
    const link = document.createElement('a');
    link.href = resolvedUrl;
    link.download = fileName || 'download';
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
        Adicione mensagens para ver o preview...
      </div>
    );
  }

  // Expand gallery items into individual image messages for preview
  const expandedItems: MessageItem[] = [];
  for (const item of items) {
    if (item.type === "gallery" && item.galleryImages && item.galleryImages.length > 0) {
      // Each gallery image becomes a separate message in the preview
      item.galleryImages.forEach((img, idx) => {
        expandedItems.push({
          id: `${item.id}-gallery-${idx}`,
          type: "image",
          content: "",
          mediaUrl: img.url,
          caption: idx === 0 ? item.caption : undefined, // Caption only on first image
          fileName: img.fileName,
        });
      });
    } else {
      expandedItems.push(item);
    }
  }

  return (
    <div className="space-y-2">
      {expandedItems.map((item) => (
        <div key={item.id} className="flex justify-end">
          <div className="max-w-[85%] rounded-lg bg-[#dcf8c6] px-3 py-2 shadow-sm">
            {/* Media content */}
            {item.type === "image" && (
              <div className="mb-2 rounded overflow-hidden relative group">
                {item.mediaUrl ? (
                  <>
                    <img
                      src={item.mediaUrl}
                      alt="Preview"
                      className="max-w-full max-h-48 object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                        e.currentTarget.nextElementSibling?.classList.remove("hidden");
                      }}
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-8 px-2"
                        onClick={() => openPreview(item.mediaUrl, item.fileName, "image")}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-8 px-2"
                        onClick={() => handleDownload(item.mediaUrl, item.fileName)}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </>
                ) : null}
                <div className={`flex items-center justify-center h-24 bg-gray-200 ${item.mediaUrl ? "hidden" : ""}`}>
                  <Image className="h-8 w-8 text-gray-400" />
                </div>
              </div>
            )}

            {item.type === "gallery" && (
              <div className="mb-2">
                {item.galleryImages && item.galleryImages.length > 0 ? (
                  <div className="grid grid-cols-3 gap-1 rounded overflow-hidden">
                    {item.galleryImages.slice(0, 6).map((img, idx) => (
                      <div key={idx} className="aspect-square relative">
                        <img
                          src={img.url}
                          alt={img.fileName || `Imagem ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                        {idx === 5 && item.galleryImages && item.galleryImages.length > 6 && (
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                            <span className="text-white font-bold">+{item.galleryImages.length - 6}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-24 bg-gray-200 rounded">
                    <Images className="h-8 w-8 text-gray-400" />
                  </div>
                )}
              </div>
            )}

            {item.type === "video" && (
              <div className="mb-2 flex items-center justify-center h-24 bg-gray-200 rounded relative group">
                <Video className="h-8 w-8 text-gray-400" />
                {item.mediaUrl && (
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 rounded">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-8 px-2"
                      onClick={() => openPreview(item.mediaUrl, item.fileName, "video")}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-8 px-2"
                      onClick={() => handleDownload(item.mediaUrl, item.fileName)}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            )}

            {item.type === "audio" && (
              <div className="mb-2 flex items-center gap-2 bg-gray-200 rounded-full px-4 py-2">
                <Mic className="h-4 w-4 text-gray-500" />
                <div className="flex-1 h-1 bg-gray-300 rounded-full">
                  <div className="w-1/3 h-full bg-gray-500 rounded-full" />
                </div>
                <span className="text-xs text-gray-500">0:00</span>
              </div>
            )}

            {item.type === "document" && (
              <div className="mb-2 flex items-center gap-3 bg-white/80 rounded-lg px-3 py-2 border border-gray-200 group relative">
                <div className="flex items-center justify-center w-10 h-10 bg-red-500 rounded">
                  <FileText className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {item.fileName || 'documento'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {getFileExtension(item.mediaUrl, item.fileName)}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    onClick={() => openPreview(item.mediaUrl, item.fileName, "document")}
                    title="Visualizar"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    onClick={() => handleDownload(item.mediaUrl, item.fileName)}
                    title="Baixar"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Text/Caption */}
            {(item.type === "text" ? item.content : item.caption) && (
              <p className="text-sm text-gray-800 whitespace-pre-wrap">
                {replaceVariables(item.type === "text" ? item.content : item.caption || "")}
              </p>
            )}

            <p className="mt-1 text-right text-[10px] text-gray-500">
              12:00 ✓✓
            </p>
          </div>
        </div>
      ))}

      <DocumentPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        url={previewItem?.url}
        fileName={previewItem?.fileName}
        type={previewItem?.type}
      />
    </div>
  );
}
