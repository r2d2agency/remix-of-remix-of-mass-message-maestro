import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Plus, Search, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { DocumentList } from "@/components/documents/DocumentList";
import { DocumentUploadDialog } from "@/components/documents/DocumentUploadDialog";

export default function Documentos() {
  const [searchTerm, setSearchTerm] = useState("");
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <FileText className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Documentos</h1>
              <p className="text-sm text-muted-foreground">Gestão de documentos e arquivos jurídicos</p>
            </div>
          </div>
          <Button className="gap-2" onClick={() => setUploadDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            Novo Documento
          </Button>
        </div>

        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, cliente, CPF/CNPJ..."
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
            <CardTitle>Meus Documentos</CardTitle>
          </CardHeader>
          <CardContent>
            <DocumentList />
          </CardContent>
        </Card>
      </div>

      <DocumentUploadDialog 
        open={uploadDialogOpen} 
        onOpenChange={setUploadDialogOpen} 
      />
    </MainLayout>
  );
}

