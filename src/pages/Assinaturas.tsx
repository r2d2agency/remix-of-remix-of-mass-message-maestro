import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileSignature, Plus, Search, FileText, Clock, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const Assinaturas = () => {
  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
              <FileSignature className="h-8 w-8 text-primary" />
              Assinaturas Digitais
            </h1>
            <p className="mt-1 text-muted-foreground">
              Gerencie e solicite assinaturas eletrônicas para seus documentos
            </p>
          </div>
          <Button className="gap-2">
            <Plus className="h-4 w-4" /> Nova Solicitação
          </Button>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Aguardando</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-500">0</div>
              <p className="text-xs text-muted-foreground">Documentos pendentes</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Concluídas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-500">0</div>
              <p className="text-xs text-muted-foreground">Documentos assinados</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">0</div>
              <p className="text-xs text-muted-foreground">Total de solicitações</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Solicitações Recentes</CardTitle>
            <CardDescription>Acompanhe o status das suas solicitações de assinatura</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed rounded-lg">
              <FileText className="h-12 w-12 text-muted-foreground mb-4 opacity-20" />
              <p className="text-lg font-medium text-foreground">Nenhuma solicitação encontrada</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                As solicitações enviadas através do chat ou criadas manualmente aparecerão aqui para acompanhamento.
              </p>
              <Button variant="outline" className="mt-4">
                Saiba como funciona
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
};

export default Assinaturas;
