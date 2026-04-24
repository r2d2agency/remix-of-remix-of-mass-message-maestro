import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileSignature, Plus, Search, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { SignatureList } from "@/components/signatures/SignatureList";
import { SignatureRequestDialog } from "@/components/signatures/SignatureRequestDialog";

export default function Assinaturas() {
  const [searchTerm, setSearchTerm] = useState("");
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);

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
      </div>

      <SignatureRequestDialog 
        open={requestDialogOpen} 
        onOpenChange={setRequestDialogOpen} 
      />
    </MainLayout>
  );
}

