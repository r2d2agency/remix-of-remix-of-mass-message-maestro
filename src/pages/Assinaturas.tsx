import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileSignature, Plus, Search, Filter, CheckCircle2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useState, useMemo } from "react";
import { SignatureList } from "@/components/signatures/SignatureList";
import { SignatureRequestDialog } from "@/components/signatures/SignatureRequestDialog";
import { useDocuments } from "@/hooks/use-documents-store";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function Assinaturas() {
  const [searchTerm, setSearchTerm] = useState("");
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const documents = useDocuments();
  const signedDocs = useMemo(
    () => documents
      .filter((d) => d.status === "signed")
      .filter((d) => {
        if (!searchTerm.trim()) return true;
        const q = searchTerm.toLowerCase();
        return (
          d.name.toLowerCase().includes(q) ||
          d.client_name.toLowerCase().includes(q) ||
          (d.signer_name?.toLowerCase().includes(q) ?? false)
        );
      })
      .sort((a, b) => new Date(b.signed_at || b.updated_at).getTime() - new Date(a.signed_at || a.updated_at).getTime()),
    [documents, searchTerm]
  );
  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <FileSignature className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Assinaturas</h1>
              <p className="text-sm text-muted-foreground">Gestão de assinaturas eletrônicas</p>
            </div>
          </div>
          <Button className="gap-2" onClick={() => setRequestDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            Solicitar Assinatura
          </Button>
        </div>

        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por documento, cliente, status..."
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Button variant="outline" className="gap-2">
            <Filter className="h-4 w-4" />
            Filtros
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Solicitações de Assinatura</CardTitle>
          </CardHeader>
          <CardContent>
            <SignatureList />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                Documentos Assinados
              </CardTitle>
              <Badge variant="outline">{signedDocs.length}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Documento</TableHead>
                    <TableHead>Cliente / Assinante</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Data da Assinatura</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {signedDocs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                        Nenhum documento assinado ainda.
                      </TableCell>
                    </TableRow>
                  ) : (
                    signedDocs.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <FileSignature className="h-4 w-4 text-green-600" />
                            <span>{doc.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>{doc.signer_name || doc.client_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-normal">{doc.type}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(doc.signed_at || doc.updated_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" className="gap-2">
                            <Download className="h-4 w-4" />
                            Baixar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <SignatureRequestDialog 
        open={requestDialogOpen} 
        onOpenChange={setRequestDialogOpen} 
      />
    </MainLayout>
  );
}

