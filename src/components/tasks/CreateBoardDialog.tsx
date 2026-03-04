import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface CreateBoardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { name: string; type: 'global' | 'personal'; color: string }) => void;
  isAdmin: boolean;
}

const boardColors = ['#6366f1', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

export function CreateBoardDialog({ open, onOpenChange, onSubmit, isAdmin }: CreateBoardDialogProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<'global' | 'personal'>('personal');
  const [color, setColor] = useState('#6366f1');

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSubmit({ name: name.trim(), type, color });
    setName("");
    setType('personal');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Novo Quadro</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Nome</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Projetos Marketing" />
          </div>
          <div>
            <label className="text-sm font-medium">Tipo</label>
            <Select value={type} onValueChange={(v: 'global' | 'personal') => setType(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="personal">Pessoal (só você)</SelectItem>
                {isAdmin && <SelectItem value="global">Global (toda equipe)</SelectItem>}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">Cor</label>
            <div className="flex gap-2 mt-1">
              {boardColors.map(c => (
                <button
                  key={c}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${color === c ? 'border-foreground scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={!name.trim()}>Criar Quadro</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
