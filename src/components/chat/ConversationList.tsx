import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  Archive,
  Tag,
  MessageSquare,
  Image,
  Mic,
  FileText,
  Video,
  RefreshCw,
  Loader2,
  UserCheck,
  MoreVertical,
  Trash2,
  Sparkles,
  Plus,
  MessageSquarePlus,
  Phone,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Conversation, ConversationTag, TeamMember, Connection } from "@/hooks/use-chat";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (conversation: Conversation) => void;
  tags: ConversationTag[];
  team: TeamMember[];
  loading: boolean;
  onRefresh: () => void;
  filters: {
    search: string;
    tag: string;
    assigned: string;
    archived: boolean;
    connection: string;
  };
  onFiltersChange: (filters: {
    search: string;
    tag: string;
    assigned: string;
    archived: boolean;
    connection: string;
  }) => void;
  isAdmin?: boolean;
  connections?: Connection[];
  onPinConversation?: (id: string, pinned: boolean) => void;
  onNewConversation?: () => void;
}

const getMessageTypeIcon = (type: string | null) => {
  switch (type) {
    case 'image':
      return <Image className="h-3 w-3" />;
    case 'audio':
      return <Mic className="h-3 w-3" />;
    case 'video':
      return <Video className="h-3 w-3" />;
    case 'document':
      return <FileText className="h-3 w-3" />;
    default:
      return null;
  }
};

