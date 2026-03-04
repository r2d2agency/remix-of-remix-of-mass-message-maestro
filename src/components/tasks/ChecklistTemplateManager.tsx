import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useChecklistTemplates, useChecklistTemplateMutations, ChecklistItem } from "@/hooks/use-task-boards";
import { Plus, Trash2, Edit2, CalendarIcon, X, ListChecks, FileText } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function ChecklistTemplateManager() {
  const { data: templates, isLoading } = useChecklistTemplates();
  const { createTemplate, updateTemplate, deleteTemplate } = useChecklistTemplateMutations();
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [newItemText, setNewItemText] = useState("");

  const handleNew = () => {
    setEditId(null);
    setName("");
    setItems([]);
    setNewItemText("");
    setEditOpen(true);
  };

  const handleEdit = (tpl: any) => {
    setEditId(tpl.id);
    setName(tpl.name);
    setItems(tpl.items || []);
    setNewItemText("");
    setEditOpen(true);
  };

  const handleSave = () => {
    if (!name.trim()) { toast.error("Nome é obrigatório"); return; }
    if (editId) {
      updateTemplate.mutate({ id: editId, name: name.trim(), items });
      toast.success("Template atualizado!");
    } else {
      createTemplate.mutate({ name: name.trim(), items });
    }
    setEditOpen(false);
  };

  const handleDelete = (id: string) => {
    if (confirm("Excluir este template?")) {
      deleteTemplate.mutate(id);
    }
  };

  const handleAddItem = () => {
    if (!newItemText.trim()) return;
    setItems([...items, { text: newItemText.trim(), checked: false }]);
    setNewItemText("");
  };

  const handleRemoveItem = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx));
  };

  const handleSetItemDueDate = (idx: number, date: Date | undefined) => {
    const updated = [...items];
    updated[idx] = { ...updated[idx], due_date: date?.toISOString() };
    setItems(updated);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Templates de Checklist</h2>
        </div>
        <Button size="sm" onClick={handleNew}>
          <Plus className="h-4 w-4 mr-1" /> Novo Template
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : templates?.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center text-muted-foreground">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p>Nenhum template criado ainda</p>
            <p className="text-xs mt-1">Crie templates para reutilizar checklists em suas tarefas</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {templates?.map(tpl => (
            <Card key={tpl.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">{tpl.name}</CardTitle>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(tpl)}>
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(tpl.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-1">
                  {tpl.items.slice(0, 5).map((item: ChecklistItem, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <div className="w-3 h-3 rounded-sm border border-muted-foreground/30" />
                      <span className="flex-1 truncate">{item.text}</span>
                      {item.due_date && (
                        <span className="text-[10px]">{format(parseISO(item.due_date), "dd/MM", { locale: ptBR })}</span>
                      )}
                    </div>
                  ))}
                  {tpl.items.length > 5 && (
                    <span className="text-xs text-muted-foreground">+{tpl.items.length - 5} mais</span>
                  )}
                </div>
                <Badge variant="secondary" className="mt-2 text-[10px]">{tpl.items.length} itens</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit/Create dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar Template" : "Novo Template de Checklist"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nome do Template</label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Onboarding cliente" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Itens</label>
              <ScrollArea className="max-h-[300px]">
                <div className="space-y-1.5">
                  {items.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 border rounded-md group">
                      <span className="text-sm flex-1">{item.text}</span>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
                            <CalendarIcon className={cn("h-3 w-3", item.due_date ? "text-primary" : "text-muted-foreground")} />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={item.due_date ? parseISO(item.due_date) : undefined}
                            onSelect={(d) => handleSetItemDueDate(idx, d)}
                            initialFocus
                            className="pointer-events-auto"
                          />
                        </PopoverContent>
                      </Popover>
                      {item.due_date && (
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {format(parseISO(item.due_date), "dd/MM/yy", { locale: ptBR })}
                        </span>
                      )}
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleRemoveItem(idx)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
              <div className="flex gap-2">
                <Input
                  value={newItemText}
                  onChange={e => setNewItemText(e.target.value)}
                  placeholder="Novo item do checklist..."
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddItem())}
                />
                <Button variant="outline" size="sm" onClick={handleAddItem}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave}>{editId ? "Salvar" : "Criar Template"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
