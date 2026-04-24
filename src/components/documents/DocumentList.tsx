import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  MoreHorizontal, 
  FileText, 
  Download, 
  Trash2, 
  History, 
  Send, 
  MessageSquare,
  Archive
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Document {
  id: string;
  name: string;
  client_name: string;
  case_name?: string;
  type: string;
  status: 'draft' | 'in_analysis' | 'awaiting_signature' | 'signed' | 'refused' | 'expired' | 'archived';
  created_at: string;
  updated_at: string;
  responsible_name: string;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" }> = {
  draft: { label: "Rascunho", variant: "secondary" },
  in_analysis: { label: "Em análise", variant: "outline" },
  awaiting_signature: { label: "Aguardando assinatura", variant: "default" },
  signed: { label: "Assinado", variant: "success" as any },
  refused: { label: "Recusado", variant: "destructive" },
  expired: { label: "Vencido", variant: "destructive" },
  archived: { label: "Arquivado", variant: "outline" },
};

export function DocumentList() {
  // Mock data for initial UI
  const [documents] = useState<Document[]>([
    {
      id: "1",
      name: "Contrato de Honorários - João Silva",
      client_name: "João Silva",
      case_name: "Processo 001/2024",
      type: "Contrato de honorários",
      status: "awaiting_signature",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      responsible_name: "Dr. Roberto",
    },
    {
      id: "2",
      name: "Procuração Ad Judicia",
      client_name: "Maria Oliveira",
      type: "Procuração",
      status: "signed",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      responsible_name: "Dr. Roberto",
    }
  ]);

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Documento</TableHead>
            <TableHead>Cliente / Caso</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Data</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {documents.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="h-24 text-center">
                Nenhum documento encontrado.
              </TableCell>
            </TableRow>
          ) : (
            documents.map((doc) => (
              <TableRow key={doc.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    <span>{doc.name}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="text-sm">{doc.client_name}</span>
                    {doc.case_name && (
                      <span className="text-xs text-muted-foreground">{doc.case_name}</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-normal">
                    {doc.type}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge 
                    variant={statusConfig[doc.status]?.variant as any}
                    className={doc.status === 'signed' ? "bg-green-100 text-green-700 hover:bg-green-100" : ""}
                  >
                    {statusConfig[doc.status]?.label}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {format(new Date(doc.created_at), "dd/MM/yyyy", { locale: ptBR })}
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel>Ações</DropdownMenuLabel>
                      <DropdownMenuItem>
                        <Send className="mr-2 h-4 w-4" />
                        Enviar para assinatura
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <MessageSquare className="mr-2 h-4 w-4" />
                        Enviar pelo WhatsApp
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem>
                        <Download className="mr-2 h-4 w-4" />
                        Baixar
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <History className="mr-2 h-4 w-4" />
                        Histórico
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Archive className="mr-2 h-4 w-4" />
                        Arquivar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive">
                        <Trash2 className="mr-2 h-4 w-4" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
