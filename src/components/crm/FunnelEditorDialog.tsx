import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { CRMFunnel, CRMStage, useCRMFunnelMutations } from "@/hooks/use-crm";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { DndContext, closestCenter, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface FunnelEditorDialogProps {
  funnel: CRMFunnel | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface StageItemProps {
  stage: CRMStage;
  index: number;
  onChange: (index: number, field: keyof CRMStage, value: any) => void;
  onDelete: (index: number) => void;
}

function SortableStageItem({ stage, index, onChange, onDelete }: StageItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: stage.id || `new-${index}`,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <Card ref={setNodeRef} style={style} className="p-3">
      <div className="flex items-start gap-2">
        <button {...attributes} {...listeners} className="mt-2 cursor-grab">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </button>

        <div className="flex-1 space-y-3">
          <div className="flex gap-2">
            <div className="flex-1">
              <Label className="text-xs">Nome da etapa</Label>
              <Input
                value={stage.name}
                onChange={(e) => onChange(index, "name", e.target.value)}
                placeholder="Ex: Qualificação"
              />
            </div>
            <div className="w-20">
              <Label className="text-xs">Cor</Label>
              <Input
                type="color"
                value={stage.color}
                onChange={(e) => onChange(index, "color", e.target.value)}
                className="h-10 p-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">Horas inatividade</Label>
              <Input
                type="number"
                value={stage.inactivity_hours}
                onChange={(e) => onChange(index, "inactivity_hours", Number(e.target.value))}
                min={1}
              />
            </div>
            <div>
              <Label className="text-xs">Cor alerta</Label>
              <Input
                type="color"
                value={stage.inactivity_color}
                onChange={(e) => onChange(index, "inactivity_color", e.target.value)}
                className="h-10 p-1"
              />
            </div>
            <div className="flex items-end">
              <div className="flex items-center space-x-2">
                <Switch
                  checked={stage.is_final}
                  onCheckedChange={(checked) => onChange(index, "is_final", checked)}
                />
                <Label className="text-xs">Etapa final</Label>
              </div>
            </div>
          </div>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-destructive"
          onClick={() => onDelete(index)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}

export function FunnelEditorDialog({ funnel, open, onOpenChange }: FunnelEditorDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [stages, setStages] = useState<CRMStage[]>([]);

  const { createFunnel, updateFunnel } = useCRMFunnelMutations();

  useEffect(() => {
    if (funnel) {
      setName(funnel.name);
      setDescription(funnel.description || "");
      setColor(funnel.color);
      setStages(funnel.stages || []);
    } else {
      setName("");
      setDescription("");
      setColor("#6366f1");
      setStages([
        { name: "Novo", color: "#6366f1", position: 0, inactivity_hours: 24, inactivity_color: "#ef4444", is_final: false },
        { name: "Qualificação", color: "#8b5cf6", position: 1, inactivity_hours: 48, inactivity_color: "#ef4444", is_final: false },
        { name: "Proposta", color: "#0ea5e9", position: 2, inactivity_hours: 72, inactivity_color: "#ef4444", is_final: false },
        { name: "Negociação", color: "#f59e0b", position: 3, inactivity_hours: 48, inactivity_color: "#ef4444", is_final: false },
        { name: "Ganho", color: "#22c55e", position: 4, inactivity_hours: 0, inactivity_color: "#22c55e", is_final: true },
        { name: "Perdido", color: "#ef4444", position: 5, inactivity_hours: 0, inactivity_color: "#ef4444", is_final: true },
      ]);
    }
  }, [funnel, open]);

  const handleStageChange = (index: number, field: keyof CRMStage, value: any) => {
    const newStages = [...stages];
    newStages[index] = { ...newStages[index], [field]: value };
    setStages(newStages);
  };

  const handleAddStage = () => {
    setStages([
      ...stages,
      {
        name: `Etapa ${stages.length + 1}`,
        color: "#6366f1",
        position: stages.length,
        inactivity_hours: 24,
        inactivity_color: "#ef4444",
        is_final: false,
      },
    ]);
  };

  const handleDeleteStage = (index: number) => {
    if (stages.length <= 2) return; // Minimum 2 stages
    setStages(stages.filter((_, i) => i !== index));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = stages.findIndex((s) => (s.id || `new-${stages.indexOf(s)}`) === active.id);
    const newIndex = stages.findIndex((s) => (s.id || `new-${stages.indexOf(s)}`) === over.id);

    setStages(arrayMove(stages, oldIndex, newIndex));
  };

  const handleSave = () => {
    const stagesWithPosition = stages.map((s, i) => ({ ...s, position: i }));

    if (funnel) {
      updateFunnel.mutate({
        id: funnel.id,
        name,
        description,
        color,
        stages: stagesWithPosition,
      });
    } else {
      createFunnel.mutate({
        name,
        description,
        color,
        stages: stagesWithPosition,
      });
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>{funnel ? "Editar Funil" : "Novo Funil"}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="space-y-4 pr-4 pb-2">
            {/* Basic info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome do funil</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Vendas B2B"
                />
              </div>
              <div className="space-y-2">
                <Label>Cor</Label>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-20 h-10 p-1"
                  />
                  <Input
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    placeholder="#6366f1"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descreva o objetivo deste funil..."
                rows={2}
              />
            </div>

            {/* Stages */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Etapas do funil</Label>
                <Button variant="outline" size="sm" onClick={handleAddStage}>
                  <Plus className="h-4 w-4 mr-1" />
                  Adicionar etapa
                </Button>
              </div>

              <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext
                  items={stages.map((s, i) => s.id || `new-${i}`)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {stages.map((stage, index) => (
                      <SortableStageItem
                        key={stage.id || `new-${index}`}
                        stage={stage}
                        index={index}
                        onChange={handleStageChange}
                        onDelete={handleDeleteStage}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-shrink-0 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || stages.length < 2}>
            {funnel ? "Salvar" : "Criar Funil"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
