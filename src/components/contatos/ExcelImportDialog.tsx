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
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import {
  FileSpreadsheet,
  Upload,
  Check,
  X,
  AlertCircle,
  Loader2,
  Trash2,
  Edit,
  CheckCircle2,
  Phone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";

interface ImportedContact {
  id: string;
  name: string;
  phone: string;
  isValidWhatsApp: boolean | null;
  isValidating: boolean;
  selected: boolean;
  rawData: Record<string, string>;
}

interface ColumnMapping {
  name: string;
  phone: string;
  [key: string]: string;
}

interface ExcelImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (contacts: { name: string; phone: string; customFields?: Record<string, string> }[]) => Promise<void>;
  validateWhatsApp?: (phone: string) => Promise<boolean>;
  customFields?: string[];
}

export function ExcelImportDialog({
  open,
  onOpenChange,
  onImport,
  validateWhatsApp,
  customFields = [],
}: ExcelImportDialogProps) {
  const [step, setStep] = useState<"upload" | "mapping" | "preview">("upload");
  const [isDragging, setIsDragging] = useState(false);
  const [columns, setColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({ name: "", phone: "" });
  const [contacts, setContacts] = useState<ImportedContact[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [isValidatingAll, setIsValidatingAll] = useState(false);
  const [validationProgress, setValidationProgress] = useState(0);
  const [editingContact, setEditingContact] = useState<string | null>(null);

  const resetState = () => {
    setStep("upload");
    setColumns([]);
    setMapping({ name: "", phone: "" });
    setContacts([]);
    setIsImporting(false);
    setIsValidatingAll(false);
    setValidationProgress(0);
    setEditingContact(null);
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

        const headers = (jsonData[0] as unknown as string[]).map(h => String(h || "").trim());
        setColumns(headers.filter(Boolean));

        // Auto-detect mapping
        const autoMapping: ColumnMapping = { name: "", phone: "" };
        headers.forEach((header) => {
          const lowerHeader = header.toLowerCase();
          if (lowerHeader.includes("nome") || lowerHeader === "name") {
            autoMapping.name = header;
          }
          if (
            lowerHeader.includes("telefone") ||
            lowerHeader.includes("whatsapp") ||
            lowerHeader.includes("phone") ||
            lowerHeader.includes("numero") ||
            lowerHeader.includes("celular")
          ) {
            autoMapping.phone = header;
          }
        });
        setMapping(autoMapping);

        // Parse contacts
        const rows = jsonData.slice(1) as unknown as string[][];
        const parsedContacts: ImportedContact[] = rows
          .filter(row => row && row.length > 0)
          .map((row, index) => {
            const rawData: Record<string, string> = {};
            headers.forEach((header, i) => {
              rawData[header] = String(row[i] || "").trim();
            });
            return {
              id: `contact-${index}`,
              name: "",
              phone: "",
              isValidWhatsApp: null,
              isValidating: false,
              selected: true,
              rawData,
            };
          });

        setContacts(parsedContacts);
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
    if (!mapping.name || !mapping.phone) {
      alert("Selecione as colunas obrigatórias (Nome e Telefone)");
      return;
    }

    const mappedContacts = contacts.map((contact) => ({
      ...contact,
      name: contact.rawData[mapping.name] || "Sem nome",
      phone: normalizePhone(contact.rawData[mapping.phone] || ""),
    }));

    setContacts(mappedContacts.filter(c => c.phone));
    setStep("preview");
  };

  const normalizePhone = (phone: string): string => {
    // Remove all non-numeric characters
    let normalized = phone.replace(/\D/g, "");
    
    // Add Brazil country code if not present
    if (normalized.length === 10 || normalized.length === 11) {
      normalized = "55" + normalized;
    }
    
    return normalized;
  };

  const validateSingleContact = async (contactId: string) => {
    if (!validateWhatsApp) return;

    setContacts((prev) =>
      prev.map((c) =>
        c.id === contactId ? { ...c, isValidating: true } : c
      )
    );

    const contact = contacts.find((c) => c.id === contactId);
    if (!contact) return;

    try {
      const isValid = await validateWhatsApp(contact.phone);
      setContacts((prev) =>
        prev.map((c) =>
          c.id === contactId
            ? { ...c, isValidWhatsApp: isValid, isValidating: false }
            : c
        )
      );
    } catch {
      setContacts((prev) =>
        prev.map((c) =>
          c.id === contactId
            ? { ...c, isValidWhatsApp: false, isValidating: false }
            : c
        )
      );
    }
  };

  const validateAllContacts = async () => {
    if (!validateWhatsApp) return;

    setIsValidatingAll(true);
    setValidationProgress(0);

    const selectedContacts = contacts.filter((c) => c.selected);
    let validated = 0;

    for (const contact of selectedContacts) {
      setContacts((prev) =>
        prev.map((c) =>
          c.id === contact.id ? { ...c, isValidating: true } : c
        )
      );

      try {
        const isValid = await validateWhatsApp(contact.phone);
        setContacts((prev) =>
          prev.map((c) =>
            c.id === contact.id
              ? { ...c, isValidWhatsApp: isValid, isValidating: false }
              : c
          )
        );
      } catch {
        setContacts((prev) =>
          prev.map((c) =>
            c.id === contact.id
              ? { ...c, isValidWhatsApp: false, isValidating: false }
              : c
          )
        );
      }

      validated++;
      setValidationProgress((validated / selectedContacts.length) * 100);

      // Small delay to avoid overwhelming the API
      await new Promise((r) => setTimeout(r, 500));
    }

    setIsValidatingAll(false);
  };

  const toggleContactSelection = (contactId: string) => {
    setContacts((prev) =>
      prev.map((c) =>
        c.id === contactId ? { ...c, selected: !c.selected } : c
      )
    );
  };

  const toggleSelectAll = () => {
    const allSelected = contacts.every((c) => c.selected);
    setContacts((prev) => prev.map((c) => ({ ...c, selected: !allSelected })));
  };

  const deleteContact = (contactId: string) => {
    setContacts((prev) => prev.filter((c) => c.id !== contactId));
  };

  const updateContact = (contactId: string, updates: Partial<ImportedContact>) => {
    setContacts((prev) =>
      prev.map((c) => (c.id === contactId ? { ...c, ...updates } : c))
    );
    setEditingContact(null);
  };

  const handleImport = async () => {
    const validContacts = contacts
      .filter((c) => c.selected && (c.isValidWhatsApp === null || c.isValidWhatsApp === true))
      .map((c) => ({
        name: c.name,
        phone: c.phone,
        customFields: c.rawData,
      }));

    if (validContacts.length === 0) {
      alert("Nenhum contato válido para importar");
      return;
    }

    setIsImporting(true);
    try {
      await onImport(validContacts);
      handleClose();
    } catch (error) {
      console.error("Import error:", error);
      alert("Erro ao importar contatos");
    } finally {
      setIsImporting(false);
    }
  };

  const selectedCount = contacts.filter((c) => c.selected).length;
  const validCount = contacts.filter((c) => c.selected && c.isValidWhatsApp === true).length;
  const invalidCount = contacts.filter((c) => c.selected && c.isValidWhatsApp === false).length;
  const pendingCount = contacts.filter((c) => c.selected && c.isValidWhatsApp === null).length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Importar Contatos do Excel
          </DialogTitle>
          <DialogDescription>
            {step === "upload" && "Arraste um arquivo Excel ou clique para selecionar"}
            {step === "mapping" && "Mapeie as colunas da planilha para os campos"}
            {step === "preview" && "Revise e valide os contatos antes de importar"}
          </DialogDescription>
        </DialogHeader>

        {/* Step Indicator */}
        <div className="flex items-center gap-2 py-2">
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

        <div className="flex-1 overflow-hidden">
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
              <Label htmlFor="file-upload" className="cursor-pointer">
                <Button variant="outline" asChild>
                  <span>Selecionar Arquivo</span>
                </Button>
                <Input
                  id="file-upload"
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
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Coluna Nome *</Label>
                  <Select value={mapping.name} onValueChange={(v) => setMapping((m) => ({ ...m, name: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a coluna" />
                    </SelectTrigger>
                    <SelectContent>
                      {columns.map((col) => (
                        <SelectItem key={col} value={col}>{col}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Coluna Telefone/WhatsApp *</Label>
                  <Select value={mapping.phone} onValueChange={(v) => setMapping((m) => ({ ...m, phone: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a coluna" />
                    </SelectTrigger>
                    <SelectContent>
                      {columns.map((col) => (
                        <SelectItem key={col} value={col}>{col}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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
                  <strong>Dica:</strong> As outras colunas serão salvas como campos personalizados e podem ser usadas como variáveis nas mensagens (ex: {"{{cidade}}"}, {"{{empresa}}"}).
                </p>
              </div>

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setStep("upload")}>Voltar</Button>
                <Button variant="gradient" onClick={applyMapping}>Continuar</Button>
              </div>
            </div>
          )}

          {/* Preview Step */}
          {step === "preview" && (
            <div className="space-y-4 h-full flex flex-col">
              {/* Stats */}
              <div className="flex items-center gap-4 flex-wrap">
                <Badge variant="secondary">
                  {selectedCount} selecionados
                </Badge>
                {validCount > 0 && (
                  <Badge className="bg-green-500/10 text-green-500 border-0">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    {validCount} válidos
                  </Badge>
                )}
                {invalidCount > 0 && (
                  <Badge className="bg-destructive/10 text-destructive border-0">
                    <X className="h-3 w-3 mr-1" />
                    {invalidCount} inválidos
                  </Badge>
                )}
                {pendingCount > 0 && (
                  <Badge variant="outline">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    {pendingCount} pendentes
                  </Badge>
                )}
                <div className="flex-1" />
                {validateWhatsApp && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={validateAllContacts}
                    disabled={isValidatingAll}
                  >
                    {isValidatingAll ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Validando...
                      </>
                    ) : (
                      <>
                        <Phone className="h-4 w-4 mr-2" />
                        Validar WhatsApp
                      </>
                    )}
                  </Button>
                )}
              </div>

              {isValidatingAll && (
                <Progress value={validationProgress} className="h-2" />
              )}

              {/* Table */}
              <ScrollArea className="flex-1 border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={contacts.every((c) => c.selected)}
                          onCheckedChange={toggleSelectAll}
                        />
                      </TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead className="w-24">WhatsApp</TableHead>
                      <TableHead className="w-24 text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contacts.map((contact) => (
                      <TableRow key={contact.id} className={cn(!contact.selected && "opacity-50")}>
                        <TableCell>
                          <Checkbox
                            checked={contact.selected}
                            onCheckedChange={() => toggleContactSelection(contact.id)}
                          />
                        </TableCell>
                        <TableCell>
                          {editingContact === contact.id ? (
                            <Input
                              defaultValue={contact.name}
                              onBlur={(e) => updateContact(contact.id, { name: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  updateContact(contact.id, { name: e.currentTarget.value });
                                }
                              }}
                              autoFocus
                            />
                          ) : (
                            <span className="font-medium">{contact.name}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {editingContact === contact.id ? (
                            <Input
                              defaultValue={contact.phone}
                              onBlur={(e) => updateContact(contact.id, { phone: normalizePhone(e.target.value) })}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  updateContact(contact.id, { phone: normalizePhone(e.currentTarget.value) });
                                }
                              }}
                            />
                          ) : (
                            <span className="font-mono text-sm">{contact.phone}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {contact.isValidating ? (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          ) : contact.isValidWhatsApp === true ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : contact.isValidWhatsApp === false ? (
                            <X className="h-4 w-4 text-destructive" />
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {validateWhatsApp && contact.isValidWhatsApp === null && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => validateSingleContact(contact.id)}
                                disabled={contact.isValidating}
                              >
                                <Phone className="h-3 w-3" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => setEditingContact(contact.id)}
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => deleteContact(contact.id)}
                            >
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setStep("mapping")}>Voltar</Button>
                <Button
                  variant="gradient"
                  onClick={handleImport}
                  disabled={isImporting || selectedCount === 0}
                >
                  {isImporting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Importando...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Importar {selectedCount} Contatos
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
