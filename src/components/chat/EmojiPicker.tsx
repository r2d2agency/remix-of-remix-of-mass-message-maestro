import { useRef, useEffect } from "react";
import data from "@emoji-mart/data";
import Picker from "@emoji-mart/react";
import { Button } from "@/components/ui/button";
import { Smile, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

interface EmojiPickerProps {
  onEmojiSelect: (emoji: string) => void;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}

export function EmojiPicker({ onEmojiSelect, isOpen, onToggle, onClose }: EmojiPickerProps) {
  const pickerRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  // Close picker when clicking outside (desktop only)
  useEffect(() => {
    if (isMobile) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose, isMobile]);

  const handleEmojiSelect = (emoji: any) => {
    onEmojiSelect(emoji.native);
    if (isMobile) {
      onClose(); // Auto-close on mobile after selection
    }
  };

  return (
    <div className="relative" ref={pickerRef}>
      <Button
        variant="ghost"
        size="icon"
        className={cn("h-9 w-9 flex-shrink-0", isOpen && "bg-muted")}
        onClick={onToggle}
        title="Emojis"
        type="button"
      >
        <Smile className="h-4 w-4" />
      </Button>

      {isOpen && (
        <>
          {isMobile ? (
            // Mobile: Full screen overlay
            <div className="fixed inset-0 z-50 flex flex-col bg-background">
              <div className="flex items-center justify-between p-3 border-b">
                <h3 className="font-semibold">Selecionar Emoji</h3>
                <Button variant="ghost" size="icon" onClick={onClose}>
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <div className="flex-1 overflow-auto flex items-start justify-center p-2">
                <Picker
                  data={data}
                  onEmojiSelect={handleEmojiSelect}
                  locale="pt"
                  theme="auto"
                  previewPosition="none"
                  skinTonePosition="search"
                  maxFrequentRows={2}
                  perLine={8}
                />
              </div>
            </div>
          ) : (
            // Desktop: Positioned popup
            <div className="absolute bottom-12 left-0 z-50 shadow-lg rounded-lg overflow-hidden">
              <Picker
                data={data}
                onEmojiSelect={handleEmojiSelect}
                locale="pt"
                theme="auto"
                previewPosition="none"
                skinTonePosition="search"
                maxFrequentRows={2}
                perLine={8}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
