import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import {
  FileSpreadsheet,
  Upload,
  Loader2,
  Trash2,
  Edit,
  Building2,
  Check,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";

interface ImportedCompany {
  id: string;
  name: string;
  cnpj?: string;
  email?: string;
  phone?: string;
  city?: string;
  state?: string;
  address?: string;
  website?: string;
  notes?: string;
  selected: boolean;
  rawData: Record<string, string>;
}

interface ColumnMapping {
  name: string;
  cnpj?: string;
  email?: string;
  phone?: string;
  city?: string;
  state?: string;
  address?: string;
  website?: string;
  notes?: string;
}

interface CompanyImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (companies: Partial<ImportedCompany>[]) => Promise<void>;
}

// Field aliases for dynamic column detection
const FIELD_ALIASES: Record<keyof ColumnMapping, string[]> = {
  name: ["nome", "empresa", "razao social", "razão social", "company", "name", "organização", "organizacao"],
  cnpj: ["cnpj", "cpf/cnpj", "documento", "tax id", "ein"],
  email: ["email", "e-mail", "correio", "mail"],
  phone: ["telefone", "phone", "celular", "fone", "tel", "contato"],
  city: ["cidade", "city", "município", "municipio"],
  state: ["estado", "state", "uf"],
  address: ["endereço", "endereco", "address", "rua", "logradouro"],
  website: ["website", "site", "url", "web", "página", "pagina"],
  notes: ["observação", "observacao", "notas", "notes", "obs", "descrição", "descricao"],
};

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function detectColumnMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = { name: "" };

  for (const header of headers) {
    const normalized = normalizeText(header);

    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      // Exact match
      if (aliases.includes(normalized)) {
        mapping[field as keyof ColumnMapping] = header;
        continue;
      }
      // Starts with
      if (aliases.some((alias) => normalized.startsWith(alias))) {
        if (!mapping[field as keyof ColumnMapping]) {
          mapping[field as keyof ColumnMapping] = header;
        }
        continue;
      }
      // Contains
      if (aliases.some((alias) => normalized.includes(alias))) {
        if (!mapping[field as keyof ColumnMapping]) {
          mapping[field as keyof ColumnMapping] = header;
        }
      }
    }
  }

  return mapping;
}

function normalizeValue(value: string, field: string): string {
  if (!value) return "";
  
  // For numeric values like CNPJ, just keep digits
  if (field === "cnpj") {
    return value.replace(/\D/g, "");
  }
  
  // For phone, normalize but keep some formatting
  if (field === "phone") {
    return value.replace(/[^+\-() \d]/g, "").trim();
  }
  
  return value.trim();
}

