import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
  MicOff,
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
  MessageSquare,
  Upload,
  ArrowLeftRight,
  ArrowLeft,
  Plus,
  RefreshCw,
  PenLine,
  Play,
  Pause,
  Zap,
  StickyNote,
  Reply,
  CornerDownRight,
  Search,
  ChevronUp,
  ChevronDown,
  Trash2,
  Square,
  CalendarClock,
  Users,
  Undo2,
  AlertCircle,
  RotateCcw,
  Bot,
  Building2,
  Briefcase,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { resolveMediaUrl } from "@/lib/media";
import { ChatMessage, Conversation, ConversationTag, TeamMember, ConversationNote } from "@/hooks/use-chat";
import { useChat } from "@/hooks/use-chat";
import { useDepartments, Department } from "@/hooks/use-departments";
import { useUpload } from "@/hooks/use-upload";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { QuickRepliesPanel } from "./QuickRepliesPanel";
import { NotesPanel } from "./NotesPanel";
import { AudioWaveform } from "./AudioWaveform";
import { AudioPlayer } from "./AudioPlayer";
import { TypingIndicator } from "./TypingIndicator";
import { EmojiPicker } from "./EmojiPicker";
import { MentionSuggestions, useMentions } from "./MentionSuggestions";
import { ScheduleMessageDialog } from "./ScheduleMessageDialog";
import { ScheduledMessage } from "@/hooks/use-chat";
import { StartFlowDialog } from "./StartFlowDialog";
import { DealLinkDialog } from "./DealLinkDialog";
import { useCRMDealsByPhone, CRMDeal } from "@/hooks/use-crm";
import { DealDetailDialog } from "@/components/crm/DealDetailDialog";

