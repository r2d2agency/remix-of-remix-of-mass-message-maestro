import { useState, useRef, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { FileSpreadsheet, Upload, Check, AlertCircle, Plus, X } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { useProspects } from "@/hooks/use-prospects";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ParsedRow {
  [key: string]: string;
}

interface FieldMapping {
  column: string;
  targetField: string;
  isNew: boolean;
  newFieldLabel?: string;
}

const RESERVED_FIELDS = [
  { key: "name", label: "Nome", required: true, patterns: ["nome", "name", "cliente", "razao", "razão"] },
  { key: "phone", label: "Telefone", required: true, patterns: ["telefone", "phone", "celular", "whatsapp", "fone", "mobile", "tel"] },
  { key: "email", label: "E-mail", required: false, patterns: ["email", "e-mail", "mail", "correio"] },
  { key: "source", label: "Origem", required: false, patterns: ["origem", "source", "fonte", "canal", "campanha"] },
  { key: "city", label: "Cidade", required: false, patterns: ["cidade", "city", "municipio", "município"] },
  { key: "state", label: "Estado", required: false, patterns: ["estado", "state", "uf"] },
  { key: "address", label: "Endereço", required: false, patterns: ["endereco", "endereço", "address", "logradouro", "rua", "avenida"] },
  { key: "zip_code", label: "CEP", required: false, patterns: ["cep", "zip", "postal", "codigo postal"] },
  { key: "is_company", label: "É Empresa", required: false, patterns: ["empresa", "company", "pj", "cnpj", "corporativo"] },
];

export default function ProspectImportDialog({ open, onOpenChange }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"upload" | "mapping" | "preview">("upload");
  const [fileName, setFileName] = useState("");
  const [columns, setColumns] = useState<string[]>([]);
  const [data, setData] = useState<ParsedRow[]>([]);
  const [mappings, setMappings] = useState<FieldMapping[]>([]);

  const { bulkCreate, customFields } = useProspects();

  const resetState = () => {
    setStep("upload");
    setFileName("");
    setColumns([]);
    setData([]);
    setMappings([]);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json<ParsedRow>(worksheet, { header: 1 });

      if (jsonData.length < 2) {
        toast.error("Arquivo vazio ou sem dados");
        return;
      }

      // First row is header
      const headers = (jsonData[0] as unknown as string[]).filter(h => h);
      const rows = jsonData.slice(1).map((row: any) => {
        const obj: ParsedRow = {};
        headers.forEach((h, i) => {
          obj[h] = row[i]?.toString() || "";
        });
        return obj;
      }).filter(row => Object.values(row).some(v => v));

      setColumns(headers);
      setData(rows);

      // Auto-detect mappings using improved pattern matching
      const initialMappings: FieldMapping[] = [];
      const usedFields = new Set<string>();
      
      headers.forEach(col => {
        const colLower = col.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        
        // Try to match reserved fields using patterns
        let matched = false;
        for (const field of RESERVED_FIELDS) {
          if (usedFields.has(field.key)) continue;
          
          const matchesPattern = field.patterns.some(pattern => 
            colLower.includes(pattern) || pattern.includes(colLower)
          );
          
          if (matchesPattern) {
            initialMappings.push({ column: col, targetField: field.key, isNew: false });
            usedFields.add(field.key);
            matched = true;
            break;
          }
        }
        
        if (!matched) {
          // Check if matches existing custom field
          const existingField = customFields.find(f => 
            f.field_key === colLower.replace(/\s+/g, '_') || 
            f.field_label.toLowerCase() === colLower
          );
          if (existingField) {
            initialMappings.push({ column: col, targetField: existingField.field_key, isNew: false });
          }
        }
      });

      setMappings(initialMappings);
      setStep("mapping");
    } catch (err) {
      console.error("Error parsing file:", err);
      toast.error("Erro ao ler arquivo");
    }
  };

  const normalizePhone = (phone: string): string => {
    if (!phone) return "";
    let digits = phone.replace(/\D/g, "");
    digits = digits.replace(/^0+/, "");
    if (digits.length <= 11) {
      digits = "55" + digits;
    }
    return digits;
  };

  const updateMapping = (column: string, targetField: string, isNew: boolean = false, newLabel?: string) => {
    setMappings(prev => {
      const existing = prev.find(m => m.column === column);
      if (existing) {
        if (targetField === "ignore") {
          return prev.filter(m => m.column !== column);
        }
        return prev.map(m => 
          m.column === column 
            ? { ...m, targetField, isNew, newFieldLabel: newLabel } 
            : m
        );
      } else if (targetField !== "ignore") {
        return [...prev, { column, targetField, isNew, newFieldLabel: newLabel }];
      }
      return prev;
    });
  };

  const addAsNewField = (column: string) => {
    const fieldKey = column.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    updateMapping(column, fieldKey, true, column);
  };

  const getMappedData = () => {
    const nameMapping = mappings.find(m => m.targetField === "name");
    const phoneMapping = mappings.find(m => m.targetField === "phone");
    
    if (!nameMapping || !phoneMapping) return [];

    return data
      .map((row) => {
        const result: Record<string, string> = {};
        
        mappings.forEach(mapping => {
          const value = row[mapping.column]?.trim() || "";
          if (mapping.targetField === "phone") {
            result.phone = normalizePhone(value);
          } else {
            result[mapping.targetField] = value;
          }
        });

        return result;
      })
      .filter((p) => p.name && p.phone && p.phone.length >= 10);
  };

  const newFieldsToCreate = useMemo(() => {
    return mappings
      .filter(m => m.isNew)
      .map(m => ({
        field_key: m.targetField,
        field_label: m.newFieldLabel || m.column,
        field_type: 'text'
      }));
  }, [mappings]);

  const handleImport = async () => {
    const prospects = getMappedData();
    if (prospects.length === 0) {
      toast.error("Nenhum prospect válido para importar");
      return;
    }

    await bulkCreate.mutateAsync({
      prospects,
      createFields: newFieldsToCreate.length > 0 ? newFieldsToCreate : undefined,
    });
    onOpenChange(false);
    resetState();
  };

  const getAvailableTargets = (currentColumn: string) => {
    const usedTargets = mappings
      .filter(m => m.column !== currentColumn)
      .map(m => m.targetField);
    
    return RESERVED_FIELDS.filter(f => !usedTargets.includes(f.key));
  };

  const getCurrentMapping = (column: string) => {
    return mappings.find(m => m.column === column);
  };

  const hasRequiredFields = mappings.some(m => m.targetField === "name") && 
                           mappings.some(m => m.targetField === "phone");

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) resetState(); }}>
      <DialogContent className="max-w-3xl h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>Importar Prospects</DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium mb-2">Arraste ou clique para selecionar</p>
              <p className="text-sm text-muted-foreground">Arquivos Excel (.xlsx, .xls) ou CSV</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleFileChange}
            />
            <div className="text-sm text-muted-foreground">
              <p><strong>Mapeamento automático:</strong></p>
              <ul className="list-disc list-inside mt-1 space-y-1">
                <li>Colunas são detectadas automaticamente</li>
                <li>Campos não reconhecidos podem ser adicionados como novos</li>
                <li>Nome e Telefone são obrigatórios</li>
              </ul>
            </div>
          </div>
        )}

        {step === "mapping" && (
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="p-3 bg-muted rounded-lg flex items-center gap-2 shrink-0 mb-4">
              <Check className="h-4 w-4 text-green-600" />
              <span className="text-sm">
                <strong>{fileName}</strong> - {data.length} linhas encontradas
              </span>
            </div>

            {/* Mapping Table with proper scroll */}
            <div className="flex-1 min-h-0 border rounded-lg overflow-hidden mb-4">
              <ScrollArea className="h-full">
                <div className="p-4 space-y-3">
                  <div className="grid grid-cols-[1fr,auto,1fr,auto] gap-2 items-center text-sm font-medium text-muted-foreground pb-2 border-b sticky top-0 bg-background z-10">
                    <span>Coluna do Arquivo</span>
                    <span></span>
                    <span>Campo no Sistema</span>
                    <span></span>
                  </div>
                  
                  {columns.map((col) => {
                    const mapping = getCurrentMapping(col);
                    const availableTargets = getAvailableTargets(col);
                    
                    return (
                      <div key={col} className="grid grid-cols-[1fr,auto,1fr,auto] gap-2 items-center py-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <Badge variant="secondary" className="font-mono text-xs shrink-0">
                            {col}
                          </Badge>
                          <span className="text-xs text-muted-foreground truncate">
                            {data[0]?.[col]?.substring(0, 20)}...
                          </span>
                        </div>
                        
                        <span className="text-muted-foreground shrink-0">→</span>
                        
                        <Select
                          value={mapping?.targetField || "ignore"}
                          onValueChange={(v) => updateMapping(col, v, false)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Selecione..." />
                          </SelectTrigger>
                          <SelectContent 
                            position="popper" 
                            side="bottom" 
                            align="start"
                            className="z-[100]"
                            sideOffset={4}
                          >
                            <SelectItem value="ignore">
                              <span className="text-muted-foreground">Ignorar</span>
                            </SelectItem>
                            {availableTargets.map((f) => (
                              <SelectItem key={f.key} value={f.key}>
                                {f.label} {f.required && <span className="text-destructive">*</span>}
                              </SelectItem>
                            ))}
                            {customFields
                              .filter(f => !mappings.some(m => m.targetField === f.field_key && m.column !== col))
                              .map((f) => (
                                <SelectItem key={f.field_key} value={f.field_key}>
                                  {f.field_label}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        
                        <div className="flex items-center gap-1 shrink-0">
                          {!mapping && (
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => addAsNewField(col)}
                              title="Criar novo campo"
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          )}
                          
                          {mapping?.isNew && (
                            <Badge variant="default" className="bg-green-600 text-xs">
                              Novo
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>

            {/* New Fields Preview */}
            {newFieldsToCreate.length > 0 && (
              <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800 shrink-0 mb-4">
                <p className="text-sm font-medium text-green-700 dark:text-green-400 mb-2">
                  Novos campos a serem criados:
                </p>
                <div className="flex flex-wrap gap-2">
                  {newFieldsToCreate.map((f) => (
                    <Badge key={f.field_key} variant="outline" className="bg-white dark:bg-background">
                      {f.field_label}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Preview */}
            <div className="shrink-0 space-y-2">
              <Label>Prévia (3 primeiros)</Label>
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto max-h-32">
                    <table className="w-full text-sm">
                      <thead className="bg-muted">
                        <tr>
                          {mappings.map((m) => (
                            <th key={m.column} className="p-2 text-left whitespace-nowrap">
                              {RESERVED_FIELDS.find(f => f.key === m.targetField)?.label || 
                               customFields.find(f => f.field_key === m.targetField)?.field_label ||
                               m.newFieldLabel ||
                               m.targetField}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {getMappedData().slice(0, 3).map((p, i) => (
                          <tr key={i} className="border-t">
                            {mappings.map((m) => (
                              <td key={m.column} className="p-2 truncate max-w-[150px]">
                                {p[m.targetField] || <span className="text-muted-foreground">-</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
              <p className="text-xs text-muted-foreground">
                {getMappedData().length} prospects válidos de {data.length} linhas
              </p>
            </div>

            {!hasRequiredFields && (
              <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg shrink-0">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">Mapeie os campos obrigatórios: Nome e Telefone</span>
              </div>
            )}

            <div className="flex justify-between shrink-0 pt-4 border-t mt-auto">
              <Button variant="outline" onClick={resetState}>
                Voltar
              </Button>
              <Button
                onClick={handleImport}
                disabled={!hasRequiredFields || getMappedData().length === 0 || bulkCreate.isPending}
              >
                {bulkCreate.isPending ? (
                  "Importando..."
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Importar {getMappedData().length} prospects
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
