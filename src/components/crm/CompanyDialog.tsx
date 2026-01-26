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
import { CRMCompany, useCRMCompanyMutations } from "@/hooks/use-crm";
import { useCRMSegments } from "@/hooks/use-crm-config";
import { Tag, User, Plus, Trash2, Phone } from "lucide-react";

interface CompanyContact {
  id?: string;
  name: string;
  phone: string;
  email?: string;
  role?: string;
  is_primary?: boolean;
}

interface CompanyDialogProps {
  company: CRMCompany | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CompanyDialog({ company, open, onOpenChange }: CompanyDialogProps) {
  const [formData, setFormData] = useState({
    name: "",
    cnpj: "",
    email: "",
    phone: "",
    website: "",
    address: "",
    city: "",
    state: "",
    zip_code: "",
    notes: "",
    segment_id: "",
  });

  const [contacts, setContacts] = useState<CompanyContact[]>([]);
  const [newContact, setNewContact] = useState({ name: "", phone: "", email: "", role: "" });

  const { createCompany, updateCompany } = useCRMCompanyMutations();
  const { data: segments } = useCRMSegments();

  useEffect(() => {
    if (company) {
      setFormData({
        name: company.name || "",
        cnpj: company.cnpj || "",
        email: company.email || "",
        phone: company.phone || "",
        website: company.website || "",
        address: company.address || "",
        city: company.city || "",
        state: company.state || "",
        zip_code: company.zip_code || "",
        notes: company.notes || "",
        segment_id: company.segment_id || "",
      });
      // TODO: Load existing contacts from API
      setContacts([]);
    } else {
      setFormData({
        name: "",
        cnpj: "",
        email: "",
        phone: "",
        website: "",
        address: "",
        city: "",
        state: "",
        zip_code: "",
        notes: "",
        segment_id: "",
      });
      setContacts([]);
    }
  }, [company, open]);

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleAddContact = () => {
    if (!newContact.name.trim() || !newContact.phone.trim()) return;
    
    setContacts((prev) => [
      ...prev,
      {
        ...newContact,
        id: crypto.randomUUID(),
        is_primary: prev.length === 0, // First contact is primary
      },
    ]);
    setNewContact({ name: "", phone: "", email: "", role: "" });
  };

  const handleRemoveContact = (id: string) => {
    setContacts((prev) => {
      const filtered = prev.filter((c) => c.id !== id);
      // If we removed the primary, make first one primary
      if (filtered.length > 0 && !filtered.some((c) => c.is_primary)) {
        filtered[0].is_primary = true;
      }
      return filtered;
    });
  };

  const handleSetPrimary = (id: string) => {
    setContacts((prev) =>
      prev.map((c) => ({ ...c, is_primary: c.id === id }))
    );
  };

  const handleSave = () => {
    const data = {
      ...formData,
      segment_id: formData.segment_id || undefined,
      contacts: contacts.length > 0 ? contacts : undefined,
    };
    if (company) {
      updateCompany.mutate({ id: company.id, ...data } as any);
    } else {
      createCompany.mutate(data as any);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden" aria-describedby={undefined}>
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>{company ? "Editar Empresa" : "Nova Empresa"}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 max-h-[calc(90vh-140px)]">
          <div className="space-y-4 p-1 pr-4">
            <div className="space-y-2">
              <Label>Nome da empresa *</Label>
              <Input
                value={formData.name}
                onChange={(e) => handleChange("name", e.target.value)}
                placeholder="Nome da empresa"
              />
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
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: segment.color }}
                        />
                        {segment.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>CNPJ</Label>
                <Input
                  value={formData.cnpj}
                  onChange={(e) => handleChange("cnpj", e.target.value)}
                  placeholder="00.000.000/0000-00"
                />
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

            <div className="space-y-2">
              <Label>Endereço</Label>
              <Input
                value={formData.address}
                onChange={(e) => handleChange("address", e.target.value)}
                placeholder="Rua, número, bairro"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Cidade</Label>
                <Input
                  value={formData.city}
                  onChange={(e) => handleChange("city", e.target.value)}
                  placeholder="Cidade"
                />
              </div>
              <div className="space-y-2">
                <Label>Estado</Label>
                <Input
                  value={formData.state}
                  onChange={(e) => handleChange("state", e.target.value)}
                  placeholder="UF"
                  maxLength={2}
                />
              </div>
              <div className="space-y-2">
                <Label>CEP</Label>
                <Input
                  value={formData.zip_code}
                  onChange={(e) => handleChange("zip_code", e.target.value)}
                  placeholder="00000-000"
                />
              </div>
            </div>

            {/* Contacts Section */}
            <div className="space-y-3 border-t pt-4">
              <Label className="flex items-center gap-2 text-base">
                <User className="h-4 w-4" />
                Contatos da Empresa
              </Label>

              {/* Add Contact Form */}
              <Card className="p-3">
                <div className="grid grid-cols-4 gap-2">
                  <Input
                    value={newContact.name}
                    onChange={(e) => setNewContact((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Nome"
                  />
                  <Input
                    value={newContact.phone}
                    onChange={(e) => setNewContact((p) => ({ ...p, phone: e.target.value }))}
                    placeholder="Telefone"
                  />
                  <Input
                    value={newContact.role}
                    onChange={(e) => setNewContact((p) => ({ ...p, role: e.target.value }))}
                    placeholder="Cargo"
                  />
                  <Button
                    variant="outline"
                    onClick={handleAddContact}
                    disabled={!newContact.name.trim() || !newContact.phone.trim()}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </Card>

              {/* Contacts List */}
              {contacts.length > 0 && (
                <div className="space-y-2">
                  {contacts.map((contact) => (
                    <Card key={contact.id} className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <User className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium text-sm flex items-center gap-2">
                              {contact.name}
                              {contact.is_primary && (
                                <Badge variant="secondary" className="text-[10px]">Principal</Badge>
                              )}
                              {contact.role && (
                                <span className="text-muted-foreground font-normal">• {contact.role}</span>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {contact.phone}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {!contact.is_primary && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSetPrimary(contact.id!)}
                            >
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

            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => handleChange("notes", e.target.value)}
                placeholder="Anotações sobre a empresa..."
                rows={3}
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