export function CompanyImportDialog({
  open,
  onOpenChange,
  onImport,
}: CompanyImportDialogProps) {
  const [step, setStep] = useState<"upload" | "mapping" | "preview">("upload");
  const [isDragging, setIsDragging] = useState(false);
  const [columns, setColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({ name: "" });
  const [companies, setCompanies] = useState<ImportedCompany[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [editingCompany, setEditingCompany] = useState<string | null>(null);

  const resetState = () => {
    setStep("upload");
    setColumns([]);
    setMapping({ name: "" });
    setCompanies([]);
    setIsImporting(false);
    setEditingCompany(null);
  };

  const handleClose = () => {
    resetState();
    onOpenChange(false);
  };

  const parseExcelFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json<Record<string, string>>(worksheet, {
          header: 1,
          raw: false,
        });

        if (jsonData.length < 2) {
          alert("Arquivo vazio ou sem dados válidos");
          return;
        }

        const headers = (jsonData[0] as unknown as string[]).map((h) => String(h || "").trim());
        setColumns(headers.filter(Boolean));

        // Auto-detect mapping using aliases
        const autoMapping = detectColumnMapping(headers);
        setMapping(autoMapping);

        // Parse companies
        const rows = jsonData.slice(1) as unknown as string[][];
        const parsedCompanies: ImportedCompany[] = rows
          .filter((row) => row && row.length > 0)
          .map((row, index) => {
            const rawData: Record<string, string> = {};
            headers.forEach((header, i) => {
              rawData[header] = String(row[i] || "").trim();
            });
            return {
              id: `company-${index}`,
              name: "",
              selected: true,
              rawData,
            };
          });

        setCompanies(parsedCompanies);
        setStep("mapping");
      } catch (error) {
        console.error("Error parsing Excel:", error);
        alert("Erro ao processar arquivo. Verifique o formato.");
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file && (file.name.endsWith(".xlsx") || file.name.endsWith(".xls"))) {
        parseExcelFile(file);
      } else {
        alert("Por favor, envie um arquivo Excel (.xlsx ou .xls)");
      }
    },
    [parseExcelFile]
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      parseExcelFile(file);
    }
  };

  const applyMapping = () => {
    if (!mapping.name) {
      alert("Selecione a coluna obrigatória (Nome da Empresa)");
      return;
    }

    const mappedCompanies = companies.map((company) => ({
      ...company,
      name: company.rawData[mapping.name] || "Sem nome",
      cnpj: mapping.cnpj ? normalizeValue(company.rawData[mapping.cnpj], "cnpj") : undefined,
      email: mapping.email ? company.rawData[mapping.email]?.trim() : undefined,
      phone: mapping.phone ? normalizeValue(company.rawData[mapping.phone], "phone") : undefined,
      city: mapping.city ? company.rawData[mapping.city]?.trim() : undefined,
      state: mapping.state ? company.rawData[mapping.state]?.trim() : undefined,
      address: mapping.address ? company.rawData[mapping.address]?.trim() : undefined,
      website: mapping.website ? company.rawData[mapping.website]?.trim() : undefined,
      notes: mapping.notes ? company.rawData[mapping.notes]?.trim() : undefined,
    }));

    setCompanies(mappedCompanies.filter((c) => c.name && c.name !== "Sem nome"));
    setStep("preview");
  };

  const toggleCompanySelection = (companyId: string) => {
    setCompanies((prev) =>
      prev.map((c) => (c.id === companyId ? { ...c, selected: !c.selected } : c))
    );
  };

  const toggleSelectAll = () => {
    const allSelected = companies.every((c) => c.selected);
    setCompanies((prev) => prev.map((c) => ({ ...c, selected: !allSelected })));
  };

  const deleteCompany = (companyId: string) => {
    setCompanies((prev) => prev.filter((c) => c.id !== companyId));
  };

  const updateCompany = (companyId: string, updates: Partial<ImportedCompany>) => {
    setCompanies((prev) => prev.map((c) => (c.id === companyId ? { ...c, ...updates } : c)));
    setEditingCompany(null);
  };

  const handleImport = async () => {
    const companiesToImport = companies
      .filter((c) => c.selected && c.name)
      .map((c) => ({
        name: c.name,
        cnpj: c.cnpj,
        email: c.email,
        phone: c.phone,
        city: c.city,
        state: c.state,
        address: c.address,
        website: c.website,
        notes: c.notes,
      }));

    if (companiesToImport.length === 0) {
      alert("Nenhuma empresa válida para importar");
      return;
    }

    setIsImporting(true);
    try {
      await onImport(companiesToImport);
      handleClose();
    } catch (error) {
      console.error("Import error:", error);
      alert("Erro ao importar empresas");
    } finally {
      setIsImporting(false);
    }
  };

  const selectedCount = companies.filter((c) => c.selected).length;

  const OPTIONAL_FIELDS: { key: keyof ColumnMapping; label: string }[] = [
    { key: "cnpj", label: "CNPJ" },
    { key: "email", label: "E-mail" },
    { key: "phone", label: "Telefone" },
    { key: "city", label: "Cidade" },
    { key: "state", label: "Estado" },
    { key: "address", label: "Endereço" },
    { key: "website", label: "Website" },
    { key: "notes", label: "Observações" },
  ];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl w-[95vw] h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Importar Empresas do Excel
          </DialogTitle>
          <DialogDescription>
            {step === "upload" && "Arraste um arquivo Excel ou clique para selecionar"}
            {step === "mapping" && "Mapeie as colunas da planilha para os campos"}
            {step === "preview" && "Revise as empresas antes de importar"}
          </DialogDescription>
        </DialogHeader>

        {/* Step Indicator */}
        <div className="flex items-center gap-2 py-2 flex-shrink-0">
          <div className={cn("flex items-center gap-1", step === "upload" ? "text-primary" : "text-muted-foreground")}>
            <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium", step === "upload" ? "bg-primary text-primary-foreground" : "bg-muted")}>1</div>
            <span className="text-sm">Upload</span>
          </div>
          <div className="flex-1 h-px bg-border" />
          <div className={cn("flex items-center gap-1", step === "mapping" ? "text-primary" : "text-muted-foreground")}>
            <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium", step === "mapping" ? "bg-primary text-primary-foreground" : "bg-muted")}>2</div>
            <span className="text-sm">Mapeamento</span>
          </div>
          <div className="flex-1 h-px bg-border" />
          <div className={cn("flex items-center gap-1", step === "preview" ? "text-primary" : "text-muted-foreground")}>
            <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium", step === "preview" ? "bg-primary text-primary-foreground" : "bg-muted")}>3</div>
            <span className="text-sm">Preview</span>
          </div>
        </div>

        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
          {/* Upload Step */}
          {step === "upload" && (
            <div
              className={cn(
                "border-2 border-dashed rounded-lg p-12 text-center transition-colors",
                isDragging ? "border-primary bg-primary/5" : "border-border"
              )}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium mb-2">Arraste seu arquivo Excel aqui</p>
              <p className="text-muted-foreground mb-4">ou</p>
              <Label htmlFor="company-file-upload" className="cursor-pointer">
                <Button variant="outline" asChild>
                  <span>Selecionar Arquivo</span>
                </Button>
                <Input
                  id="company-file-upload"
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </Label>
              <p className="text-xs text-muted-foreground mt-4">
                Formatos suportados: .xlsx, .xls
              </p>
            </div>
          )}

          {/* Mapping Step */}
          {step === "mapping" && (
            <div className="space-y-4 overflow-auto">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {/* Required field */}
                <div className="space-y-2">
                  <Label>Nome da Empresa *</Label>
                  <Select value={mapping.name} onValueChange={(v) => setMapping((m) => ({ ...m, name: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a coluna" />
                    </SelectTrigger>
                    <SelectContent>
                      {columns.map((col) => (
                        <SelectItem key={col} value={col}>{col}</SelectItem>
                      ))}</SelectContent>
                  </Select>
                </div>

                {/* Optional fields */}
                {OPTIONAL_FIELDS.map((field) => (
                  <div key={field.key} className="space-y-2">
                    <Label>{field.label}</Label>
                    <Select
                      value={mapping[field.key] || ""}
                      onValueChange={(v) => setMapping((m) => ({ ...m, [field.key]: v || undefined }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a coluna" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Não mapear</SelectItem>
                        {columns.map((col) => (
                          <SelectItem key={col} value={col}>{col}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>

              <div className="rounded-lg bg-muted/50 p-4">
                <p className="text-sm font-medium mb-2">Colunas detectadas:</p>
                <div className="flex flex-wrap gap-2">
                  {columns.map((col) => (
                    <Badge key={col} variant="secondary">{col}</Badge>
                  ))}
                </div>
              </div>

              <div className="rounded-lg bg-accent/50 p-4">
                <p className="text-sm text-muted-foreground">
                  <strong>Dica:</strong> O sistema detecta automaticamente colunas como "Empresa", "CNPJ", "Telefone", etc. Você pode ajustar manualmente se necessário.
                </p>
              </div>

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setStep("upload")}>Voltar</Button>
                <Button onClick={applyMapping}>Continuar</Button>
              </div>
            </div>
          )}

          {/* Preview Step */}
          {step === "preview" && (
            <div className="flex flex-col gap-4 min-h-0 flex-1">
              {/* Stats */}
              <div className="flex items-center gap-4 flex-wrap">
                <Badge variant="secondary">
                  {selectedCount} selecionadas
                </Badge>
                <Badge variant="outline">
                  {companies.length} total
                </Badge>
              </div>

              {/* Table */}
              <ScrollArea className="flex-1 border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px]">
                        <Checkbox
                          checked={companies.length > 0 && companies.every((c) => c.selected)}
                          onCheckedChange={toggleSelectAll}
                        />
                      </TableHead>
                      <TableHead>Empresa</TableHead>
                      <TableHead>CNPJ</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead>E-mail</TableHead>
                      <TableHead>Cidade/UF</TableHead>
                      <TableHead className="w-[80px]">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {companies.map((company) => (
                      <TableRow key={company.id} className={cn(!company.selected && "opacity-50")}>
                        <TableCell>
                          <Checkbox
                            checked={company.selected}
                            onCheckedChange={() => toggleCompanySelection(company.id)}
                          />
                        </TableCell>
                        <TableCell>
                          {editingCompany === company.id ? (
                            <Input
                              value={company.name}
                              onChange={(e) => updateCompany(company.id, { name: e.target.value })}
                              className="h-8"
                              autoFocus
                              onBlur={() => setEditingCompany(null)}
                              onKeyDown={(e) => e.key === "Enter" && setEditingCompany(null)}
                            />
                          ) : (
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{company.name}</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-sm">{company.cnpj || "-"}</TableCell>
                        <TableCell>{company.phone || "-"}</TableCell>
                        <TableCell>{company.email || "-"}</TableCell>
                        <TableCell>
                          {company.city || company.state
                            ? `${company.city || ""}${company.city && company.state ? "/" : ""}${company.state || ""}`
                            : "-"}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => setEditingCompany(company.id)}
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => deleteCompany(company.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>

              {/* Actions */}
              <div className="flex justify-between pt-2 flex-shrink-0">
                <Button variant="outline" onClick={() => setStep("mapping")}>
                  Voltar
                </Button>
                <Button onClick={handleImport} disabled={isImporting || selectedCount === 0}>
                  {isImporting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Importando...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Importar {selectedCount} Empresas
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