const getMessagePreview = (message: string | null, type: string | null) => {
  if (!message && type === 'image') return '📷 Imagem';
  if (!message && type === 'audio') return '🎤 Áudio';
  if (!message && type === 'video') return '🎬 Vídeo';
  if (!message && type === 'document') return '📄 Documento';
  if (!message) return 'Sem mensagens';
  
  const maxLength = 40;
  return message.length > maxLength ? message.substring(0, maxLength) + '...' : message;
};

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  tags,
  team,
  loading,
  onRefresh,
  filters,
  onFiltersChange,
  isAdmin = false,
  onNewConversation,
}: ConversationListProps) {
  const [localSearch, setLocalSearch] = useState(filters.search);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<Conversation | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== filters.search) {
        onFiltersChange({ ...filters, search: localSearch });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [localSearch, filters, onFiltersChange]);

  const handleDeleteConversation = async () => {
    if (!conversationToDelete) return;
    
    setDeleting(true);
    try {
      await api(`/api/chat/conversations/${conversationToDelete.id}`, { method: 'DELETE' });
      toast({ title: "Conversa excluída com sucesso" });
      setDeleteDialogOpen(false);
      setConversationToDelete(null);
      onRefresh();
    } catch (error: any) {
      toast({ 
        title: "Erro ao excluir", 
        description: error.message || "Não foi possível excluir a conversa",
        variant: "destructive" 
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleCleanupDuplicates = async () => {
    setDeleting(true);
    try {
      const result = await api<{ deleted: number; merged: number; message: string }>(
        '/api/chat/conversations/cleanup-duplicates',
        { method: 'POST' }
      );
      toast({ 
        title: "Limpeza concluída", 
        description: result.message 
      });
      onRefresh();
    } catch (error: any) {
      toast({ 
        title: "Erro na limpeza", 
        description: error.message || "Não foi possível limpar duplicatas",
        variant: "destructive" 
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleCleanupEmpty = async () => {
    setDeleting(true);
    try {
      const result = await api<{ deleted: number; message: string }>(
        '/api/chat/conversations/cleanup-empty',
        { method: 'POST' }
      );
      toast({ 
        title: "Limpeza concluída", 
        description: result.message 
      });
      onRefresh();
    } catch (error: any) {
      toast({ 
        title: "Erro na limpeza", 
        description: error.message || "Não foi possível limpar conversas vazias",
        variant: "destructive" 
      });
    } finally {
      setDeleting(false);
    }
  };

  const getInitials = (name: string | null) => {
    if (!name) return '?';
    return name
      .split(' ')
      .slice(0, 2)
      .map(n => n[0])
      .join('')
      .toUpperCase();
  };

  return (
    <div className="flex flex-col h-full border-r bg-card">
      {/* Header */}
      <div className="p-4 border-b space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Conversas
          </h2>
          <div className="flex items-center gap-1">
            {/* New Conversation Button */}
            {onNewConversation && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onNewConversation}
                title="Nova conversa"
                className="text-primary hover:text-primary"
              >
                <Plus className="h-4 w-4" />
              </Button>
            )}
            
            {isAdmin && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={deleting}
                    title="Ferramentas de limpeza"
                  >
                    <Sparkles className="h-4 w-4 text-amber-500" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleCleanupEmpty} disabled={deleting}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Limpar conversas vazias
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleCleanupDuplicates} disabled={deleting}>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Limpar duplicadas (@lid)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={onRefresh}
              disabled={loading}
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar conversas..."
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          {/* Status filter */}
          <Select
            value={filters.assigned}
            onValueChange={(v) => onFiltersChange({ ...filters, assigned: v })}
          >
            <SelectTrigger className="flex-1 h-8 text-xs">
              <UserCheck className="h-3 w-3 mr-1" />
              <SelectValue placeholder="Atendente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="me">Minhas</SelectItem>
              <SelectItem value="unassigned">Sem atendente</SelectItem>
              {team.map(member => (
                <SelectItem key={member.id} value={member.id}>
                  {member.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Tag filter */}
          <Select
            value={filters.tag}
            onValueChange={(v) => onFiltersChange({ ...filters, tag: v })}
          >
            <SelectTrigger className="flex-1 h-8 text-xs">
              <Tag className="h-3 w-3 mr-1" />
              <SelectValue placeholder="Tag" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {tags.map(tag => (
                <SelectItem key={tag.id} value={tag.id}>
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-2 h-2 rounded-full" 
                      style={{ backgroundColor: tag.color }}
                    />
                    {tag.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Archive toggle */}
          <Button
            variant={filters.archived ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8"
            onClick={() => onFiltersChange({ ...filters, archived: !filters.archived })}
            title={filters.archived ? "Ver ativas" : "Ver arquivadas"}
          >
            <Archive className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Conversation List */}
      <ScrollArea className="flex-1">
        {loading && conversations.length === 0 ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
            <MessageSquare className="h-12 w-12 mb-2 opacity-50" />
            <p className="text-sm">Nenhuma conversa encontrada</p>
          </div>
        ) : (
          <div className="divide-y">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className={cn(
                  "flex items-start gap-3 p-4 cursor-pointer transition-colors hover:bg-accent/50 group",
                  selectedId === conv.id && "bg-accent"
                )}
              >
                {/* Avatar */}
                <Avatar 
                  className="h-12 w-12 flex-shrink-0"
                  onClick={() => onSelect(conv)}
                >
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {getInitials(conv.contact_name)}
                  </AvatarFallback>
                </Avatar>

                {/* Content */}
                <div className="flex-1 min-w-0" onClick={() => onSelect(conv)}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">
                      {conv.contact_name || conv.contact_phone || 'Desconhecido'}
                    </span>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {conv.last_message_at
                        ? formatDistanceToNow(new Date(conv.last_message_at), {
                            addSuffix: false,
                            locale: ptBR,
                          })
                        : ''}
                    </span>
                  </div>

                  {/* Last message preview */}
                  <div className="flex items-center gap-1 text-sm text-muted-foreground mt-0.5">
                    {getMessageTypeIcon(conv.last_message_type)}
                    <span className="truncate">
                      {getMessagePreview(conv.last_message, conv.last_message_type)}
                    </span>
                  </div>

                  {/* Tags row */}
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    {conv.tags.slice(0, 2).map(tag => (
                      <Badge
                        key={tag.id}
                        variant="outline"
                        className="text-[10px] px-1.5 py-0"
                        style={{ borderColor: tag.color, color: tag.color }}
                      >
                        {tag.name}
                      </Badge>
                    ))}
                    {conv.tags.length > 2 && (
                      <span className="text-[10px] text-muted-foreground">
                        +{conv.tags.length - 2}
                      </span>
                    )}
                  </div>

                  {/* Connection name, Assigned user, and Unread count */}
                  <div className="flex items-center gap-2 mt-1">
                    {/* Connection name */}
                    {conv.connection_name && (
                      <span className="text-[10px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded truncate max-w-[80px]">
                        {conv.connection_name}
                      </span>
                    )}
                    
                    {/* Assigned user */}
                    {conv.assigned_name && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {conv.assigned_name.split(' ')[0]}
                      </Badge>
                    )}

                    {/* Spacer */}
                    <div className="flex-1" />

                    {/* Unread count */}
                    {conv.unread_count > 0 && (
                      <Badge className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0 min-w-[20px] justify-center">
                        {conv.unread_count}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Admin actions */}
                {isAdmin && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 opacity-0 group-hover:opacity-100 flex-shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConversationToDelete(conv);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Excluir conversa
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conversa</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a conversa com{" "}
              <strong>{conversationToDelete?.contact_name || conversationToDelete?.contact_phone || "este contato"}</strong>?
              <br /><br />
              Esta ação irá remover permanentemente todas as mensagens, notas e tags associadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConversation}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Excluindo...
                </>
              ) : (
                "Excluir"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
