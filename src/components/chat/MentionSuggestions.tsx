import { useState, useRef, useEffect, useCallback } from "react";
import { TeamMember } from "@/hooks/use-chat";
import { cn } from "@/lib/utils";

interface MentionSuggestionsProps {
  query: string;
  team: TeamMember[];
  onSelect: (member: TeamMember) => void;
  onClose: () => void;
  position: { top: number; left: number } | null;
}

export function MentionSuggestions({
  query,
  team,
  onSelect,
  onClose,
  position,
}: MentionSuggestionsProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const filteredMembers = team.filter(
    (member) =>
      member.name.toLowerCase().includes(query.toLowerCase()) ||
      member.email.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (filteredMembers.length === 0) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < filteredMembers.length - 1 ? prev + 1 : 0
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : filteredMembers.length - 1
          );
          break;
        case "Enter":
        case "Tab":
          e.preventDefault();
          if (filteredMembers[selectedIndex]) {
            onSelect(filteredMembers[selectedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [filteredMembers, selectedIndex, onSelect, onClose]);

  if (filteredMembers.length === 0 || !position) return null;

  return (
    <div
      ref={containerRef}
      className="absolute z-50 bg-popover border border-border rounded-lg shadow-lg py-1 min-w-[200px] max-h-[200px] overflow-y-auto"
      style={{
        bottom: position.top,
        left: position.left,
      }}
    >
      <div className="px-2 py-1 text-xs text-muted-foreground border-b mb-1">
        Membros da equipe
      </div>
      {filteredMembers.map((member, index) => (
        <button
          key={member.id}
          className={cn(
            "w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-muted transition-colors",
            index === selectedIndex && "bg-muted"
          )}
          onClick={() => onSelect(member)}
          onMouseEnter={() => setSelectedIndex(index)}
        >
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-medium">
            {member.name
              .split(" ")
              .slice(0, 2)
              .map((n) => n[0])
              .join("")
              .toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{member.name}</div>
            <div className="text-xs text-muted-foreground truncate">
              {member.role}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

interface UseMentionsProps {
  text: string;
  setText: (text: string) => void;
  team: TeamMember[];
  textareaRef: React.RefObject<HTMLTextAreaElement>;
}

export function useMentions({ text, setText, team, textareaRef }: UseMentionsProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);
  const [suggestionPosition, setSuggestionPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);

  const checkForMention = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPosition = textarea.selectionStart;
    const textBeforeCursor = text.slice(0, cursorPosition);
    
    // Find the last @ before cursor that's either at start or after a space
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");
    
    if (lastAtIndex === -1) {
      setShowSuggestions(false);
      return;
    }

    // Check if @ is at start or preceded by whitespace
    const charBeforeAt = lastAtIndex > 0 ? textBeforeCursor[lastAtIndex - 1] : " ";
    if (charBeforeAt !== " " && charBeforeAt !== "\n" && lastAtIndex !== 0) {
      setShowSuggestions(false);
      return;
    }

    // Check if there's a space after the @ (mention completed)
    const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
    if (textAfterAt.includes(" ")) {
      setShowSuggestions(false);
      return;
    }

    const query = textAfterAt;
    setMentionQuery(query);
    setMentionStartIndex(lastAtIndex);
    setShowSuggestions(true);

    // Calculate position for suggestions popup
    setSuggestionPosition({
      top: 50, // Above the textarea
      left: 0,
    });
  }, [text, textareaRef]);

  useEffect(() => {
    checkForMention();
  }, [text, checkForMention]);

  const handleSelectMember = useCallback(
    (member: TeamMember) => {
      if (mentionStartIndex === -1) return;

      const textarea = textareaRef.current;
      const cursorPosition = textarea?.selectionStart || text.length;
      
      const beforeMention = text.slice(0, mentionStartIndex);
      const afterMention = text.slice(cursorPosition);
      
      // Insert the mention with a space after
      const newText = `${beforeMention}@${member.name} ${afterMention}`;
      setText(newText);
      
      setShowSuggestions(false);
      setMentionQuery("");
      setMentionStartIndex(-1);

      // Focus textarea and set cursor position after mention
      setTimeout(() => {
        if (textarea) {
          const newCursorPosition = mentionStartIndex + member.name.length + 2; // +2 for @ and space
          textarea.focus();
          textarea.setSelectionRange(newCursorPosition, newCursorPosition);
        }
      }, 0);
    },
    [text, setText, mentionStartIndex, textareaRef]
  );

  const closeSuggestions = useCallback(() => {
    setShowSuggestions(false);
    setMentionQuery("");
    setMentionStartIndex(-1);
  }, []);

  return {
    showSuggestions,
    mentionQuery,
    suggestionPosition,
    handleSelectMember,
    closeSuggestions,
  };
}

// Helper to render text with highlighted mentions
export function renderTextWithMentions(text: string, team: TeamMember[]) {
  if (!text) return text;
  
  const mentionPattern = /@(\w+(?:\s+\w+)?)/g;
  const parts: (string | JSX.Element)[] = [];
  let lastIndex = 0;
  let match;

  while ((match = mentionPattern.exec(text)) !== null) {
    const mentionName = match[1];
    const isMember = team.some(
      (m) => m.name.toLowerCase() === mentionName.toLowerCase()
    );

    if (lastIndex < match.index) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (isMember) {
      parts.push(
        <span
          key={match.index}
          className="text-primary font-medium bg-primary/10 px-1 rounded"
        >
          @{mentionName}
        </span>
      );
    } else {
      parts.push(match[0]);
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}
