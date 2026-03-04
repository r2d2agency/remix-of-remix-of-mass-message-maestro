import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CRMCompany, useCRMCompanyMutations } from "@/hooks/use-crm";
import { useCRMSegments } from "@/hooks/use-crm-config";
import { useContacts, Contact, ContactList } from "@/hooks/use-contacts";
import { Tag, User, Plus, Trash2, Phone, Search, UserPlus, Loader2, Mail, MapPin, Building2, ChevronDown, Users, Briefcase, CalendarDays, DollarSign, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface CompanyContact {
  id?: string;
  name: string;
  phone: string;
  email?: string;
  role?: string;
  is_primary?: boolean;
}

interface Partner {
  name: string;
  qualification: string;
  entry_date?: string;
}

interface SecondaryCnae {
  code: string;
  description: string;
}

interface CompanyDialogProps {
  company: CRMCompany | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (company: CRMCompany) => void;
}

export function CompanyDialog({ company, open, onOpenChange, onCreated }: CompanyDialogProps) {
  const [formData, setFormData] = useState({
    name: "",
    trading_name: "",
    cnpj: "",
    email: "",
    phone: "",
    website: "",
    address: "",
    neighborhood: "",
    city: "",
    state: "",
    zip_code: "",
    notes: "",
    segment_id: "",
    capital_social: "",
    cnae: "",
    cnae_description: "",
    legal_nature: "",
    company_status: "",
    founding_date: "",
  });

  const [partners, setPartners] = useState<Partner[]>([]);
  const [secondaryCnaes, setSecondaryCnaes] = useState<SecondaryCnae[]>([]);
  const [contacts, setContacts] = useState<CompanyContact[]>([]);
  const [newContact, setNewContact] = useState({ name: "", phone: "", email: "", role: "" });
  const [contactMode, setContactMode] = useState<"new" | "existing">("new");
  const [contactLists, setContactLists] = useState<ContactList[]>([]);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [listContacts, setListContacts] = useState<Contact[]>([]);
  const [searchContact, setSearchContact] = useState("");
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [lookingUpCNPJ, setLookingUpCNPJ] = useState(false);
  const [extraInfoOpen, setExtraInfoOpen] = useState(false);

  const { createCompany, updateCompany } = useCRMCompanyMutations();
  const { data: segments } = useCRMSegments();
  const contactsApi = useContacts();

  useEffect(() => {
    contactsApi.getLists().then(setContactLists).catch(console.error);
  }, []);

  useEffect(() => {
    if (selectedListId) {
      contactsApi.getContacts(selectedListId).then(setListContacts).catch(console.error);
    }
  }, [selectedListId]);

  useEffect(() => {
    if (company) {
      setFormData({
        name: company.name || "",
        trading_name: company.trading_name || "",
        cnpj: company.cnpj || "",
        email: company.email || "",
        phone: company.phone || "",
        website: company.website || "",
        address: company.address || "",
        neighborhood: company.neighborhood || "",
        city: company.city || "",
        state: company.state || "",
        zip_code: company.zip_code || "",
        notes: company.notes || "",
        segment_id: company.segment_id || "",
        capital_social: company.capital_social ? String(company.capital_social) : "",
        cnae: company.cnae || "",
        cnae_description: company.cnae_description || "",
        legal_nature: company.legal_nature || "",
        company_status: company.company_status || "",
        founding_date: company.founding_date || "",
      });
      setPartners(company.partners || []);
      setSecondaryCnaes(company.secondary_cnaes || []);
      setContacts([]);
    } else {
      setFormData({
        name: "", trading_name: "", cnpj: "", email: "", phone: "", website: "",
        address: "", neighborhood: "", city: "", state: "", zip_code: "", notes: "",
        segment_id: "", capital_social: "", cnae: "", cnae_description: "",
        legal_nature: "", company_status: "", founding_date: "",
      });
      setPartners([]);
      setSecondaryCnaes([]);
      setContacts([]);
      setExtraInfoOpen(false);
    }
  }, [company, open]);

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleLookupCNPJ = async () => {
    const cnpj = formData.cnpj.replace(/\D/g, "");
    if (cnpj.length !== 14) {
      toast.error("CNPJ deve ter 14 dígitos");
      return;
    }
    setLookingUpCNPJ(true);
    try {
      const data = await api<any>(`/api/cnpj/lookup/${cnpj}`);
      const empresa = data.empresa || {};
      const estabelecimento = data.estabelecimento || {};
      const socios = data.socios || [];

      const addressParts = [
        estabelecimento.tipo_logradouro,
        estabelecimento.logradouro,
        estabelecimento.numero,
        estabelecimento.complemento,
      ].filter(Boolean);

      // Parse partners
      const parsedPartners: Partner[] = socios.map((s: any) => ({
        name: s.nome_socio || "",
        qualification: s.qualificacao_descricao || "",
        entry_date: s.data_entrada ? `${s.data_entrada.substring(6, 8)}/${s.data_entrada.substring(4, 6)}/${s.data_entrada.substring(0, 4)}` : "",
      }));

      // Parse secondary CNAEs
      const parsedCnaes: SecondaryCnae[] = (estabelecimento.cnaes_secundarios || []).map((c: any) => ({
        code: c.codigo || c.subclasse || "",
        description: c.descricao || "",
      }));

      // Situação cadastral
      const situacoes: Record<string, string> = { "01": "Nula", "02": "Ativa", "03": "Suspensa", "04": "Inapta", "08": "Baixada" };
      const status = situacoes[estabelecimento.situacao_cadastral] || estabelecimento.situacao_cadastral || "";

      // Founding date
      let foundingDate = "";
      if (estabelecimento.data_inicio_atividade) {
        const d = estabelecimento.data_inicio_atividade;
        foundingDate = `${d.substring(6, 8)}/${d.substring(4, 6)}/${d.substring(0, 4)}`;
      }

      // Phone
      let phone = formData.phone;
      if (estabelecimento.ddd1 && estabelecimento.telefone1) {
        phone = `(${estabelecimento.ddd1}) ${estabelecimento.telefone1}`;
      }

      setFormData((prev) => ({
        ...prev,
        name: empresa.razao_social || prev.name,
        trading_name: estabelecimento.nome_fantasia || prev.trading_name,
        email: estabelecimento.email || prev.email,
        phone,
        address: addressParts.join(", ") || prev.address,
        neighborhood: estabelecimento.bairro || prev.neighborhood,
        city: estabelecimento.municipio_nome || prev.city,
        state: estabelecimento.uf || prev.state,
        zip_code: estabelecimento.cep || prev.zip_code,
        capital_social: empresa.capital_social ? String(parseFloat(empresa.capital_social)) : prev.capital_social,
        cnae: estabelecimento.cnae_principal || prev.cnae,
        cnae_description: estabelecimento.cnae_principal_descricao || prev.cnae_description,
        legal_nature: empresa.natureza_descricao || prev.legal_nature,
        company_status: status || prev.company_status,
        founding_date: foundingDate || prev.founding_date,
      }));

      setPartners(parsedPartners);
      if (parsedCnaes.length > 0) setSecondaryCnaes(parsedCnaes);

      // Auto-expand extra info if we got data
      if (parsedPartners.length > 0 || empresa.capital_social) {
        setExtraInfoOpen(true);
      }

      toast.success("Dados da empresa preenchidos com sucesso!");
    } catch (e: any) {
      toast.error(e.message || "Erro ao consultar CNPJ");
    } finally {
      setLookingUpCNPJ(false);
    }
  };

  const handleAddContact = () => {
    if (!newContact.name.trim() || !newContact.phone.trim()) return;
    setContacts((prev) => [
      ...prev,
      { ...newContact, id: crypto.randomUUID(), is_primary: prev.length === 0 },
    ]);
    setNewContact({ name: "", phone: "", email: "", role: "" });
  };

  const handleRemoveContact = (id: string) => {
    setContacts((prev) => {
      const filtered = prev.filter((c) => c.id !== id);
      if (filtered.length > 0 && !filtered.some((c) => c.is_primary)) {
        filtered[0].is_primary = true;
      }
      return filtered;
    });
  };

  const handleSetPrimary = (id: string) => {
    setContacts((prev) => prev.map((c) => ({ ...c, is_primary: c.id === id })));
  };

  const handleSelectExistingContact = (contact: Contact) => {
    setContacts((prev) => [
      ...prev,
      {
        id: contact.id,
        name: contact.name,
        phone: contact.phone,
        email: (contact as any).email || "",
        is_primary: prev.length === 0,
      },
    ]);
    setPopoverOpen(false);
    setSearchContact("");
  };

  const handleSave = async () => {
    const data = {
      ...formData,
      capital_social: formData.capital_social ? parseFloat(formData.capital_social) : null,
      segment_id: formData.segment_id || undefined,
      contacts: contacts.length > 0 ? contacts : undefined,
      partners,
      secondary_cnaes: secondaryCnaes,
    };
    if (company) {
      updateCompany.mutate({ id: company.id, ...data } as any);
    } else {
      const newCompany = await createCompany.mutateAsync(data as any);
      if (newCompany && onCreated) {
        onCreated(newCompany);
      }
    }
    onOpenChange(false);
  };

  const formatCurrency = (value: string) => {
    const num = parseFloat(value);
    if (isNaN(num)) return "";
    return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden" aria-describedby={undefined}>
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>{company ? "Editar Empresa" : "Nova Empresa"}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 max-h-[calc(90vh-140px)]">
          <div className="space-y-4 p-1 pr-4">
            {/* Nome e Nome Fantasia */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Razão Social *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => handleChange("name", e.target.value)}
                  placeholder="Razão social da empresa"
                />
              </div>
              <div className="space-y-2">
                <Label>Nome Fantasia</Label>
                <Input
                  value={formData.trading_name}
                  onChange={(e) => handleChange("trading_name", e.target.value)}
                  placeholder="Nome fantasia"
                />
              </div>
            </div>

            {/* Segmento */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Tag className="h-4 w-4" />
                Segmento
              </Label>
              <Select
                value={formData.segment_id || "none"}
                onValueChange={(value) => handleChange("segment_id", value === "none" ? "" : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um segmento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {segments?.map((segment) => (
                    <SelectItem key={segment.id} value={segment.id}>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: segment.color }} />
                        {segment.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* CNPJ + Telefone */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>CNPJ</Label>
                <div className="flex gap-2">
                  <Input
                    value={formData.cnpj}
                    onChange={(e) => handleChange("cnpj", e.target.value)}
                    placeholder="00.000.000/0000-00"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleLookupCNPJ}
                    disabled={lookingUpCNPJ || formData.cnpj.replace(/\D/g, "").length < 14}
                    title="Consultar CNPJ"
                  >
                    {lookingUpCNPJ ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input
                  value={formData.phone}
                  onChange={(e) => handleChange("phone", e.target.value)}
                  placeholder="(00) 00000-0000"
                />
              </div>
            </div>

            {/* Email + Website */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange("email", e.target.value)}
                  placeholder="email@empresa.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Website</Label>
                <Input
                  value={formData.website}
                  onChange={(e) => handleChange("website", e.target.value)}
                  placeholder="https://empresa.com"
                />
              </div>
            </div>

            {/* Endereço section */}
            <div className="space-y-3 border-t pt-4">
              <Label className="flex items-center gap-2 text-base">
                <MapPin className="h-4 w-4" />
                Endereço
              </Label>

              <div className="space-y-2">
                <Label className="text-sm">Logradouro</Label>
                <Input
                  value={formData.address}
                  onChange={(e) => handleChange("address", e.target.value)}
                  placeholder="Rua, número, complemento"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm">Bairro</Label>
                  <Input
                    value={formData.neighborhood}
                    onChange={(e) => handleChange("neighborhood", e.target.value)}
                    placeholder="Bairro"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">CEP</Label>
                  <Input
                    value={formData.zip_code}
                    onChange={(e) => handleChange("zip_code", e.target.value)}
                    placeholder="00000-000"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm">Cidade</Label>
                  <Input
                    value={formData.city}
                    onChange={(e) => handleChange("city", e.target.value)}
                    placeholder="Cidade"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Estado</Label>
                  <Input
                    value={formData.state}
                    onChange={(e) => handleChange("state", e.target.value)}
                    placeholder="UF"
                    maxLength={2}
                  />
                </div>
              </div>
            </div>

            {/* Informações Adicionais - Collapsible */}
            <Collapsible open={extraInfoOpen} onOpenChange={setExtraInfoOpen}>
              <div className="border-t pt-4">
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between p-0 h-auto hover:bg-transparent">
                    <Label className="flex items-center gap-2 text-base cursor-pointer">
                      <Building2 className="h-4 w-4" />
                      Informações Adicionais
                      {(partners.length > 0 || formData.capital_social || formData.cnae) && (
                        <Badge variant="secondary" className="text-[10px]">
                          {[partners.length > 0 && `${partners.length} sócio(s)`, formData.cnae && "CNAE", formData.capital_social && "Capital"].filter(Boolean).join(" · ")}
                        </Badge>
                      )}
                    </Label>
                    <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", extraInfoOpen && "rotate-180")} />
                  </Button>
                </CollapsibleTrigger>

                <CollapsibleContent className="space-y-4 mt-4">
                  {/* Situação + Data Fundação */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5" />
                        Situação Cadastral
                      </Label>
                      <Input
                        value={formData.company_status}
                        onChange={(e) => handleChange("company_status", e.target.value)}
                        placeholder="Ativa, Baixada..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm flex items-center gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5" />
                        Início Atividade
                      </Label>
                      <Input
                        value={formData.founding_date}
                        onChange={(e) => handleChange("founding_date", e.target.value)}
                        placeholder="DD/MM/AAAA"
                      />
                    </div>
                  </div>

                  {/* Natureza Jurídica + Capital Social */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm flex items-center gap-1.5">
                        <Briefcase className="h-3.5 w-3.5" />
                        Natureza Jurídica
                      </Label>
                      <Input
                        value={formData.legal_nature}
                        onChange={(e) => handleChange("legal_nature", e.target.value)}
                        placeholder="Sociedade Limitada..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm flex items-center gap-1.5">
                        <DollarSign className="h-3.5 w-3.5" />
                        Capital Social
                      </Label>
                      <div className="relative">
                        <Input
                          value={formData.capital_social}
                          onChange={(e) => handleChange("capital_social", e.target.value.replace(/[^0-9.]/g, ""))}
                          placeholder="0.00"
                        />
                        {formData.capital_social && (
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                            {formatCurrency(formData.capital_social)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* CNAE Principal */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm">CNAE Principal</Label>
                      <Input
                        value={formData.cnae}
                        onChange={(e) => handleChange("cnae", e.target.value)}
                        placeholder="0000-0/00"
                      />
                    </div>
                    <div className="space-y-2 col-span-2">
                      <Label className="text-sm">Descrição CNAE</Label>
                      <Input
                        value={formData.cnae_description}
                        onChange={(e) => handleChange("cnae_description", e.target.value)}
                        placeholder="Atividade principal"
                      />
                    </div>
                  </div>

                  {/* CNAEs Secundários */}
                  {secondaryCnaes.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-sm text-muted-foreground">CNAEs Secundários ({secondaryCnaes.length})</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {secondaryCnaes.slice(0, 8).map((cnae, i) => (
                          <Badge key={i} variant="outline" className="text-[10px] font-normal">
                            {cnae.code} - {cnae.description}
                          </Badge>
                        ))}
                        {secondaryCnaes.length > 8 && (
                          <Badge variant="secondary" className="text-[10px]">
                            +{secondaryCnaes.length - 8} mais
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Sócios */}
                  <div className="space-y-3">
                    <Label className="text-sm flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5" />
                      Quadro Societário ({partners.length})
                    </Label>

                    {partners.length > 0 ? (
                      <div className="space-y-2">
                        {partners.map((partner, index) => (
                          <Card key={index} className="p-3">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center shrink-0">
                                  <User className="h-4 w-4 text-accent-foreground" />
                                </div>
                                <div className="min-w-0">
                                  <p className="font-medium text-sm truncate">{partner.name}</p>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <span>{partner.qualification}</span>
                                    {partner.entry_date && (
                                      <span className="flex items-center gap-1">
                                        <CalendarDays className="h-3 w-3" />
                                        {partner.entry_date}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                                onClick={() => setPartners((prev) => prev.filter((_, i) => i !== index))}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </Card>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">Nenhum sócio cadastrado. Consulte o CNPJ para preencher automaticamente.</p>
                    )}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>

            {/* Contacts Section */}
            <div className="space-y-3 border-t pt-4">
              <Label className="flex items-center gap-2 text-base">
                <User className="h-4 w-4" />
                Contatos da Empresa
              </Label>

              <Tabs value={contactMode} onValueChange={(v) => setContactMode(v as "new" | "existing")}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="new">
                    <Plus className="h-4 w-4 mr-2" />
                    Novo Contato
                  </TabsTrigger>
                  <TabsTrigger value="existing">
                    <UserPlus className="h-4 w-4 mr-2" />
                    Vincular Existente
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="new" className="mt-3">
                  <Card className="p-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        value={newContact.name}
                        onChange={(e) => setNewContact((p) => ({ ...p, name: e.target.value }))}
                        placeholder="Nome *"
                      />
                      <Input
                        value={newContact.phone}
                        onChange={(e) => setNewContact((p) => ({ ...p, phone: e.target.value }))}
                        placeholder="Telefone *"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        value={newContact.email}
                        onChange={(e) => setNewContact((p) => ({ ...p, email: e.target.value }))}
                        placeholder="Email"
                        type="email"
                      />
                      <Input
                        value={newContact.role}
                        onChange={(e) => setNewContact((p) => ({ ...p, role: e.target.value }))}
                        placeholder="Cargo"
                      />
                    </div>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={handleAddContact}
                      disabled={!newContact.name.trim() || !newContact.phone.trim()}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Adicionar Contato
                    </Button>
                  </Card>
                </TabsContent>

                <TabsContent value="existing" className="mt-3">
                  <Card className="p-3 space-y-3">
                    <div className="space-y-2">
                      <Label className="text-sm">Lista de Contatos</Label>
                      <Select
                        value={selectedListId || "none"}
                        onValueChange={(v) => setSelectedListId(v === "none" ? null : v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione uma lista" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Selecione...</SelectItem>
                          {contactLists.map((list) => (
                            <SelectItem key={list.id} value={list.id}>
                              {list.name} ({list.contact_count} contatos)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {selectedListId && (
                      <div className="space-y-2">
                        <Label className="text-sm">Buscar Contato</Label>
                        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                          <PopoverTrigger asChild>
                            <Button variant="outline" role="combobox" className="w-full justify-between">
                              <span className="flex items-center gap-2">
                                <Search className="h-4 w-4" />
                                Buscar na lista...
                              </span>
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[400px] p-0" align="start">
                            <Command>
                              <CommandInput
                                placeholder="Buscar por nome ou telefone..."
                                value={searchContact}
                                onValueChange={setSearchContact}
                              />
                              <CommandList>
                                <CommandEmpty>Nenhum contato encontrado.</CommandEmpty>
                                <CommandGroup>
                                  {listContacts
                                    .filter((c) => {
                                      const s = searchContact.toLowerCase();
                                      return c.name.toLowerCase().includes(s) || c.phone.includes(s);
                                    })
                                    .filter((c) => !contacts.some((cc) => cc.phone === c.phone))
                                    .slice(0, 10)
                                    .map((contact) => (
                                      <CommandItem
                                        key={contact.id}
                                        value={`${contact.name} ${contact.phone}`}
                                        onSelect={() => handleSelectExistingContact(contact)}
                                      >
                                        <div className="flex items-center gap-2">
                                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                                            <User className="h-4 w-4" />
                                          </div>
                                          <div>
                                            <p className="font-medium">{contact.name}</p>
                                            <p className="text-xs text-muted-foreground">{contact.phone}</p>
                                          </div>
                                        </div>
                                      </CommandItem>
                                    ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </div>
                    )}
                  </Card>
                </TabsContent>
              </Tabs>

              {/* Contacts List */}
              {contacts.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">
                    {contacts.length} contato{contacts.length > 1 ? "s" : ""} vinculado{contacts.length > 1 ? "s" : ""}
                  </Label>
                  {contacts.map((contact) => (
                    <Card key={contact.id} className="p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <User className="h-4 w-4 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm flex items-center gap-2 flex-wrap">
                              <span className="truncate">{contact.name}</span>
                              {contact.is_primary && (
                                <Badge variant="secondary" className="text-[10px]">Principal</Badge>
                              )}
                              {contact.role && (
                                <span className="text-muted-foreground font-normal text-xs">• {contact.role}</span>
                              )}
                            </p>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {contact.phone}
                              </span>
                              {contact.email && (
                                <span className="flex items-center gap-1">
                                  <Mail className="h-3 w-3" />
                                  {contact.email}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {!contact.is_primary && (
                            <Button variant="ghost" size="sm" onClick={() => handleSetPrimary(contact.id!)}>
                              Definir principal
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => handleRemoveContact(contact.id!)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* Observações */}
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => handleChange("notes", e.target.value)}
                placeholder="Anotações sobre a empresa..."
                rows={4}
              />
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="flex-shrink-0 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!formData.name.trim()}>
            {company ? "Salvar" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
