import { useState, useRef, useEffect, useCallback } from "react";
import { TeamMember } from "@/hooks/use-chat";
import { cn } from "@/lib/utils";

export interface GroupParticipant {
  id: string;
  name: string;
  phone: string;
  isAdmin?: boolean;
}

type MentionTarget = {
  id: string;
  name: string;
  subtitle: string;
  type: 'team' | 'group';
  phone?: string;
};

interface MentionSuggestionsProps {
  query: string;
  team: TeamMember[];
  groupParticipants?: GroupParticipant[];
  isGroup?: boolean;
  onSelect: (member: TeamMember) => void;
  onClose: () => void;
  position: { top: number; left: number } | null;
}

export function MentionSuggestions({
  query,
  team,
  groupParticipants = [],
  isGroup = false,
  onSelect,
  onClose,
  position,
}: MentionSuggestionsProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Build unified list: group participants first (if group), then team
  const allTargets: MentionTarget[] = [];

  if (isGroup && groupParticipants.length > 0) {
    for (const p of groupParticipants) {
      if (
        p.name.toLowerCase().includes(query.toLowerCase()) ||
        p.phone.includes(query)
      ) {
        allTargets.push({
          id: p.id || p.phone,
          name: p.name,
          subtitle: p.isAdmin ? 'Admin do grupo' : p.phone,
          type: 'group',
          phone: p.phone,
        });
      }
    }
  }

  for (const m of team) {
    if (
      m.name.toLowerCase().includes(query.toLowerCase()) ||
      m.email.toLowerCase().includes(query.toLowerCase())
    ) {
      // Skip if already in group participants by name
      const alreadyAdded = allTargets.some(
        t => t.name.toLowerCase() === m.name.toLowerCase()
      );
      if (!alreadyAdded) {
        allTargets.push({
          id: m.id,
          name: m.name,
          subtitle: m.role || 'Equipe',
          type: 'team',
        });
      }
    }
  }

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (allTargets.length === 0) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < allTargets.length - 1 ? prev + 1 : 0
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : allTargets.length - 1
          );
          break;
        case "Enter":
        case "Tab":
          e.preventDefault();
          if (allTargets[selectedIndex]) {
            const target = allTargets[selectedIndex];
            // Convert to TeamMember format for the callback
            onSelect({
              id: target.id,
              name: target.name,
              email: '',
              role: target.subtitle,
            } as TeamMember);
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
  }, [allTargets, selectedIndex, onSelect, onClose]);

  if (allTargets.length === 0 || !position) return null;

  const hasGroupItems = allTargets.some(t => t.type === 'group');
  const hasTeamItems = allTargets.some(t => t.type === 'team');

  return (
    <div
      ref={containerRef}
      className="absolute z-50 bg-popover border border-border rounded-lg shadow-lg py-1 min-w-[220px] max-h-[250px] overflow-y-auto"
      style={{
        bottom: position.top,
        left: position.left,
      }}
    >
      {hasGroupItems && (
        <div className="px-2 py-1 text-xs text-muted-foreground border-b mb-1">
          Participantes do grupo
        </div>
      )}
      {allTargets.filter(t => t.type === 'group').map((target, i) => {
        const globalIdx = allTargets.indexOf(target);
        return (
          <button
            key={`g-${target.id}`}
            className={cn(
              "w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-muted transition-colors",
              globalIdx === selectedIndex && "bg-muted"
            )}
            onClick={() =>
              onSelect({ id: target.id, name: target.name, email: '', role: target.subtitle } as TeamMember)
            }
            onMouseEnter={() => setSelectedIndex(globalIdx)}
          >
            <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-accent-foreground text-sm font-medium">
              {target.name
                .split(" ")
                .slice(0, 2)
                .map((n) => n[0])
                .join("")
                .toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{target.name}</div>
              <div className="text-xs text-muted-foreground truncate">
                {target.subtitle}
              </div>
            </div>
          </button>
        );
      })}
      {hasGroupItems && hasTeamItems && (
        <div className="px-2 py-1 text-xs text-muted-foreground border-b border-t mt-1 mb-1">
          Equipe interna
        </div>
      )}
      {!hasGroupItems && hasTeamItems && (
        <div className="px-2 py-1 text-xs text-muted-foreground border-b mb-1">
          Membros da equipe
        </div>
      )}
      {allTargets.filter(t => t.type === 'team').map((target) => {
        const globalIdx = allTargets.indexOf(target);
        return (
          <button
            key={`t-${target.id}`}
            className={cn(
              "w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-muted transition-colors",
              globalIdx === selectedIndex && "bg-muted"
            )}
            onClick={() =>
              onSelect({ id: target.id, name: target.name, email: '', role: target.subtitle } as TeamMember)
            }
            onMouseEnter={() => setSelectedIndex(globalIdx)}
          >
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-medium">
              {target.name
                .split(" ")
                .slice(0, 2)
                .map((n) => n[0])
                .join("")
                .toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{target.name}</div>
              <div className="text-xs text-muted-foreground truncate">
                {target.subtitle}
              </div>
            </div>
          </button>
        );
      })}
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
    
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");
    
    if (lastAtIndex === -1) {
      setShowSuggestions(false);
      return;
    }

    const charBeforeAt = lastAtIndex > 0 ? textBeforeCursor[lastAtIndex - 1] : " ";
    if (charBeforeAt !== " " && charBeforeAt !== "\n" && lastAtIndex !== 0) {
      setShowSuggestions(false);
      return;
    }

    const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
    if (textAfterAt.includes(" ")) {
      setShowSuggestions(false);
      return;
    }

    const query = textAfterAt;
    setMentionQuery(query);
    setMentionStartIndex(lastAtIndex);
    setShowSuggestions(true);

    setSuggestionPosition({
      top: 50,
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
      
      const newText = `${beforeMention}@${member.name} ${afterMention}`;
      setText(newText);
      
      setShowSuggestions(false);
      setMentionQuery("");
      setMentionStartIndex(-1);

      setTimeout(() => {
        if (textarea) {
          const newCursorPosition = mentionStartIndex + member.name.length + 2;
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
