import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useCRMFunnels, useCRMCompanies, useCRMDealMutations, CRMDeal, CRMFunnel } from "@/hooks/use-crm";
import { Building2, Plus, Search, Briefcase, DollarSign, User, Phone, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface DealLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactName?: string;
  contactPhone?: string;
  linkedDeals?: CRMDeal[];
  onLinkDeal?: (dealId: string) => void;
  onUnlinkDeal?: (dealId: string) => void;
}

export function DealLinkDialog({
  open,
  onOpenChange,
  contactName,
  contactPhone,
  linkedDeals = [],
  onLinkDeal,
  onUnlinkDeal,
}: DealLinkDialogProps) {
  const [mode, setMode] = useState<"link" | "create">("link");
  const [searchDeal, setSearchDeal] = useState("");
  
  // New deal form
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [selectedFunnelId, setSelectedFunnelId] = useState<string>("");
  const [selectedStageId, setSelectedStageId] = useState<string>("");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [companySearch, setCompanySearch] = useState("");
  const [showCompanySearch, setShowCompanySearch] = useState(false);

  const { data: funnels, isLoading: loadingFunnels } = useCRMFunnels();
  const { data: companies } = useCRMCompanies(companySearch);
  const { createDeal } = useCRMDealMutations();

  const selectedFunnel = funnels?.find(f => f.id === selectedFunnelId);
  const stages = selectedFunnel?.stages || [];

  // Auto-select first funnel and stage
  const handleFunnelChange = (funnelId: string) => {
    setSelectedFunnelId(funnelId);
    const funnel = funnels?.find(f => f.id === funnelId);
    if (funnel?.stages?.length) {
      setSelectedStageId(funnel.stages[0].id || "");
    } else {
      setSelectedStageId("");
    }
  };

  const handleCreateDeal = async () => {
    if (!title.trim() || !selectedFunnelId || !selectedStageId) {
      toast.error("Preencha o título, funil e etapa");
      return;
    }

    try {
      await createDeal.mutateAsync({
        title: title.trim(),
        value: parseFloat(value) || 0,
        funnel_id: selectedFunnelId,
        stage_id: selectedStageId,
        company_id: selectedCompanyId || undefined,
        contact_name: contactName,
        contact_phone: contactPhone,
        probability: 50,
        status: "open",
      } as any);

      toast.success("Negociação criada!");
      onOpenChange(false);
      resetForm();
    } catch (error) {
      toast.error("Erro ao criar negociação");
    }
  };

  const resetForm = () => {
    setTitle("");
    setValue("");
    setSelectedFunnelId("");
    setSelectedStageId("");
    setSelectedCompanyId("");
    setCompanySearch("");
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 0,
    }).format(value);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            Negociações
          </DialogTitle>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => setMode(v as "link" | "create")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="link">
              <Search className="h-4 w-4 mr-2" />
              Vincular Existente
            </TabsTrigger>
            <TabsTrigger value="create">
              <Plus className="h-4 w-4 mr-2" />
              Nova Negociação
            </TabsTrigger>
          </TabsList>

          <TabsContent value="link" className="mt-4">
            {/* Contact info */}
            {(contactName || contactPhone) && (
              <Card className="p-3 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">{contactName || "Contato"}</p>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {contactPhone}
                    </p>
                  </div>
                </div>
              </Card>
            )}

            {/* Linked deals */}
            {linkedDeals.length > 0 && (
              <div className="mb-4">
                <Label className="text-sm text-muted-foreground mb-2 block">
                  Negociações vinculadas ({linkedDeals.length})
                </Label>
                <div className="space-y-2">
                  {linkedDeals.map((deal) => (
                    <Card key={deal.id} className="p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">{deal.title}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="outline" className="text-[10px]">
                              {deal.stage_name}
                            </Badge>
                            <span>{formatCurrency(deal.value)}</span>
                          </div>
                        </div>
                        {onUnlinkDeal && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onUnlinkDeal(deal.id)}
                          >
                            Desvincular
                          </Button>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Search deals - placeholder for future implementation */}
            <div className="text-center py-8 text-muted-foreground">
              <Briefcase className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Busca de negociações em breve</p>
              <p className="text-sm">Por enquanto, crie uma nova negociação</p>
            </div>
          </TabsContent>

          <TabsContent value="create" className="mt-4 space-y-4">
            {/* Contact info badge */}
            {(contactName || contactPhone) && (
              <Card className="p-3 bg-muted/50">
                <div className="flex items-center gap-2 text-sm">
                  <User className="h-4 w-4" />
                  <span>Contato: <strong>{contactName || contactPhone}</strong></span>
                </div>
              </Card>
            )}

            {/* Title */}
            <div className="space-y-2">
              <Label>Título da negociação *</Label>
              <Input
                placeholder="Ex: Proposta comercial"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            {/* Funnel & Stage */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Funil *</Label>
                <Select value={selectedFunnelId} onValueChange={handleFunnelChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {funnels?.filter(f => f.is_active).map((funnel) => (
                      <SelectItem key={funnel.id} value={funnel.id}>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: funnel.color }}
                          />
                          {funnel.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Etapa *</Label>
                <Select 
                  value={selectedStageId} 
                  onValueChange={setSelectedStageId}
                  disabled={!selectedFunnelId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {stages.map((stage) => (
                      <SelectItem key={stage.id} value={stage.id!}>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: stage.color }}
                          />
                          {stage.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Value */}
            <div className="space-y-2">
              <Label>Valor</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  placeholder="0,00"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Company (optional) */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Empresa (opcional)
              </Label>
              <Command className="border rounded-md">
                <CommandInput
                  placeholder="Buscar empresa..."
                  value={companySearch}
                  onValueChange={setCompanySearch}
                />
                {companySearch && (
                  <CommandList>
                    <CommandEmpty>Nenhuma empresa encontrada</CommandEmpty>
                    <CommandGroup>
                      {companies?.slice(0, 5).map((company) => (
                        <CommandItem
                          key={company.id}
                          value={company.name}
                          onSelect={() => {
                            setSelectedCompanyId(company.id);
                            setCompanySearch(company.name);
                          }}
                          className={cn(
                            selectedCompanyId === company.id && "bg-primary/10"
                          )}
                        >
                          <Building2 className="h-4 w-4 mr-2" />
                          <div>
                            <p>{company.name}</p>
                            {company.cnpj && (
                              <p className="text-xs text-muted-foreground">{company.cnpj}</p>
                            )}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                )}
              </Command>
              {selectedCompanyId && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedCompanyId("");
                    setCompanySearch("");
                  }}
                >
                  Limpar empresa
                </Button>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          {mode === "create" && (
            <Button 
              onClick={handleCreateDeal}
              disabled={!title.trim() || !selectedFunnelId || !selectedStageId || createDeal.isPending}
            >
              {createDeal.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Criando...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Criar Negociação
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
