import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, X, Loader2, FileText, ImageIcon } from "lucide-react";
import { useUpload } from "@/hooks/use-upload";
import { resolveMediaUrl } from "@/lib/media";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface FileUploadInputProps {
  value: string;
  onChange: (url: string) => void;
  accept?: string;
  placeholder?: string;
  label?: string;
  showPreview?: boolean;
  previewType?: "image" | "file";
  className?: string;
}

export function FileUploadInput({
  value,
  onChange,
  accept = "image/*",
  placeholder = "https://... ou faça upload",
  showPreview = true,
  previewType = "image",
  className,
}: FileUploadInputProps) {
  const { uploadFile, isUploading, progress } = useUpload();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resolvedUrl = resolveMediaUrl(value);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const url = await uploadFile(file);
      if (url) {
        onChange(url);
        toast.success("Arquivo enviado!");
      }
    } catch (error: any) {
      toast.error(error.message || "Erro ao enviar arquivo");
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className={cn("space-y-2", className)}>
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleFileSelect}
      />

      {value ? (
        <div className="flex items-center gap-2">
          {showPreview && previewType === "image" && resolvedUrl ? (
            <img
              src={resolvedUrl}
              alt="preview"
              className="h-10 w-10 rounded-lg object-cover border flex-shrink-0"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          ) : showPreview ? (
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
              <FileText className="h-4 w-4 text-muted-foreground" />
            </div>
          ) : null}
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="flex-1"
          />
          <Button
            variant="outline"
            size="icon"
            className="flex-shrink-0"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            type="button"
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="flex-shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => onChange("")}
            type="button"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="flex-1"
          />
          <Button
            variant="outline"
            size="icon"
            className="flex-shrink-0"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            type="button"
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