interface ChatAreaProps {
  conversation: Conversation | null;
  messages: ChatMessage[];
  loading: boolean;
  sending: boolean;
  syncingHistory?: boolean;
  tags: ConversationTag[];
  team: TeamMember[];
  isAdmin?: boolean;
  userRole?: string; // Role do usuário: 'owner', 'admin', 'manager', 'agent'
  onSyncHistory?: (days: number) => Promise<void>;
  onSendMessage: (content: string, type?: string, mediaUrl?: string, quotedMessageId?: string, mediaMimetype?: string) => Promise<void>;
  onLoadMore: () => void;
  hasMore: boolean;
  onAddTag: (tagId: string) => void;
  onRemoveTag: (tagId: string) => void;
  onAssign: (userId: string | null) => void;
  onArchive: () => void;
  onTransfer: (userId: string | null, note?: string) => void;
  onCreateTag: (name: string, color: string) => void;
  onDeleteConversation?: () => Promise<void>;
  onReleaseConversation?: () => Promise<void>;
  onFinishConversation?: () => Promise<void>;
  onReopenConversation?: () => Promise<void>;
  onDepartmentChange?: (departmentId: string | null) => void;
  isMobile?: boolean;
  onMobileBack?: () => void;
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
      return <Clock className="h-3 w-3 text-muted-foreground animate-pulse" />;
    case 'failed':
      return <AlertCircle className="h-3 w-3 text-destructive" />;
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
  isAdmin = false,
  userRole,
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
  onDeleteConversation,
  onReleaseConversation,
  onFinishConversation,
  onReopenConversation,
  onDepartmentChange,
  isMobile = false,
  onMobileBack,
}: ChatAreaProps) {
  // Manager (Supervisor) = apenas visualização
  const isViewOnly = userRole === 'manager';
  
  // Departments
  const { getDepartments, transferToDepartment } = useDepartments();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [showDepartmentDialog, setShowDepartmentDialog] = useState(false);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>("");
  const [savingDepartment, setSavingDepartment] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [transferTo, setTransferTo] = useState<string>("");
  const [transferNote, setTransferNote] = useState("");
  const [showSyncDialog, setShowSyncDialog] = useState(false);
  const [syncDays, setSyncDays] = useState<string>("7");
  const [showTagDialog, setShowTagDialog] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#6366f1");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletingConversation, setDeletingConversation] = useState(false);
  const [signMessages, setSignMessages] = useState(() => {
    const saved = localStorage.getItem('chat-sign-messages');
    return saved === 'true';
  });
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [notesCount, setNotesCount] = useState(0);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  const [isContactTyping, setIsContactTyping] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [scheduledMessages, setScheduledMessages] = useState<ScheduledMessage[]>([]);
  const [schedulingMessage, setSchedulingMessage] = useState(false);
  const [showEditContactDialog, setShowEditContactDialog] = useState(false);
  const [editingContactName, setEditingContactName] = useState("");
  const [savingContact, setSavingContact] = useState(false);
  const [profilePictureUrl, setProfilePictureUrl] = useState<string | null>(null);
  const [showStartFlowDialog, setShowStartFlowDialog] = useState(false);
  const [showDealDialog, setShowDealDialog] = useState(false);
  const [showDealDetailDialog, setShowDealDetailDialog] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<CRMDeal | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isUserScrollingRef = useRef(false);
  const lastScrollTopRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const { uploadFile, isUploading, progress: uploadProgress, resetProgress } = useUpload();
  const [pendingFile, setPendingFile] = useState<{ file: File; preview?: string } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);
  const { user, modulesEnabled } = useAuth();
  const { getNotes, getTypingStatus, getScheduledMessages, scheduleMessage, cancelScheduledMessage } = useChat();
  
  // Fetch CRM deals for this contact
  const { data: contactDeals, isLoading: loadingDeals } = useCRMDealsByPhone(
    conversation?.contact_phone && !conversation.is_group ? conversation.contact_phone : null
  );
  // Be resilient to backend variations like 'OPEN' / 'Open'
  const openDeals = (contactDeals || []).filter(
    (d) => (d as any)?.status && String((d as any).status).toLowerCase() === 'open'
  );
  
  const {
    isRecording,
    duration,
    audioBlob,
    audioLevels,
    startRecording,
    stopRecording,
    cancelRecording,
    clearAudio,
    formatDuration,
  } = useAudioRecorder();

  // Speech recognition for transcription
  const {
    isListening,
    fullTranscript,
    isSupported: isSpeechSupported,
    error: speechError,
    startListening,
    stopListening,
    cancelListening,
    clearError: clearSpeechError,
  } = useSpeechRecognition();

  // Handle speech error toast
  useEffect(() => {
    if (speechError) {
      toast.error(speechError);
      clearSpeechError();
    }
  }, [speechError, clearSpeechError]);

  // Mentions hook
  const {
    showSuggestions: showMentionSuggestions,
    mentionQuery,
    suggestionPosition,
    handleSelectMember,
    closeSuggestions,
  } = useMentions({
    text: messageText,
    setText: setMessageText,
    team,
    textareaRef,
  });

  // Load notes count when conversation changes
  useEffect(() => {
    if (conversation?.id) {
      getNotes(conversation.id).then(notes => setNotesCount(notes.length));
    } else {
      setNotesCount(0);
    }
  }, [conversation?.id, showNotes]);

  // Load departments when dialog opens
  useEffect(() => {
    if (showDepartmentDialog) {
      getDepartments().then(setDepartments);
      // Set current department if exists
      setSelectedDepartmentId(conversation?.department_id || "");
    }
  }, [showDepartmentDialog, getDepartments, conversation?.department_id]);

  // Fetch profile picture for current conversation
  useEffect(() => {
    setProfilePictureUrl(null); // Reset when conversation changes
    
    if (!conversation?.id || conversation.is_group || !conversation.contact_phone) {
      return;
    }

    const fetchProfilePicture = async () => {
      try {
        const result = await api<{ pictures: Record<string, string> }>('/api/wapi/profile-pictures', {
          method: 'POST',
          body: {
            conversations: [{
              id: conversation.id,
              connection_id: conversation.connection_id,
              contact_phone: conversation.contact_phone,
              is_group: false,
            }],
          },
        });

        if (result.pictures?.[conversation.id]) {
          setProfilePictureUrl(result.pictures[conversation.id]);
        }
      } catch (error) {
        console.debug('Profile picture fetch failed:', error);
      }
    };

    fetchProfilePicture();
  }, [conversation?.id, conversation?.contact_phone, conversation?.is_group]);

  // Load scheduled messages when dialog opens
  useEffect(() => {
    if (showScheduleDialog && conversation?.id) {
      getScheduledMessages(conversation.id).then(setScheduledMessages);
    }
  }, [showScheduleDialog, conversation?.id, getScheduledMessages]);

  // Poll for typing status
  useEffect(() => {
    if (!conversation?.id) {
      setIsContactTyping(false);
      return;
    }

    const checkTyping = async () => {
      const isTyping = await getTypingStatus(conversation.id);
      setIsContactTyping(isTyping);
    };

    // Check immediately
    checkTyping();

    // Poll every 2 seconds
    const interval = setInterval(checkTyping, 2000);

    return () => clearInterval(interval);
  }, [conversation?.id, getTypingStatus]);

  // Save signature preference
  useEffect(() => {
    localStorage.setItem('chat-sign-messages', signMessages.toString());
  }, [signMessages]);

  // Auto-scroll to bottom on new messages ONLY if user is near the bottom
  useEffect(() => {
    if (showSearch) return;
    
    const container = scrollContainerRef.current;
    if (!container) {
      // Fallback: scroll if no container ref
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    
    // Check if user is near the bottom (within 150px)
    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const isNearBottom = distanceFromBottom < 150;
    
    // Only auto-scroll if user is near the bottom (not browsing history)
    if (isNearBottom && !isUserScrollingRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, showSearch]);

  // Track user scroll to detect when they're browsing history
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    let scrollTimeout: NodeJS.Timeout;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      
      // User is scrolling up (browsing history)
      if (scrollTop < lastScrollTopRef.current && distanceFromBottom > 150) {
        isUserScrollingRef.current = true;
      }
      
      // User scrolled back to bottom
      if (distanceFromBottom < 50) {
        isUserScrollingRef.current = false;
      }
      
      lastScrollTopRef.current = scrollTop;
      
      // Reset the scrolling flag after user stops scrolling
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        // Keep the flag if user is still away from bottom
        if (distanceFromBottom < 50) {
          isUserScrollingRef.current = false;
        }
      }, 150);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, [conversation?.id]);

  // Handle search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setCurrentSearchIndex(0);
      return;
    }

    const query = searchQuery.toLowerCase();
    const results = messages
      .filter(msg => msg.content?.toLowerCase().includes(query))
      .map(msg => msg.id);
    
    setSearchResults(results);
    setCurrentSearchIndex(results.length > 0 ? 0 : -1);
  }, [searchQuery, messages]);

  // Scroll to current search result
  useEffect(() => {
    if (searchResults.length > 0 && currentSearchIndex >= 0) {
      const messageId = searchResults[currentSearchIndex];
      const element = messageRefs.current.get(messageId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentSearchIndex, searchResults]);

  // Focus search input when opened
  useEffect(() => {
    if (showSearch) {
      searchInputRef.current?.focus();
    }
  }, [showSearch]);

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        navigateSearch(-1);
      } else {
        navigateSearch(1);
      }
    } else if (e.key === 'Escape') {
      setShowSearch(false);
      setSearchQuery("");
    }
  };

  const navigateSearch = (direction: number) => {
    if (searchResults.length === 0) return;
    
    let newIndex = currentSearchIndex + direction;
    if (newIndex >= searchResults.length) newIndex = 0;
    if (newIndex < 0) newIndex = searchResults.length - 1;
    
    setCurrentSearchIndex(newIndex);
  };

  const highlightText = (text: string, query: string) => {
    if (!query.trim()) return text;
    
    const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    
    return parts.map((part, i) => 
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={i} className="bg-yellow-300 dark:bg-yellow-600 px-0.5 rounded">
          {part}
        </mark>
      ) : part
    );
  };

  const handleSend = async () => {
    if (!messageText.trim() || sending) return;
    
    let text = messageText.trim();
    
    // Add signature if enabled
    if (signMessages && user?.name) {
      text = `*${user.name}*\n${text}`;
    }
    
    const quotedId = replyingTo?.id;
    setMessageText("");
    setReplyingTo(null);
    
    try {
      await onSendMessage(text, 'text', undefined, quotedId);
    } catch (error) {
      setMessageText(messageText.trim()); // Restore original text on error
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const inferMessageTypeFromFile = useCallback((file: File): 'image' | 'video' | 'audio' | 'document' => {
    const mime = String(file.type || '').toLowerCase();
    const ext = (() => {
      const parts = String(file.name || '').toLowerCase().split('.');
      return parts.length > 1 ? `.${parts.pop()}` : '';
    })();

    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';

    // Fallback for empty/generic mimetypes (common on mobile/drag&drop)
    const imageExts = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
    const videoExts = new Set(['.mp4', '.webm', '.ogg', '.mov', '.qt']);
    const audioExts = new Set(['.mp3', '.ogg', '.wav', '.webm', '.aac', '.m4a']);
    if (imageExts.has(ext)) return 'image';
    if (videoExts.has(ext)) return 'video';
    if (audioExts.has(ext)) return 'audio';

    return 'document';
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const inferredType = inferMessageTypeFromFile(file);

    // Create preview for images
    let preview: string | undefined;
    if (inferredType === 'image') {
      preview = URL.createObjectURL(file);
    }

    setPendingFile({ file, preview });

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Drag & Drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragOver(false);

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    const inferredType = inferMessageTypeFromFile(file);

    // Create preview for images
    let preview: string | undefined;
    if (inferredType === 'image') {
      preview = URL.createObjectURL(file);
    }

    setPendingFile({ file, preview });
  }, [inferMessageTypeFromFile]);

  const looksLikeFilename = (value: string) => {
    const s = value.trim();
    if (!s) return false;
    if (s.length > 160) return false;
    // common extensions (pdf, office, images, audio/video, archives)
    return /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv|zip|rar|7z|jpg|jpeg|png|gif|webp|mp3|ogg|wav|m4a|mp4|webm|mov)$/i.test(s);
  };

  const getDocumentDisplayName = (msg: ChatMessage, resolvedUrl?: string | null) => {
    if (msg.content && looksLikeFilename(msg.content)) return msg.content.trim();

    const raw = resolvedUrl || msg.media_url || '';
    if (!raw) return 'Documento';
    try {
      const url = new URL(raw, window.location.origin);
      const last = url.pathname.split('/').filter(Boolean).pop();
      if (!last) return 'Documento';
      const decoded = decodeURIComponent(last);
      return decoded || 'Documento';
    } catch {
      const parts = String(raw).split('/');
      const last = parts[parts.length - 1] || '';
      return last || 'Documento';
    }
  };

  const handleConfirmFileUpload = async () => {
    if (!pendingFile) return;

    const { file, preview } = pendingFile;
    
    try {
      console.log('[Upload] Starting upload for:', file.name, 'type:', file.type, 'size:', file.size);
      const url = await uploadFile(file);
      console.log('[Upload] Result URL:', url);
      
      if (url) {
        const type = inferMessageTypeFromFile(file);

        // For documents, send filename in content so W-API can set the correct filename
        // (it uses "content" as filename) and UI can display it.
        const content = type === 'document' ? file.name : '';
        console.log('[Upload] Sending message with type:', type, 'content:', content);
        await onSendMessage(content, type, url, undefined, file.type);
        toast.success("Arquivo enviado!");
      } else {
        console.error('[Upload] Upload returned null/empty URL');
        toast.error("Falha no upload - tente novamente");
      }
    } catch (error) {
      console.error('[Upload] Error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      toast.error(`Erro ao enviar: ${errorMessage}`);
    } finally {
      if (preview) URL.revokeObjectURL(preview);
      setPendingFile(null);
      resetProgress();
    }
  };

  const handleCancelFileUpload = () => {
    if (pendingFile?.preview) {
      URL.revokeObjectURL(pendingFile.preview);
    }
    setPendingFile(null);
    resetProgress();
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return <Image className="h-8 w-8 text-green-500" />;
    if (mimeType.startsWith('video/')) return <Video className="h-8 w-8 text-purple-500" />;
    if (mimeType.startsWith('audio/')) return <Mic className="h-8 w-8 text-orange-500" />;
    if (mimeType.includes('pdf')) return <FileText className="h-8 w-8 text-red-500" />;
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv')) 
      return <FileText className="h-8 w-8 text-green-600" />;
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) 
      return <FileText className="h-8 w-8 text-orange-600" />;
    if (mimeType.includes('word') || mimeType.includes('document')) 
      return <FileText className="h-8 w-8 text-blue-600" />;
    return <FileText className="h-8 w-8 text-muted-foreground" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleSendAudio = async () => {
    if (!audioBlob) return;

    try {
      // Create a file from the blob
      const extension = audioBlob.type.includes('webm') ? 'webm'
        : audioBlob.type.includes('mp4') ? 'm4a'
        : 'wav';
      const file = new File([audioBlob], `audio.${extension}`, { type: audioBlob.type });

      const url = await uploadFile(file);
      if (url) {
        await onSendMessage('', 'audio', url, undefined, file.type);
        toast.success("Áudio enviado!");
      }
      clearAudio();
    } catch (error) {
      toast.error("Erro ao enviar áudio");
      console.error('Error sending audio:', error);
    }
  };

  const handleStartRecording = async () => {
    try {
      await startRecording();
    } catch (error) {
      toast.error("Não foi possível acessar o microfone");
    }
  };

  const handleStartTranscription = () => {
    if (!isSpeechSupported) {
      toast.error("Navegador não suporta reconhecimento de voz. Use Chrome, Edge ou Safari.");
      return;
    }
    startListening();
  };

  const handleStopTranscription = () => {
    const text = stopListening();
    if (text.trim()) {
      setMessageText(prev => {
        const separator = prev.trim() ? ' ' : '';
        return prev + separator + text.trim();
      });
    }
  };

  const handleCancelTranscription = () => {
    cancelListening();
  };

  const handleEmojiSelect = useCallback((emoji: string) => {
    setMessageText(prev => prev + emoji);
    setShowEmojiPicker(false);
  }, []);

  const handleTransfer = () => {
    const userId = transferTo === "__none__" ? null : (transferTo || null);
    onTransfer(userId, transferNote);
    setShowTransferDialog(false);
    setTransferTo("");
    setTransferNote("");
    toast.success("Conversa transferida!");
  };

  const handleSaveDepartment = async () => {
    if (!conversation?.id) return;
    
    setSavingDepartment(true);
    try {
      const deptId = selectedDepartmentId === "__none__" ? null : (selectedDepartmentId || null);
      
      if (deptId) {
        const success = await transferToDepartment(conversation.id, deptId);
        if (success) {
          toast.success("Departamento atribuído!");
          onDepartmentChange?.(deptId);
        } else {
          toast.error("Erro ao atribuir departamento");
        }
      } else {
        // Remove department - call API directly
        await api(`/api/chat/conversations/${conversation.id}/department`, {
          method: 'DELETE',
          auth: true,
        });
        toast.success("Departamento removido");
        onDepartmentChange?.(null);
      }
      
      setShowDepartmentDialog(false);
    } catch (error) {
      console.error('Error saving department:', error);
      toast.error("Erro ao salvar departamento");
    } finally {
      setSavingDepartment(false);
    }
  };

  const handleCreateTag = () => {
    if (!newTagName.trim()) return;
    onCreateTag(newTagName.trim(), newTagColor);
    setShowTagDialog(false);
    setNewTagName("");
    setNewTagColor("#6366f1");
  };

  const handleOpenEditContact = () => {
    setEditingContactName(conversation?.contact_name || '');
    setShowEditContactDialog(true);
  };

  const handleSaveContact = async () => {
    if (!conversation || !editingContactName.trim()) return;
    
    setSavingContact(true);
    try {
      await api('/api/chat/contacts/by-phone', {
        method: 'POST',
        body: {
          phone: conversation.contact_phone,
          connection_id: conversation.connection_id,
          name: editingContactName.trim(),
        },
      });
      
      toast.success('Contato salvo com sucesso');
      setShowEditContactDialog(false);
      
      // Trigger a refresh of the conversation list to show updated name
      window.dispatchEvent(new CustomEvent('refresh-conversations'));
    } catch (error: any) {
      toast.error(error.message || 'Erro ao salvar contato');
    } finally {
      setSavingContact(false);
    }
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
    <div 
      className="flex-1 flex h-full min-w-0 overflow-x-hidden overflow-y-hidden relative max-w-full"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-primary/10 backdrop-blur-sm border-2 border-dashed border-primary rounded-lg pointer-events-none animate-in fade-in duration-200">
          <div className="flex flex-col items-center gap-3 text-primary">
            <Upload className="h-12 w-12" />
            <span className="text-lg font-medium">Solte o arquivo aqui</span>
            <span className="text-sm text-muted-foreground">Imagens, vídeos, documentos, áudios...</span>
          </div>
        </div>
      )}

      {/* Main chat area */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-x-hidden">
      {/* Archived Banner */}
      {conversation.is_archived && (
        <div className="flex items-center justify-center gap-2 px-4 py-2 bg-amber-500/10 border-b border-amber-500/30 text-amber-600 dark:text-amber-400">
          <Archive className="h-4 w-4" />
          <span className="text-sm font-medium">Esta conversa está arquivada</span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-2 h-6 px-2 text-xs text-amber-600 dark:text-amber-400 hover:bg-amber-500/20"
            onClick={onArchive}
          >
            Desarquivar
          </Button>
        </div>
      )}

      {/* Header */}
      <div
        className={cn(
          "border-b bg-card flex-shrink-0",
          isMobile
            ? "flex items-center gap-2 px-2 py-2"
            : "flex items-center justify-between p-4"
        )}
      >
        <div className={cn("flex items-center gap-2 min-w-0 flex-1", isMobile && "overflow-hidden")}>
          {/* Mobile back button */}
          {isMobile && onMobileBack && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 flex-shrink-0"
              onClick={onMobileBack}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <Avatar className={cn(isMobile ? "h-8 w-8" : "h-10 w-10", "flex-shrink-0")}>
            {profilePictureUrl && !conversation.is_group && (
              <AvatarImage 
                src={profilePictureUrl} 
                alt={conversation.contact_name || 'Avatar'}
                className="object-cover"
              />
            )}
            <AvatarFallback className={cn(
              "text-primary",
              conversation.is_group ? "bg-blue-100 dark:bg-blue-900/30" : "bg-primary/10"
            )}>
              {conversation.is_group ? (
                <Users className={cn(isMobile ? "h-4 w-4" : "h-5 w-5")} />
              ) : (
                getInitials(conversation.contact_name)
              )}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h3 className={cn("font-semibold truncate", isMobile && "text-sm")}>
              {conversation.is_group 
                ? (conversation.group_name || 'Grupo sem nome')
                : (conversation.contact_name || conversation.contact_phone || 'Desconhecido')}
            </h3>
            {/* Connection info - simplified on mobile */}
            {isMobile ? (
              <p className="text-[11px] text-muted-foreground truncate">
                {conversation.is_group ? 'Grupo' : conversation.contact_phone}
              </p>
            ) : conversation.is_group ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0 flex-wrap">
                <Users className="h-3 w-3" />
                <span>Grupo</span>
                <span className="opacity-50">•</span>
                <span className="truncate max-w-[160px]">{conversation.connection_name}</span>
              </div>
            ) : (
              <button
                onClick={handleOpenEditContact}
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors cursor-pointer min-w-0 flex-wrap"
                title="Clique para editar o nome do contato"
              >
                <Phone className="h-3 w-3" />
                <span className="hover:underline whitespace-nowrap">{conversation.contact_phone}</span>
                <PenLine className="h-3 w-3 opacity-50" />
                <span className="opacity-50">•</span>
                <span className="truncate max-w-[160px]">{conversation.connection_name}</span>
              </button>
            )}
          </div>
        </div>

        {/* Header actions - compact on mobile */}
        <div
          className={cn(
            "flex items-center flex-shrink-0",
            isMobile ? "gap-0.5" : "gap-2"
          )}
        >
          {/* Mobile: show only essential buttons, others go in menu */}
          {!isMobile && (
            <>
              {/* Release button - visible when attending */}
              {!isViewOnly && onReleaseConversation && conversation.attendance_status === 'attending' && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-amber-600 border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950 h-8"
                  onClick={onReleaseConversation}
                  title="Liberar conversa (voltar para aguardando)"
                >
                  <Undo2 className="h-3.5 w-3.5 mr-1" />
                  Liberar
                </Button>
              )}

              {/* Finish button - visible when attending or waiting */}
              {!isViewOnly && onFinishConversation && (conversation.attendance_status === 'attending' || conversation.attendance_status === 'waiting') && (
                <Button
                  variant="outline"
                  size="icon"
                  className="text-green-600 border-green-300 hover:bg-green-50 dark:hover:bg-green-950 h-8 w-8"
                  onClick={onFinishConversation}
                  title="Finalizar atendimento"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                </Button>
              )}

              {/* Reopen button - visible when finished */}
              {!isViewOnly && onReopenConversation && conversation.attendance_status === 'finished' && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-blue-600 border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950 h-8"
                  onClick={onReopenConversation}
                  title="Reabrir conversa (voltar para aguardando)"
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1" />
                  Reabrir
                </Button>
              )}
            </>
          )}
          
          {/* Search - always visible */}
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              showSearch && "bg-muted",
              isMobile ? "h-7 w-7" : "h-8 w-8"
            )}
            onClick={() => {
              setShowSearch(!showSearch);
              if (showSearch) setSearchQuery("");
            }}
            title="Buscar mensagens"
          >
            <Search className={cn(isMobile ? "h-3.5 w-3.5" : "h-4 w-4")} />
          </Button>

          {/* Sync - hide on mobile, move to menu */}
          {!isMobile && !!onSyncHistory && (
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

          {/* Tags - hide on mobile, show only in menu */}
          {!isMobile && (
            <div className="flex items-center gap-1"> 
              {conversation.tags.slice(0, 3).map(tag => (
                <Badge
                  key={tag.id}
                  variant="outline"
                  className="cursor-pointer text-xs"
                  style={{ borderColor: tag.color, color: tag.color }}
                  onClick={() => onRemoveTag(tag.id)}
                  title="Clique para remover"
                >
                  {tag.name}
                  <X className="h-3 w-3 ml-1" />
                </Badge>
              ))}
            </div>
          )}

          {/* CRM Deal Shortcut - Shows if contact has open deals (hidden on mobile, available in menu) */}
          {!isMobile && !conversation.is_group && openDeals.length > 0 && modulesEnabled.crm && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-primary border-primary/30 hover:bg-primary/10 relative h-8"
                  title={`${openDeals.length} negociação(ões) aberta(s)`}
                >
                  <Briefcase className="h-3.5 w-3.5" />
                  <span className="ml-1.5 text-xs">CRM</span>
                  <Badge 
                    variant="secondary" 
                    className="absolute -top-1.5 -right-1.5 h-4 min-w-[16px] px-1 text-[10px] bg-primary text-primary-foreground"
                  >
                    {openDeals.length}
                  </Badge>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72 z-[80]">
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  Negociações abertas
                </div>
                <DropdownMenuSeparator />
                {openDeals.slice(0, 5).map(deal => (
                  <DropdownMenuItem
                    key={deal.id}
                    onClick={() => {
                      setSelectedDeal(deal);
                      setShowDealDetailDialog(true);
                    }}
                    className="flex flex-col items-start gap-1 py-2"
                  >
                    <div className="flex items-center gap-2 w-full">
                      <span className="font-medium truncate flex-1">{deal.title}</span>
                      {deal.stage_color && (
                        <Badge 
                          variant="outline" 
                          className="text-[10px] h-5 px-1.5"
                          style={{ borderColor: deal.stage_color, color: deal.stage_color }}
                        >
                          {deal.stage_name}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{deal.company_name}</span>
                      <span>•</span>
                      <span className="font-medium text-foreground">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(deal.value)}
                      </span>
                    </div>
                  </DropdownMenuItem>
                ))}
                {openDeals.length > 5 && (
                  <>
                    <DropdownMenuSeparator />
                    <div className="px-2 py-1.5 text-xs text-muted-foreground text-center">
                      +{openDeals.length - 5} negociação(ões)
                    </div>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Add Tag - hide on mobile, move to menu */}
          {!isMobile && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Tag className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-[80]">
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
          )}

          {/* Assign - Hidden for view-only users and on mobile (in menu) */}
          {!isMobile && !isViewOnly && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <UserPlus className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-[80]">
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
          )}

          {/* More options - main menu button */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className={cn(isMobile ? "h-7 w-7" : "h-8 w-8")}>
                <MoreVertical className={cn(isMobile ? "h-3.5 w-3.5" : "h-4 w-4")} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-[80] max-h-[70vh] overflow-y-auto">
              {/* Mobile-only: Attendance actions */}
              {isMobile && (
                <>
                  {!isViewOnly && onReleaseConversation && conversation.attendance_status === 'attending' && (
                    <DropdownMenuItem onClick={onReleaseConversation} className="text-amber-600">
                      <Undo2 className="h-4 w-4 mr-2" />
                      Liberar conversa
                    </DropdownMenuItem>
                  )}
                  {!isViewOnly && onFinishConversation && (conversation.attendance_status === 'attending' || conversation.attendance_status === 'waiting') && (
                    <DropdownMenuItem onClick={onFinishConversation} className="text-green-600">
                      <CheckCheck className="h-4 w-4 mr-2" />
                      Finalizar atendimento
                    </DropdownMenuItem>
                  )}
                  {!isViewOnly && onReopenConversation && conversation.attendance_status === 'finished' && (
                    <DropdownMenuItem onClick={onReopenConversation} className="text-blue-600">
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Reabrir conversa
                    </DropdownMenuItem>
                  )}
                  {!!onSyncHistory && (
                    <DropdownMenuItem onClick={() => setShowSyncDialog(true)}>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Sincronizar histórico
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                </>
              )}

              <DropdownMenuItem onClick={() => setShowNotes(!showNotes)}>
                <StickyNote className="h-4 w-4 mr-2" />
                Anotações internas
                {notesCount > 0 && (
                  <Badge variant="secondary" className="ml-auto text-[10px] h-5 px-1.5 bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300">
                    {notesCount}
                  </Badge>
                )}
              </DropdownMenuItem>

              {/* CRM deals inside the 3-dots menu as an alternative entry point */}
              {!conversation.is_group && openDeals.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                    Negociações abertas ({openDeals.length})
                  </div>
                  {openDeals.slice(0, 5).map((deal) => (
                    <DropdownMenuItem
                      key={deal.id}
                      onClick={() => {
                        setSelectedDeal(deal);
                        setShowDealDetailDialog(true);
                      }}
                      className="flex items-center gap-2"
                    >
                      <Briefcase className="h-4 w-4" />
                      <span className="truncate">{deal.title}</span>
                    </DropdownMenuItem>
                  ))}
                  {openDeals.length > 5 && (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground text-center">
                      +{openDeals.length - 5} negociação(ões)
                    </div>
                  )}
                </>
              )}

              {/* Mobile-only: Tags section */}
              {isMobile && conversation.tags.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                    Tags ({conversation.tags.length})
                  </div>
                  {conversation.tags.slice(0, 5).map(tag => (
                    <DropdownMenuItem
                      key={tag.id}
                      onClick={() => onRemoveTag(tag.id)}
                      className="flex items-center gap-2"
                    >
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span>{tag.name}</span>
                      <X className="h-3 w-3 ml-auto text-muted-foreground" />
                    </DropdownMenuItem>
                  ))}
                </>
              )}

              {/* Mobile-only: Add tag */}
              {isMobile && (
                <>
                  <DropdownMenuItem onClick={() => setShowTagDialog(true)}>
                    <Tag className="h-4 w-4 mr-2" />
                    Gerenciar tags
                  </DropdownMenuItem>
                </>
              )}

              {/* Mobile-only: Assign */}
              {isMobile && !isViewOnly && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setShowTransferDialog(true)}>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Atribuir atendente
                    {conversation.assigned_name && (
                      <Badge variant="secondary" className="ml-auto text-[10px] h-5 px-1.5">
                        {conversation.assigned_name}
                      </Badge>
                    )}
                  </DropdownMenuItem>
                </>
              )}

              {!isViewOnly && (
                <>
                  <DropdownMenuSeparator />
                  {modulesEnabled.crm && (
                    <DropdownMenuItem onClick={() => setShowDealDialog(true)}>
                      <Briefcase className="h-4 w-4 mr-2" />
                      Negociações (CRM)
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => setShowStartFlowDialog(true)}>
                    <Bot className="h-4 w-4 mr-2" />
                    Iniciar fluxo de chatbot
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowTransferDialog(true)}>
                    <ArrowLeftRight className="h-4 w-4 mr-2" />
                    Transferir atendimento
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowDepartmentDialog(true)}>
                    <Building2 className="h-4 w-4 mr-2" />
                    Atribuir departamento
                    {conversation.department_name && (
                      <Badge variant="secondary" className="ml-auto text-[10px] h-5 px-1.5">
                        {conversation.department_name}
                      </Badge>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onArchive}>
                    <Archive className="h-4 w-4 mr-2" />
                    {conversation.is_archived ? 'Desarquivar' : 'Arquivar'}
                  </DropdownMenuItem>
                </>
              )}
              {isAdmin && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => setShowDeleteDialog(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Excluir conversa
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Search Bar */}
      {showSearch && (
        <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/50">
          <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <Input
            ref={searchInputRef}
            placeholder="Buscar nas mensagens..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="h-8 text-sm"
          />
          {searchResults.length > 0 && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <span>{currentSearchIndex + 1}/{searchResults.length}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => navigateSearch(-1)}
                title="Anterior (Shift+Enter)"
              >
                <ChevronUp className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => navigateSearch(1)}
                title="Próximo (Enter)"
              >
                <ChevronDown className="h-3 w-3" />
              </Button>
            </div>
          )}
          {searchQuery && searchResults.length === 0 && (
            <span className="text-xs text-muted-foreground">Nenhum resultado</span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 flex-shrink-0"
            onClick={() => {
              setShowSearch(false);
              setSearchQuery("");
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Messages */}
      <ScrollArea
        ref={scrollAreaRef}
        viewportRef={scrollContainerRef}
        className={cn("flex-1 chat-wallpaper min-w-0", isMobile ? "p-3" : "p-4")}
      >
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
          {messages.map((msg) => {
            const isSearchResult = searchResults.includes(msg.id);
            const isCurrentResult = searchResults[currentSearchIndex] === msg.id;
            const mediaUrl = resolveMediaUrl(msg.media_url);
            
            return (
            <div
              key={msg.id}
              ref={(el) => {
                if (el) messageRefs.current.set(msg.id, el);
              }}
              className={cn(
                "flex w-full min-w-0 group",
                msg.from_me ? "justify-end" : "justify-start"
              )}
            >
              {/* Reply button - left side for received messages */}
              {!msg.from_me && msg.message_type !== 'system' && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity self-center mr-1"
                  onClick={() => setReplyingTo(msg)}
                  title="Responder"
                >
                  <Reply className="h-3 w-3" />
                </Button>
              )}

              <div
                className={cn(
                  "rounded-lg transition-all overflow-hidden min-w-0",
                  isMobile ? "max-w-[85%] p-2.5" : "max-w-[70%] p-3",
                  msg.from_me
                    ? "message-sent"
                    : "message-received",
                  msg.message_type === 'system' && "!bg-accent !text-accent-foreground text-center max-w-full text-xs italic",
                  isSearchResult && "ring-2 ring-yellow-400",
                  isCurrentResult && "ring-2 ring-yellow-500 bg-yellow-50 dark:bg-yellow-900/30",
                  msg.status === 'failed' && "ring-2 ring-destructive bg-destructive/10"
                )}
                style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
              >
                {/* Sender name for group messages */}
                {conversation?.is_group && !msg.from_me && msg.sender_name && (
                  <div className="text-xs font-semibold mb-1 text-primary">
                    {msg.sender_name}
                    {msg.sender_phone && (
                      <span className="font-normal text-muted-foreground ml-1">
                        ({msg.sender_phone.replace(/^(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3')})
                      </span>
                    )}
                  </div>
                )}

                {/* Quoted message */}
                {msg.quoted_message_id && msg.quoted_content && (
                  <div className={cn(
                    "mb-2 p-2 rounded border-l-4 text-xs",
                    msg.from_me 
                      ? "bg-primary-foreground/10 border-primary-foreground/50" 
                      : "bg-background/50 border-primary/50"
                  )}>
                    <div className="font-medium opacity-80 mb-0.5">
                      <CornerDownRight className="h-3 w-3 inline mr-1" />
                      {msg.quoted_from_me ? 'Você' : (msg.quoted_sender_name || 'Contato')}
                    </div>
                    <p className="line-clamp-2 opacity-70">
                      {msg.quoted_message_type !== 'text' ? (
                        <span className="italic">
                          {msg.quoted_message_type === 'image' && '📷 Imagem'}
                          {msg.quoted_message_type === 'video' && '🎥 Vídeo'}
                          {msg.quoted_message_type === 'audio' && '🎤 Áudio'}
                          {msg.quoted_message_type === 'document' && '📄 Documento'}
                        </span>
                      ) : msg.quoted_content}
                    </p>
                  </div>
                )}

                {/* Media content */}
                {(msg.message_type === 'image' || (msg.media_mimetype?.startsWith('image/') ?? false)) && mediaUrl && (
                  <a href={mediaUrl} target="_blank" rel="noopener noreferrer">
                    <img
                      src={mediaUrl}
                      alt="Imagem recebida"
                      loading="lazy"
                      className="rounded max-w-full max-h-[300px] mb-2 cursor-pointer hover:opacity-90"
                      crossOrigin="anonymous"
                      onError={(e) => {
                        const target = e.currentTarget;
                        target.style.display = 'none';
                        const fallback = document.createElement('div');
                        fallback.className = 'flex items-center gap-2 text-sm opacity-70 mb-2 p-3 rounded bg-muted';
                        fallback.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span>Imagem não disponível</span>';
                        target.parentElement?.appendChild(fallback);
                      }}
                    />
                  </a>
                )}

                {(msg.message_type === 'video' || (msg.media_mimetype?.startsWith('video/') ?? false)) && mediaUrl && (
                  <div className="mb-2">
                    <video
                      controls
                      playsInline
                      preload="metadata"
                      className="rounded max-w-full max-h-[300px]"
                      crossOrigin="anonymous"
                    >
                      {msg.media_mimetype && <source src={mediaUrl} type={msg.media_mimetype} />}
                      <source src={mediaUrl} type="video/mp4" />
                      <source src={mediaUrl} type="video/webm" />
                      Seu navegador não suporta vídeo.
                    </video>
                    <a
                      href={mediaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs underline opacity-70 hover:opacity-100"
                    >
                      Abrir vídeo
                    </a>
                  </div>
                )}

                {(msg.message_type === 'audio' || msg.message_type === 'ptt' || (msg.media_mimetype?.startsWith('audio/') ?? false)) && (
                  mediaUrl ? (
                    <div className="mb-2">
                      <AudioPlayer 
                        src={mediaUrl} 
                        mimetype={msg.media_mimetype || undefined}
                        isFromMe={msg.from_me}
                      />
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm opacity-70 mb-2 p-3 rounded-lg bg-background/30">
                      <Mic className="h-4 w-4" />
                      <span>Áudio não disponível</span>
                    </div>
                  )
                )}
                {msg.message_type === 'sticker' && mediaUrl && (
                  <img
                    src={mediaUrl}
                    alt="Sticker recebido"
                    className="max-w-[150px] max-h-[150px] mb-2"
                    crossOrigin="anonymous"
                    onError={(e) => {
                      const target = e.currentTarget;
                      target.style.display = 'none';
                      const fallback = document.createElement('div');
                      fallback.className = 'flex items-center gap-2 text-sm opacity-70 mb-2';
                      fallback.innerHTML = '🎭 <span>Sticker não disponível</span>';
                      target.parentElement?.appendChild(fallback);
                    }}
                  />
                )}
                {msg.message_type === 'document' && mediaUrl && (
                  <a
                    href={mediaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm underline mb-2 min-w-0"
                  >
                    <FileText className="h-4 w-4" />
                    <span className="truncate">
                      {getDocumentDisplayName(msg, mediaUrl)}
                    </span>
                  </a>
                )}

                {/* Text content */}
                {msg.content && !(msg.message_type === 'document' && looksLikeFilename(msg.content)) && (
                  <p className="text-sm whitespace-pre-wrap" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                    {searchQuery ? highlightText(msg.content, searchQuery) : msg.content}
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

                {/* Failed message indicator with retry */}
                {msg.status === 'failed' && msg.from_me && (
                  <div className="flex flex-col gap-1 mt-2 pt-2 border-t border-destructive/30">
                    {msg.error_message && (
                      <span className="text-[10px] text-destructive/80 break-words">
                        {msg.error_message}
                      </span>
                    )}
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-[10px] text-destructive font-medium">
                        Falha no envio
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 px-2 text-[10px] text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={async () => {
                          try {
                            const retryContent =
                              msg.content ||
                              (msg.message_type === 'document'
                                ? getDocumentDisplayName(msg, mediaUrl)
                                : '');
                            await onSendMessage(
                              retryContent,
                              msg.message_type,
                              msg.media_url || undefined,
                              msg.quoted_message_id || undefined,
                              msg.media_mimetype || undefined
                            );
                            toast.success("Mensagem reenviada!");
                          } catch (error) {
                            toast.error("Falha ao reenviar");
                          }
                        }}
                      >
                        <RotateCcw className="h-3 w-3 mr-1" />
                        Reenviar
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Reply button - right side for sent messages */}
              {msg.from_me && msg.message_type !== 'system' && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity self-center ml-1"
                  onClick={() => setReplyingTo(msg)}
                  title="Responder"
                >
                  <Reply className="h-3 w-3" />
                </Button>
              )}
            </div>
          )})}

          {/* Typing indicator */}
          {isContactTyping && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg p-3">
                <TypingIndicator contactName={conversation?.contact_name} />
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input - Show readonly message for supervisors */}
      {isViewOnly ? (
        <div className="p-4 border-t bg-muted/50">
          <div className="flex items-center justify-center gap-2 text-muted-foreground py-3">
            <Users className="h-5 w-5" />
            <span className="text-sm font-medium">Modo Supervisor - Apenas visualização</span>
          </div>
        </div>
      ) : (
      <div className={cn("border-t bg-card", isMobile ? "p-3" : "p-4")}>
        {/* Reply preview */}
        {replyingTo && (
          <div className="flex items-center gap-2 mb-2 p-2 rounded-lg bg-muted border-l-4 border-primary">
            <CornerDownRight className="h-4 w-4 text-primary flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-primary">
                Respondendo a {replyingTo.from_me ? 'você mesmo' : (conversation?.contact_name || 'Contato')}
              </div>
              <p className="text-xs text-muted-foreground line-clamp-1">
                {replyingTo.message_type !== 'text' ? (
                  <span className="italic">
                    {replyingTo.message_type === 'image' && '📷 Imagem'}
                    {replyingTo.message_type === 'video' && '🎥 Vídeo'}
                    {replyingTo.message_type === 'audio' && '🎤 Áudio'}
                    {replyingTo.message_type === 'document' && '📄 Documento'}
                  </span>
                ) : replyingTo.content}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 flex-shrink-0"
              onClick={() => setReplyingTo(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Signature toggle */}
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <Checkbox
            id="sign-messages"
            checked={signMessages}
            onCheckedChange={(checked) => setSignMessages(checked === true)}
          />
          <Label
            htmlFor="sign-messages"
            className="text-xs text-muted-foreground cursor-pointer flex items-center gap-1 min-w-0"
          >
            <PenLine className="h-3 w-3" />
            Assinar mensagens {user?.name && signMessages && (
              <span className="text-primary">(*{user.name}*)</span>
            )}
          </Label>
        </div>
        
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar"
          onChange={handleFileSelect}
        />

        {/* File Preview UI */}
        {pendingFile && (
          <div className="mb-3 p-3 rounded-lg border bg-muted/50 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-start gap-3">
              {/* File preview/icon */}
              <div className="flex-shrink-0">
                {pendingFile.preview ? (
                  <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted">
                    <img 
                      src={pendingFile.preview} 
                      alt="Preview" 
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center">
                    {getFileIcon(pendingFile.file.type)}
                  </div>
                )}
              </div>

              {/* File info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{pendingFile.file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(pendingFile.file.size)}
                </p>
                
                {/* Progress bar during upload */}
                {isUploading && (
                  <div className="mt-2 space-y-1">
                    <Progress value={uploadProgress} className="h-2" />
                    <p className="text-xs text-muted-foreground text-right">{uploadProgress}%</p>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={handleCancelFileUpload}
                  disabled={isUploading}
                  title="Cancelar"
                >
                  <X className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  className="h-8 w-8"
                  onClick={handleConfirmFileUpload}
                  disabled={isUploading || sending}
                  title="Enviar"
                >
                  {isUploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Speech Transcription UI */}
        {isListening ? (
          <div className="flex items-end gap-2">
            {/* Cancel button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 flex-shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={handleCancelTranscription}
              title="Cancelar transcrição"
            >
              <Trash2 className="h-5 w-5" />
            </Button>

            {/* Transcription indicator */}
            <div className="flex-1 flex flex-col gap-1 px-4 py-2 bg-primary/10 rounded-lg border border-primary/30 overflow-hidden">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-primary animate-pulse flex-shrink-0" />
                <span className="text-xs font-medium text-primary">Ouvindo...</span>
              </div>
              <p className="text-sm text-foreground min-h-[1.5rem] line-clamp-2">
                {fullTranscript || <span className="text-muted-foreground italic">Fale algo...</span>}
              </p>
            </div>

            {/* Stop/Confirm button */}
            <Button
              size="icon"
              className="h-10 w-10 flex-shrink-0"
              onClick={handleStopTranscription}
              title="Concluir transcrição"
            >
              <Check className="h-5 w-5" />
            </Button>
          </div>
        ) : isRecording ? (
          <div className="flex items-end gap-2">
            {/* Cancel button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 flex-shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={cancelRecording}
              title="Cancelar gravação"
            >
              <Trash2 className="h-5 w-5" />
            </Button>

            {/* Recording indicator with waveform */}
            <div className="flex-1 flex items-center gap-3 px-4 py-2 bg-destructive/10 rounded-lg border border-destructive/30 overflow-hidden">
              <div className="w-3 h-3 rounded-full bg-destructive animate-pulse flex-shrink-0" />
              <div className="flex-1 flex items-center justify-center">
                <AudioWaveform levels={audioLevels} />
              </div>
              <span className="text-sm font-mono text-destructive/80 flex-shrink-0">
                {formatDuration(duration)}
              </span>
            </div>

            {/* Stop/Send button */}
            <Button
              size="icon"
              className="h-10 w-10 flex-shrink-0 bg-destructive hover:bg-destructive/90"
              onClick={stopRecording}
              title="Parar e enviar"
            >
              <Square className="h-4 w-4 fill-current" />
            </Button>
          </div>
        ) : audioBlob ? (
          <div className="flex items-end gap-2">
            {/* Cancel recorded audio */}
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 flex-shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={clearAudio}
              title="Descartar áudio"
            >
              <Trash2 className="h-5 w-5" />
            </Button>

            {/* Audio preview */}
            <div className="flex-1 flex items-center gap-3 px-4 py-2 bg-primary/10 rounded-lg border border-primary/30">
              <Mic className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium">
                Áudio gravado
              </span>
              <span className="text-sm font-mono text-muted-foreground">
                {formatDuration(duration)}
              </span>
            </div>

            {/* Send audio button */}
            <Button
              size="icon"
              className="h-10 w-10 flex-shrink-0"
              onClick={handleSendAudio}
              disabled={sending || isUploading}
            >
              {(sending || isUploading) ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </Button>
          </div>
        ) : (
          <div className={cn(
            "flex flex-col gap-2",
            !isMobile && "flex-row items-end"
          )}>
            {/* Action buttons row */}
            <div className="flex items-center gap-1">
              {/* Start Flow button */}
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 flex-shrink-0"
                onClick={() => setShowStartFlowDialog(true)}
                title="Iniciar fluxo"
              >
                <Zap className="h-4 w-4 text-primary" />
              </Button>

              {/* Quick Replies button */}
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 flex-shrink-0"
                onClick={() => setShowQuickReplies(!showQuickReplies)}
                title="Respostas rápidas"
              >
                <Reply className="h-4 w-4" />
              </Button>

              {/* Attachment button */}
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 flex-shrink-0"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || sending}
              >
                {isUploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
              </Button>

              {/* Schedule message button */}
              <Button
                variant="ghost"
                size="icon"
                className={cn("h-9 w-9 flex-shrink-0 relative", scheduledMessages.length > 0 && "text-primary")}
                onClick={() => setShowScheduleDialog(true)}
                title="Agendar mensagem"
              >
                <CalendarClock className="h-4 w-4" />
                {scheduledMessages.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                    {scheduledMessages.length}
                  </span>
                )}
              </Button>

              {/* Emoji picker */}
              <EmojiPicker
                isOpen={showEmojiPicker}
                onToggle={() => setShowEmojiPicker(!showEmojiPicker)}
                onClose={() => setShowEmojiPicker(false)}
                onEmojiSelect={handleEmojiSelect}
              />
            </div>

            {/* Text input + send button row */}
            <div className="flex items-end gap-2 flex-1">
              {/* Message input with mentions */}
              <div className="relative flex-1">
                <Textarea
                  ref={textareaRef}
                  placeholder="Digite uma mensagem... Use @ para mencionar"
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={(e) => {
                    // Don't trigger send if mentions are showing
                    if (showMentionSuggestions && (e.key === "Enter" || e.key === "Tab" || e.key === "ArrowUp" || e.key === "ArrowDown")) {
                      return; // Let mention suggestions handle it
                    }
                    handleKeyPress(e);
                  }}
                  className="min-h-[40px] max-h-[120px] resize-none"
                  rows={1}
                />
                
                {/* Mention suggestions */}
                {showMentionSuggestions && (
                  <MentionSuggestions
                    query={mentionQuery}
                    team={team}
                    onSelect={handleSelectMember}
                    onClose={closeSuggestions}
                    position={suggestionPosition}
                  />
                )}
              </div>

              {/* Mic button (when no text) or Send button (when has text) */}
              {messageText.trim() ? (
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
              ) : (
                <div className="flex items-center gap-1">
                  {/* Transcription button */}
                  {isSpeechSupported && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-10 w-10 flex-shrink-0"
                      onClick={handleStartTranscription}
                      title="Transcrever voz para texto (grátis)"
                    >
                      <MessageSquare className="h-5 w-5" />
                    </Button>
                  )}
                  
                  {/* Audio recording button */}
                  <Button
                    size="icon"
                    variant="secondary"
                    className="h-10 w-10 flex-shrink-0"
                    onClick={handleStartRecording}
                    title="Gravar áudio"
                  >
                    <Mic className="h-5 w-5" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      )}

      {/* Schedule Message Dialog */}
      <ScheduleMessageDialog
        open={showScheduleDialog}
        onOpenChange={setShowScheduleDialog}
        scheduledMessages={scheduledMessages}
        sending={schedulingMessage}
        onSchedule={async (data) => {
          if (!conversation?.id) return;
          setSchedulingMessage(true);
          try {
            await scheduleMessage(conversation.id, data);
            const updated = await getScheduledMessages(conversation.id);
            setScheduledMessages(updated);
            toast.success("Mensagem agendada!");
          } catch (error) {
            toast.error("Erro ao agendar mensagem");
          } finally {
            setSchedulingMessage(false);
          }
        }}
        onCancelScheduled={async (id) => {
          try {
            await cancelScheduledMessage(id);
            setScheduledMessages(prev => prev.filter(m => m.id !== id));
            toast.success("Agendamento cancelado");
          } catch (error) {
            toast.error("Erro ao cancelar agendamento");
          }
        }}
      />

      {/* Start Flow Dialog */}
      {conversation && (
        <StartFlowDialog
          open={showStartFlowDialog}
          onClose={() => setShowStartFlowDialog(false)}
          conversationId={conversation.id}
          connectionId={conversation.connection_id}
          onFlowStarted={() => {
            // Refresh pode ser adicionado aqui se necessário
          }}
        />
      )}

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

      {/* Department Dialog */}
      <Dialog open={showDepartmentDialog} onOpenChange={setShowDepartmentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Atribuir Departamento
            </DialogTitle>
            <DialogDescription>
              Selecione o departamento/fila para esta conversa.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Select value={selectedDepartmentId} onValueChange={setSelectedDepartmentId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um departamento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">
                  <span className="text-muted-foreground">Nenhum departamento</span>
                </SelectItem>
                {departments.filter(d => d.is_active).map(dept => (
                  <SelectItem key={dept.id} value={dept.id}>
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: dept.color }}
                      />
                      {dept.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {departments.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum departamento cadastrado. Acesse o menu Departamentos para criar.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDepartmentDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveDepartment} disabled={savingDepartment}>
              {savingDepartment && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Conversation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conversa</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta conversa? Essa ação remove permanentemente mensagens, notas e tags.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingConversation}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!onDeleteConversation) return;
                setDeletingConversation(true);
                try {
                  await onDeleteConversation();
                  setShowDeleteDialog(false);
                } finally {
                  setDeletingConversation(false);
                }
              }}
              disabled={deletingConversation}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingConversation ? (
                <span className="inline-flex items-center">
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Excluindo...
                </span>
              ) : (
                'Excluir'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

      {/* Edit Contact Dialog */}
      <Dialog open={showEditContactDialog} onOpenChange={setShowEditContactDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Contato</DialogTitle>
            <DialogDescription>
              Edite o nome do contato para {conversation?.contact_phone}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="contact-name">Nome</Label>
              <Input
                id="contact-name"
                placeholder="Nome do contato"
                value={editingContactName}
                onChange={(e) => setEditingContactName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !savingContact) {
                    handleSaveContact();
                  }
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              O contato será vinculado à conexão: <strong>{conversation?.connection_name}</strong>
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditContactDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveContact} disabled={savingContact || !editingContactName.trim()}>
              {savingContact && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>

      {/* Quick Replies Panel */}
      {showQuickReplies && (
        <QuickRepliesPanel
          onSelect={(content) => {
            // Replace {nome} with contact name
            const contactName = conversation?.contact_name || '';
            const processedContent = content.replace(/\{nome\}/gi, contactName);
            setMessageText(processedContent);
          }}
          onClose={() => setShowQuickReplies(false)}
        />
      )}

      {/* Notes Panel */}
      {showNotes && conversation && (
        <NotesPanel
          conversationId={conversation.id}
          onClose={() => setShowNotes(false)}
        />
      )}

      {/* Deal Link Dialog */}
      {conversation && (
        <DealLinkDialog
          open={showDealDialog}
          onOpenChange={setShowDealDialog}
          contactName={conversation.contact_name}
          contactPhone={conversation.contact_phone}
        />
      )}

      {/* Deal Detail Dialog - for opening existing deals from chat */}
      <DealDetailDialog
        deal={selectedDeal}
        open={showDealDetailDialog}
        onOpenChange={(open) => {
          setShowDealDetailDialog(open);
          if (!open) setSelectedDeal(null);
        }}
      />
    </div>
  );
}
