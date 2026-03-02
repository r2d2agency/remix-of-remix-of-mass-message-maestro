import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, ArrowRight, UserCheck, X, CheckSquare } from "lucide-react";
import { CRMStage, CRMFunnel } from "@/hooks/use-crm";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface BulkActionBarProps {
  selectedCount: number;
  stages: CRMStage[];
  funnels?: CRMFunnel[];
  currentFunnelId?: string;
  owners?: { id: string; name: string }[];
  onMoveToStage: (stageId: string) => void;
  onMoveToFunnel: (funnelId: string) => void;
  onChangeOwner: (ownerId: string) => void;
  onDeleteAll: () => void;
  onClearSelection: () => void;
  onSelectAll: () => void;
  totalDeals: number;
}

export function BulkActionBar({
  selectedCount,
  stages,
  funnels,
  currentFunnelId,
  owners,
  onMoveToStage,
  onMoveToFunnel,
  onChangeOwner,
  onDeleteAll,
  onClearSelection,
  onSelectAll,
  totalDeals,
}: BulkActionBarProps) {
  if (selectedCount === 0) return null;

  const otherFunnels = funnels?.filter(f => f.id !== currentFunnelId) || [];

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-primary/10 border-b animate-in slide-in-from-top-2 duration-200">
      <div className="flex items-center gap-2">
        <CheckSquare className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">
          {selectedCount} selecionado{selectedCount !== 1 ? "s" : ""}
        </span>
        {selectedCount < totalDeals && (
          <Button variant="link" size="sm" className="text-xs p-0 h-auto" onClick={onSelectAll}>
            Selecionar todos ({totalDeals})
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2 ml-auto">
        {/* Move to stage */}
        <Select onValueChange={onMoveToStage}>
          <SelectTrigger className="w-[180px] h-8 text-xs">
            <ArrowRight className="h-3 w-3 mr-1" />
            <SelectValue placeholder="Mover para etapa" />
          </SelectTrigger>
          <SelectContent>
            {stages.map((stage) => (
              <SelectItem key={stage.id} value={stage.id!}>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: stage.color }} />
                  {stage.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Move to another funnel */}
        {otherFunnels.length > 0 && (
          <Select onValueChange={onMoveToFunnel}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <ArrowRight className="h-3 w-3 mr-1" />
              <SelectValue placeholder="Mover para funil" />
            </SelectTrigger>
            <SelectContent>
              {otherFunnels.map((funnel) => (
                <SelectItem key={funnel.id} value={funnel.id}>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: funnel.color }} />
                    {funnel.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Change owner */}
        {owners && owners.length > 0 && (
          <Select onValueChange={onChangeOwner}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <UserCheck className="h-3 w-3 mr-1" />
              <SelectValue placeholder="Alterar responsável" />
            </SelectTrigger>
            <SelectContent>
              {owners.map((owner) => (
                <SelectItem key={owner.id} value={owner.id}>
                  {owner.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Delete all */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" className="h-8 text-xs">
              <Trash2 className="h-3 w-3 mr-1" />
              Excluir
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir {selectedCount} negociação(ões)?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação não pode ser desfeita. Todas as negociações selecionadas serão removidas permanentemente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={onDeleteAll} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Clear selection */}
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onClearSelection}>
          <X className="h-3 w-3 mr-1" />
          Limpar
        </Button>
      </div>
    </div>
  );
}
