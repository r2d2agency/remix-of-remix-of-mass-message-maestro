import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Search, Loader2, MessageSquare, Clock } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface SearchResult {
  message_id: string;
  conversation_id: string;
  contact_name: string | null;
  contact_phone: string | null;
  group_name: string | null;
  is_group: boolean;
  content: string;
  timestamp: string;
  is_from_me: boolean;
}

interface GlobalSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectResult: (conversationId: string, messageId?: string) => void;
}

export function GlobalSearchDialog({ open, onOpenChange, onSelectResult }: GlobalSearchDialogProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // Debounced search
  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      setSearched(true);
      try {
        const data = await api<{ results: SearchResult[] }>(
          `/api/chat/messages/search?q=${encodeURIComponent(query)}&limit=50`
        );
        setResults(data.results || []);
      } catch (error) {
        console.error('Global search error:', error);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [query]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      setSearched(false);
    }
  }, [open]);

  const handleSelect = useCallback((result: SearchResult) => {
    onSelectResult(result.conversation_id, result.message_id);
    onOpenChange(false);
  }, [onSelectResult, onOpenChange]);

  const getInitials = (name: string | null) => {
    if (!name) return '?';
    return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
  };

  const highlightText = (text: string, searchQuery: string) => {
    if (!searchQuery.trim()) return text;
    
    const parts = text.split(new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    
    return parts.map((part, i) => 
      part.toLowerCase() === searchQuery.toLowerCase() ? (
        <mark key={i} className="bg-yellow-300 dark:bg-yellow-600 px-0.5 rounded font-medium">
          {part}
        </mark>
      ) : part
    );
  };

  const getContextSnippet = (content: string, query: string) => {
    const lowerContent = content.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerContent.indexOf(lowerQuery);
    
    if (index === -1) return content.slice(0, 100);
    
    const start = Math.max(0, index - 30);
    const end = Math.min(content.length, index + query.length + 50);
    
    let snippet = content.slice(start, end);
    if (start > 0) snippet = '...' + snippet;
    if (end < content.length) snippet = snippet + '...';
    
    return snippet;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] max-h-[80vh] flex flex-col p-0">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" />
            Buscar em todas as conversas
          </DialogTitle>
        </DialogHeader>

        {/* Search Input */}
        <div className="px-4 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Digite para buscar mensagens..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>
          {query.length > 0 && query.length < 2 && (
            <p className="text-xs text-muted-foreground mt-1">Digite pelo menos 2 caracteres</p>
          )}
        </div>

        {/* Results */}
        <ScrollArea className="flex-1 max-h-[400px]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : results.length === 0 ? (
            searched && query.length >= 2 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <MessageSquare className="h-10 w-10 mb-2 opacity-50" />
                <p className="text-sm">Nenhuma mensagem encontrada</p>
                <p className="text-xs mt-1">Tente outros termos de busca</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Search className="h-10 w-10 mb-2 opacity-50" />
                <p className="text-sm">Busque por mensagens</p>
                <p className="text-xs mt-1">A busca inclui todas as suas conversas</p>
              </div>
            )
          ) : (
            <div className="divide-y">
              {results.map((result) => (
                <button
                  key={result.message_id}
                  className="w-full text-left px-4 py-3 hover:bg-accent/50 transition-colors"
                  onClick={() => handleSelect(result)}
                >
                  <div className="flex items-start gap-3">
                    <Avatar className="h-10 w-10 flex-shrink-0">
                      <AvatarFallback className="bg-primary/10 text-primary text-sm">
                        {getInitials(result.is_group ? result.group_name : result.contact_name)}
                      </AvatarFallback>
                    </Avatar>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm truncate">
                          {result.is_group 
                            ? (result.group_name || 'Grupo')
                            : (result.contact_name || result.contact_phone || 'Desconhecido')}
                        </span>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(new Date(result.timestamp), { 
                            addSuffix: false, 
                            locale: ptBR 
                          })}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1 mt-0.5">
                        {result.is_from_me && (
                          <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">
                            Você
                          </Badge>
                        )}
                        {result.is_group && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
                            Grupo
                          </Badge>
                        )}
                      </div>
                      
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {highlightText(getContextSnippet(result.content, query), query)}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        {results.length > 0 && (
          <div className="px-4 py-2 border-t bg-muted/30 text-xs text-muted-foreground">
            {results.length} resultado{results.length !== 1 ? 's' : ''} encontrado{results.length !== 1 ? 's' : ''}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}