import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CRMFunnel, CRMStage, CRMCompany, useCRMDealMutations, useCRMCompanies, useCRMFunnel, useCRMGroups } from "@/hooks/use-crm";
import { Slider } from "@/components/ui/slider";

interface DealFormDialogProps {
  funnel: CRMFunnel | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DealFormDialog({ funnel, open, onOpenChange }: DealFormDialogProps) {
  const [title, setTitle] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [stageId, setStageId] = useState("");
  const [value, setValue] = useState("");
  const [probability, setProbability] = useState(50);
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  const [description, setDescription] = useState("");
  const [groupId, setGroupId] = useState("");

  const { data: companies } = useCRMCompanies();
  const { data: funnelData } = useCRMFunnel(funnel?.id || null);
  const { data: groups } = useCRMGroups();
  const { createDeal } = useCRMDealMutations();

  useEffect(() => {
    if (open && funnelData?.stages?.length) {
      // Set first non-final stage as default
      const firstStage = funnelData.stages.find((s) => !s.is_final);
      if (firstStage?.id) {
        setStageId(firstStage.id);
      }
    }
  }, [open, funnelData]);

  const handleSave = () => {
    if (!funnel || !title.trim() || !companyId || !stageId) return;

    createDeal.mutate({
      funnel_id: funnel.id,
      stage_id: stageId,
      company_id: companyId,
      title,
      value: Number(value) || 0,
      probability,
      expected_close_date: expectedCloseDate || undefined,
      description,
      group_id: groupId || undefined,
    });

    // Reset form
    setTitle("");
    setCompanyId("");
    setValue("");
    setProbability(50);
    setExpectedCloseDate("");
    setDescription("");
    setGroupId("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Nova Negociação</DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1">
          <div className="space-y-4 p-1">
            <div className="space-y-2">
              <Label>Título *</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Título da negociação"
              />
            </div>

            <div className="space-y-2">
              <Label>Empresa *</Label>
              <Select value={companyId} onValueChange={setCompanyId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma empresa" />
                </SelectTrigger>
                <SelectContent>
                  {companies?.map((company) => (
                    <SelectItem key={company.id} value={company.id}>
                      {company.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Etapa *</Label>
              <Select value={stageId} onValueChange={setStageId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a etapa" />
                </SelectTrigger>
                <SelectContent>
                  {funnelData?.stages
                    ?.filter((s) => !s.is_final)
                    .map((stage) => (
                      <SelectItem key={stage.id} value={stage.id!}>
                        {stage.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Valor (R$)</Label>
                <Input
                  type="number"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="0,00"
                  min={0}
                  step={0.01}
                />
              </div>
              <div className="space-y-2">
                <Label>Fechamento previsto</Label>
                <Input
                  type="date"
                  value={expectedCloseDate}
                  onChange={(e) => setExpectedCloseDate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Probabilidade de fechamento: {probability}%</Label>
              <Slider
                value={[probability]}
                onValueChange={([val]) => setProbability(val)}
                min={0}
                max={100}
                step={5}
              />
            </div>

            <div className="space-y-2">
              <Label>Grupo</Label>
              <Select value={groupId || "none"} onValueChange={(val) => setGroupId(val === "none" ? "" : val)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um grupo (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {groups?.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Detalhes da negociação..."
                rows={3}
              />
            </div>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={!title.trim() || !companyId || !stageId}
          >
            Criar Negociação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
