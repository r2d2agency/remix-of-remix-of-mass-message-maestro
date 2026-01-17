import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Send,
  Image,
  Mic,
  FileText,
  Video,
  MoreVertical,
  Tag,
  UserPlus,
  Archive,
  Phone,
  Loader2,
  Check,
  CheckCheck,
  Clock,
  X,
  Upload,
  ArrowLeftRight,
  Plus,
  RefreshCw,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { ChatMessage, Conversation, ConversationTag, TeamMember } from "@/hooks/use-chat";
import { useUpload } from "@/hooks/use-upload";
import { toast } from "sonner";

interface ChatAreaProps {
  conversation: Conversation | null;
  messages: ChatMessage[];
  loading: boolean;
  sending: boolean;
  syncingHistory?: boolean;
  tags: ConversationTag[];
  team: TeamMember[];
  onSyncHistory?: (days: number) => Promise<void>;
  onSendMessage: (content: string, type?: string, mediaUrl?: string) => Promise<void>;
  onLoadMore: () => void;
  hasMore: boolean;
  onAddTag: (tagId: string) => void;
  onRemoveTag: (tagId: string) => void;
  onAssign: (userId: string | null) => void;
  onArchive: () => void;
  onTransfer: (userId: string | null, note?: string) => void;
  onCreateTag: (name: string, color: string) => void;
}

const messageStatusIcon = (status: string) => {
  switch (status) {
    case 'sent':
      return <Check className="h-3 w-3 text-muted-foreground" />;
    case 'delivered':
      return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
    case 'read':
      return <CheckCheck className="h-3 w-3 text-blue-500" />;
    case 'pending':
      return <Clock className="h-3 w-3 text-muted-foreground" />;
    default:
      return null;
  }
};

