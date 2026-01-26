import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CRMTask, useCRMTaskMutations } from "@/hooks/use-crm";
import { useOrganizationMembers } from "@/hooks/use-organizations";
import { useAuth } from "@/contexts/AuthContext";

interface TaskDialogProps {
  task: CRMTask | null;
  dealId?: string;
  companyId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TaskDialog({ task, dealId, companyId, open, onOpenChange }: TaskDialogProps) {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("task");
  const [priority, setPriority] = useState("medium");
  const [dueDate, setDueDate] = useState("");
  const [assignedTo, setAssignedTo] = useState("");

  const { data: members } = useOrganizationMembers(user?.organization_id || null);
  const { createTask, updateTask } = useCRMTaskMutations();

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || "");
      setType(task.type);
      setPriority(task.priority);
      setDueDate(task.due_date ? task.due_date.slice(0, 16) : "");
      setAssignedTo(task.assigned_to || "");
    } else {
      setTitle("");
      setDescription("");
      setType("task");
      setPriority("medium");
      setDueDate("");
      setAssignedTo(user?.id || "");
    }
  }, [task, open, user]);

  const handleSave = () => {
    if (!title.trim()) return;

    const data = {
      title,
      description,
      type: type as CRMTask['type'],
      priority: priority as CRMTask['priority'],
      due_date: dueDate || undefined,
      assigned_to: assignedTo || undefined,
      deal_id: dealId,
      company_id: companyId,
    };

    if (task) {
      updateTask.mutate({ id: task.id, ...data });
    } else {
      createTask.mutate(data);
    }

    onOpenChange(false);
  };

  const typeOptions = [
    { value: "task", label: "Tarefa" },
    { value: "call", label: "Ligação" },
    { value: "email", label: "Email" },
    { value: "meeting", label: "Reunião" },
    { value: "follow_up", label: "Follow-up" },
  ];

  const priorityOptions = [
    { value: "low", label: "Baixa" },
    { value: "medium", label: "Média" },
    { value: "high", label: "Alta" },
    { value: "urgent", label: "Urgente" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{task ? "Editar Tarefa" : "Nova Tarefa"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Título *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="O que precisa ser feito?"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {typeOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Prioridade</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {priorityOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Responsável</Label>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {members?.map((member) => (
                  <SelectItem key={member.user_id} value={member.user_id}>
                    {member.user_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Data/Hora</Label>
            <Input
              type="datetime-local"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalhes da tarefa..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!title.trim()}>
            {task ? "Salvar" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
