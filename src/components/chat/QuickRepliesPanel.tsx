import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Zap,
  Plus,
  Search,
  MoreVertical,
  Edit,
  Trash2,
  FolderOpen,
  X,
  Loader2,
} from "lucide-react";
import { useQuickReplies, QuickReply, CreateQuickReplyData } from "@/hooks/use-quick-replies";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

interface QuickRepliesPanelProps {
  onSelect: (content: string) => void;
  onClose: () => void;
}

export function QuickRepliesPanel({ onSelect, onClose }: QuickRepliesPanelProps) {
  const isMobile = useIsMobile();
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [editingReply, setEditingReply] = useState<QuickReply | null>(null);
  const [formData, setFormData] = useState<CreateQuickReplyData>({
    title: "",
    content: "",
    shortcut: "",
    category: "",
  });

  const {
    loading,
    getQuickReplies,
    getCategories,
    createQuickReply,
    updateQuickReply,
    deleteQuickReply,
  } = useQuickReplies();

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    loadReplies();
  }, [selectedCategory, searchQuery]);

  const loadData = async () => {
    const [replies, cats] = await Promise.all([
      getQuickReplies(),
      getCategories(),
    ]);
    setQuickReplies(replies);
    setCategories(cats);
  };

  const loadReplies = async () => {
    const replies = await getQuickReplies(
      selectedCategory || undefined,
      searchQuery || undefined
    );
    setQuickReplies(replies);
  };

  const handleCreate = () => {
    setEditingReply(null);
    setFormData({ title: "", content: "", shortcut: "", category: "" });
    setShowDialog(true);
  };

  const handleEdit = (reply: QuickReply) => {
    setEditingReply(reply);
    setFormData({
      title: reply.title,
      content: reply.content,
      shortcut: reply.shortcut || "",
      category: reply.category || "",
    });
    setShowDialog(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta resposta rápida?")) return;
    
    const success = await deleteQuickReply(id);
    if (success) {
      toast.success("Resposta rápida excluída!");
      loadData();
    } else {
      toast.error("Erro ao excluir resposta rápida");
    }
  };

  const handleSave = async () => {
    if (!formData.title.trim() || !formData.content.trim()) {
      toast.error("Título e conteúdo são obrigatórios");
      return;
    }

    let result;
    if (editingReply) {
      result = await updateQuickReply(editingReply.id, formData);
    } else {
      result = await createQuickReply(formData);
    }

    if (result) {
      toast.success(editingReply ? "Resposta atualizada!" : "Resposta criada!");
      setShowDialog(false);
      loadData();
    } else {
      toast.error("Erro ao salvar resposta rápida");
    }
  };

  const handleSelectReply = (reply: QuickReply) => {
    onSelect(reply.content);
    onClose();
  };

  return (
    <div className={cn(
      "flex flex-col bg-card",
      isMobile 
        ? "fixed inset-0 z-50 h-full w-full" 
        : "h-full border-l w-80"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Respostas Rápidas</h3>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={handleCreate}>
            <Plus className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="p-3 border-b space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar respostas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Categories */}
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-1">
            <Badge
              variant={selectedCategory === "" ? "default" : "outline"}
              className="cursor-pointer text-xs"
              onClick={() => setSelectedCategory("")}
            >
              Todas
            </Badge>
            {categories.map((cat) => (
              <Badge
                key={cat}
                variant={selectedCategory === cat ? "default" : "outline"}
                className="cursor-pointer text-xs"
                onClick={() => setSelectedCategory(cat)}
              >
                {cat}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* List */}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : quickReplies.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
            <FolderOpen className="h-10 w-10 mb-2 opacity-50" />
            <p className="text-sm">Nenhuma resposta rápida</p>
            <Button variant="link" size="sm" onClick={handleCreate}>
              Criar primeira
            </Button>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {quickReplies.map((reply) => (
              <div
                key={reply.id}
                className={cn(
                  "group flex items-start gap-2 p-3 rounded-lg cursor-pointer",
                  "hover:bg-muted/50 transition-colors"
                )}
                onClick={() => handleSelectReply(reply)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">
                      {reply.title}
                    </span>
                    {reply.shortcut && (
                      <Badge variant="secondary" className="text-[10px] px-1">
                        /{reply.shortcut}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                    {reply.content}
                  </p>
                  {reply.category && (
                    <Badge variant="outline" className="text-[10px] mt-1">
                      {reply.category}
                    </Badge>
                  )}
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100"
                    >
                      <MoreVertical className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEdit(reply); }}>
                      <Edit className="h-4 w-4 mr-2" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={(e) => { e.stopPropagation(); handleDelete(reply.id); }}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingReply ? "Editar Resposta Rápida" : "Nova Resposta Rápida"}
            </DialogTitle>
            <DialogDescription>
              Crie mensagens pré-definidas para usar no chat.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Título *</label>
              <Input
                placeholder="Ex: Saudação inicial"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              />
            </div>

            <div>
              <label className="text-sm font-medium">Conteúdo *</label>
              <Textarea
                placeholder="Digite o texto da mensagem..."
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                rows={4}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Use {"{{nome}}"} para inserir o nome do contato
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Atalho</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">/</span>
                  <Input
                    placeholder="saudacao"
                    value={formData.shortcut}
                    onChange={(e) => setFormData({ ...formData, shortcut: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '') })}
                    className="pl-7"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">Categoria</label>
                <Input
                  placeholder="Geral"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  list="categories"
                />
                <datalist id="categories">
                  {categories.map((cat) => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