export function ChatArea({
  conversation,
  messages,
  loading,
  sending,
  syncingHistory,
  tags,
  team,
  onSyncHistory,
  onSendMessage,
  onLoadMore,
  hasMore,
  onAddTag,
  onRemoveTag,
  onAssign,
  onArchive,
  onTransfer,
  onCreateTag,
}: ChatAreaProps) {
  const [messageText, setMessageText] = useState("");
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [transferTo, setTransferTo] = useState<string>("");
  const [transferNote, setTransferNote] = useState("");
  const [showSyncDialog, setShowSyncDialog] = useState(false);
  const [syncDays, setSyncDays] = useState<string>("7");
  const [showTagDialog, setShowTagDialog] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#6366f1");
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, isUploading } = useUpload();

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!messageText.trim() || sending) return;
    
    const text = messageText.trim();
    setMessageText("");
    
    try {
      await onSendMessage(text, 'text');
    } catch (error) {
      setMessageText(text); // Restore on error
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const url = await uploadFile(file);
      if (url) {
        let type = 'document';
        if (file.type.startsWith('image/')) type = 'image';
        else if (file.type.startsWith('video/')) type = 'video';
        else if (file.type.startsWith('audio/')) type = 'audio';
        
        await onSendMessage('', type, url);
        toast.success("Arquivo enviado!");
      }
    } catch (error) {
      toast.error("Erro ao enviar arquivo");
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleTransfer = () => {
    const userId = transferTo === "__none__" ? null : (transferTo || null);
    onTransfer(userId, transferNote);
    setShowTransferDialog(false);
    setTransferTo("");
    setTransferNote("");
    toast.success("Conversa transferida!");
  };

  const handleCreateTag = () => {
    if (!newTagName.trim()) return;
    onCreateTag(newTagName.trim(), newTagColor);
    setShowTagDialog(false);
    setNewTagName("");
    setNewTagColor("#6366f1");
  };

  const getInitials = (name: string | null) => {
    if (!name) return '?';
    return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
  };

  if (!conversation) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-muted/30 text-muted-foreground">
        <div className="text-center">
          <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Send className="h-10 w-10 text-primary" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-2">
            Selecione uma conversa
          </h3>
          <p className="text-sm max-w-[300px]">
            Escolha uma conversa na lista à esquerda para começar a atender
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-card">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-primary/10 text-primary">
              {getInitials(conversation.contact_name)}
            </AvatarFallback>
          </Avatar>
          <div>
            <h3 className="font-semibold">
              {conversation.contact_name || conversation.contact_phone || 'Desconhecido'}
            </h3>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Phone className="h-3 w-3" />
              {conversation.contact_phone}
              <span className="opacity-50">•</span>
              <span>{conversation.connection_name}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Sync */}
          {!!onSyncHistory && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setShowSyncDialog(true)}
              disabled={!!syncingHistory}
              title="Sincronizar histórico"
            >
              {syncingHistory ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          )}

          {/* Tags */}
          <div className="flex items-center gap-1">
            {conversation.tags.slice(0, 3).map(tag => (
              <Badge
                key={tag.id}
                variant="outline"
                className="text-xs cursor-pointer"
                style={{ borderColor: tag.color, color: tag.color }}
                onClick={() => onRemoveTag(tag.id)}
                title="Clique para remover"
              >
                {tag.name}
                <X className="h-3 w-3 ml-1" />
              </Badge>
            ))}
          </div>

          {/* Add Tag */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Tag className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {tags.filter(t => !conversation.tags.some(ct => ct.id === t.id)).map(tag => (
                <DropdownMenuItem
                  key={tag.id}
                  onClick={() => onAddTag(tag.id)}
                >
                  <div
                    className="w-3 h-3 rounded-full mr-2"
                    style={{ backgroundColor: tag.color }}
                  />
                  {tag.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowTagDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Nova tag
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Assign */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <UserPlus className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onAssign(null)}>
                <X className="h-4 w-4 mr-2" />
                Remover atendente
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {team.map(member => (
                <DropdownMenuItem
                  key={member.id}
                  onClick={() => onAssign(member.id)}
                >
                  {member.name}
                  {conversation.assigned_to === member.id && (
                    <Check className="h-4 w-4 ml-auto" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* More options */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setShowTransferDialog(true)}>
                <ArrowLeftRight className="h-4 w-4 mr-2" />
                Transferir atendimento
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onArchive}>
                <Archive className="h-4 w-4 mr-2" />
                {conversation.is_archived ? 'Desarquivar' : 'Arquivar'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea ref={scrollAreaRef} className="flex-1 p-4">
        {hasMore && (
          <div className="flex justify-center mb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={onLoadMore}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Carregar anteriores'}
            </Button>
          </div>
        )}

        <div className="space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex",
                msg.from_me ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "max-w-[70%] rounded-lg p-3",
                  msg.from_me
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted",
                  msg.message_type === 'system' && "bg-accent text-accent-foreground text-center max-w-full text-xs italic"
                )}
              >
                {/* Media content */}
                {(msg.message_type === 'image' || (msg.media_mimetype?.startsWith('image/') ?? false)) && msg.media_url && (
                  <a href={msg.media_url} target="_blank" rel="noopener noreferrer">
                    <img
                      src={msg.media_url}
                      alt="Imagem"
                      loading="lazy"
                      className="rounded max-w-full max-h-[300px] mb-2 cursor-pointer hover:opacity-90"
                      crossOrigin="anonymous"
                    />
                  </a>
                )}

                {(msg.message_type === 'video' || (msg.media_mimetype?.startsWith('video/') ?? false)) && msg.media_url && (
                  <div className="mb-2">
                    <video
                      controls
                      playsInline
                      preload="metadata"
                      className="rounded max-w-full max-h-[300px]"
                      crossOrigin="anonymous"
                    >
                      {msg.media_mimetype && <source src={msg.media_url} type={msg.media_mimetype} />}
                      <source src={msg.media_url} type="video/mp4" />
                      <source src={msg.media_url} type="video/webm" />
                      Seu navegador não suporta vídeo.
                    </video>
                    <a
                      href={msg.media_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs underline opacity-70 hover:opacity-100"
                    >
                      Abrir vídeo
                    </a>
                  </div>
                )}

                {(msg.message_type === 'audio' || (msg.media_mimetype?.startsWith('audio/') ?? false)) && (
                  msg.media_url ? (
                    <div className="mb-2">
                      <audio
                        controls
                        preload="auto"
                        className="w-full max-w-[280px]"
                        crossOrigin="anonymous"
                      >
                        {msg.media_mimetype && <source src={msg.media_url} type={msg.media_mimetype} />}
                        <source src={msg.media_url} type="audio/ogg" />
                        <source src={msg.media_url} type="audio/mpeg" />
                        <source src={msg.media_url} type="audio/mp4" />
                        Seu navegador não suporta áudio.
                      </audio>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm opacity-70 mb-2">
                      <Mic className="h-4 w-4" />
                      <span>Áudio (mídia não disponível)</span>
                    </div>
                  )
                )}
                {msg.message_type === 'sticker' && msg.media_url && (
                  <img
                    src={msg.media_url}
                    alt="Sticker"
                    className="max-w-[150px] max-h-[150px] mb-2"
                    crossOrigin="anonymous"
                  />
                )}
                {msg.message_type === 'document' && msg.media_url && (
                  <a
                    href={msg.media_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm underline mb-2"
                  >
                    <FileText className="h-4 w-4" />
                    Documento
                  </a>
                )}

                {/* Text content */}
                {msg.content && (
                  <p className="text-sm whitespace-pre-wrap break-words">
                    {msg.content}
                  </p>
                )}

                {/* Timestamp and status */}
                <div className={cn(
                  "flex items-center gap-1 mt-1",
                  msg.from_me ? "justify-end" : "justify-start"
                )}>
                  <span className="text-[10px] opacity-70">
                    {format(new Date(msg.timestamp), "HH:mm", { locale: ptBR })}
                  </span>
                  {msg.from_me && messageStatusIcon(msg.status)}
                </div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-4 border-t bg-card">
        <div className="flex items-end gap-2">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
            onChange={handleFileSelect}
          />

          {/* Attachment button */}
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 flex-shrink-0"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || sending}
          >
            {isUploading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Upload className="h-5 w-5" />
            )}
          </Button>

          {/* Message input */}
          <Textarea
            placeholder="Digite uma mensagem..."
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyDown={handleKeyPress}
            className="min-h-[40px] max-h-[120px] resize-none"
            rows={1}
          />

          {/* Send button */}
          <Button
            size="icon"
            className="h-10 w-10 flex-shrink-0"
            onClick={handleSend}
            disabled={!messageText.trim() || sending}
          >
            {sending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
        </div>
      </div>

      {/* Transfer Dialog */}
      <Dialog open={showTransferDialog} onOpenChange={setShowTransferDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transferir Atendimento</DialogTitle>
            <DialogDescription>
              Selecione um membro da equipe para transferir esta conversa.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Select value={transferTo} onValueChange={setTransferTo}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um atendente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Liberar (sem atendente)</SelectItem>
                {team.filter(member => member.id).map(member => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              placeholder="Observação (opcional)"
              value={transferNote}
              onChange={(e) => setTransferNote(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTransferDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleTransfer}>
              Transferir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sync Dialog */}
      <Dialog open={showSyncDialog} onOpenChange={setShowSyncDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sincronizar histórico</DialogTitle>
            <DialogDescription>
              Importa mensagens antigas do WhatsApp para esta conversa.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Select value={syncDays} onValueChange={setSyncDays}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Último 1 dia</SelectItem>
                <SelectItem value="3">Últimos 3 dias</SelectItem>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Dica: use isso quando mídias antigas não aparecem ou para recuperar histórico.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSyncDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                if (!onSyncHistory) return;
                await onSyncHistory(parseInt(syncDays, 10));
                setShowSyncDialog(false);
              }}
              disabled={!onSyncHistory || !!syncingHistory}
            >
              {syncingHistory ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sincronizar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Tag Dialog */}
      <Dialog open={showTagDialog} onOpenChange={setShowTagDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Tag</DialogTitle>
            <DialogDescription>
              Crie uma nova tag para organizar suas conversas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="Nome da tag"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Cor:</span>
              <input
                type="color"
                value={newTagColor}
                onChange={(e) => setNewTagColor(e.target.value)}
                className="w-10 h-10 rounded cursor-pointer"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTagDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateTag} disabled={!newTagName.trim()}>
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
