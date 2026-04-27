import { useDocuments, removeDocument, openDocument, downloadDocument, updateDocument } from "@/hooks/use-documents-store";
import { toast } from "@/hooks/use-toast";
import { Eye } from "lucide-react";
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
  const documents = useDocuments();

  const handleDelete = (id: string, name: string) => {
    removeDocument(id);
    toast({ title: "Documento excluído", description: name });
  };

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
                      <DropdownMenuItem
                        onClick={() => {
                          if (!doc.file_data_url) {
                            toast({ title: "Arquivo indisponível", variant: "destructive" });
                            return;
                          }
                          openDocument(doc as any);
                        }}
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        Abrir
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          updateDocument(doc.id, { status: 'awaiting_signature' });
                          toast({ title: "Solicitação criada", description: "Status alterado para 'Aguardando assinatura'." });
                        }}
                      >
                        <Send className="mr-2 h-4 w-4" />
                        Enviar para assinatura
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <MessageSquare className="mr-2 h-4 w-4" />
                        Enviar pelo WhatsApp
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => {
                          if (!doc.file_data_url) {
                            toast({ title: "Arquivo indisponível", variant: "destructive" });
                            return;
                          }
                          downloadDocument(doc as any);
                        }}
                      >
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
                      <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(doc.id, doc.name)}>
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
