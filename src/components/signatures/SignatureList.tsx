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
  FileSignature, 
  Eye, 
  Trash2, 
  History, 
  Send, 
  CheckCircle,
  XCircle,
  ExternalLink
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface SignatureRequest {
  id: string;
  document_name: string;
  signer_name: string;
  status: 'sent' | 'viewed' | 'signed' | 'refused' | 'expired' | 'cancelled';
  sent_at: string;
  deadline?: string;
  channel: 'whatsapp' | 'email' | 'both';
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" }> = {
  sent: { label: "Enviada", variant: "secondary" },
  viewed: { label: "Visualizada", variant: "outline" },
  signed: { label: "Assinada", variant: "success" as any },
  refused: { label: "Recusada", variant: "destructive" },
  expired: { label: "Expirada", variant: "warning" as any },
  cancelled: { label: "Cancelada", variant: "destructive" },
};

export function SignatureList() {
  const [requests] = useState<SignatureRequest[]>([
    {
      id: "1",
      document_name: "Contrato de Honorários - João Silva",
      signer_name: "João Silva",
      status: "sent",
      sent_at: new Date().toISOString(),
      channel: "whatsapp",
    },
    {
      id: "2",
      document_name: "Procuração Ad Judicia",
      signer_name: "Maria Oliveira",
      status: "signed",
      sent_at: new Date(Date.now() - 86400000).toISOString(),
      channel: "both",
    }
  ]);

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Documento</TableHead>
            <TableHead>Assinante</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Canal</TableHead>
            <TableHead>Enviado em</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {requests.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="h-24 text-center">
                Nenhuma solicitação encontrada.
              </TableCell>
            </TableRow>
          ) : (
            requests.map((req) => (
              <TableRow key={req.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <FileSignature className="h-4 w-4 text-primary" />
                    <span>{req.document_name}</span>
                  </div>
                </TableCell>
                <TableCell>{req.signer_name}</TableCell>
                <TableCell>
                  <Badge 
                    variant={statusConfig[req.status]?.variant as any}
                    className={req.status === 'signed' ? "bg-green-100 text-green-700 hover:bg-green-100" : ""}
                  >
                    {statusConfig[req.status]?.label}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="capitalize">
                    {req.channel === 'both' ? 'Wpp + E-mail' : req.channel}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {format(new Date(req.sent_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel>Gerenciar</DropdownMenuLabel>
                      <DropdownMenuItem>
                        <Eye className="mr-2 h-4 w-4" />
                        Ver detalhes
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Copiar link público
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem>
                        <Send className="mr-2 h-4 w-4" />
                        Reenviar link
                      </DropdownMenuItem>
                      {req.status !== 'signed' && (
                        <DropdownMenuItem className="text-destructive">
                          <XCircle className="mr-2 h-4 w-4" />
                          Cancelar solicitação
                        </DropdownMenuItem>
                      )}
                      {req.status === 'signed' && (
                        <DropdownMenuItem>
                          <CheckCircle className="mr-2 h-4 w-4 text-green-600" />
                          Ver Certificado
                        </DropdownMenuItem>
                      )}
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
