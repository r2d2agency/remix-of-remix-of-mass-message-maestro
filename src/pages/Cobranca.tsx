import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Receipt, Building2 } from "lucide-react";
import AsaasConfig from "@/components/asaas/AsaasConfig";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface Organization {
  id: string;
  name: string;
  slug: string;
}

interface Connection {
  id: string;
  name: string;
  status: string;
}

const Cobranca = () => {
  const [loading, setLoading] = useState(true);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [orgsData, connsData] = await Promise.all([
        api<Organization[]>('/api/organizations'),
        api<Connection[]>('/api/connections'),
      ]);
      setOrganizations(orgsData);
      setConnections(connsData);
      
      // Auto-select first org if available
      if (orgsData.length > 0 && !selectedOrg) {
        setSelectedOrg(orgsData[0].id);
      }
    } catch (err) {
      console.error('Error loading data:', err);
      toast.error("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  if (organizations.length === 0) {
    return (
      <MainLayout>
        <div className="space-y-8">
          <div className="animate-slide-up">
            <h1 className="text-3xl font-bold text-foreground">Cobrança Automática</h1>
            <p className="mt-1 text-muted-foreground">
              Integração com Asaas para notificações de cobrança via WhatsApp
            </p>
          </div>

          <Card className="animate-fade-in">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Building2 className="h-16 w-16 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Nenhuma organização encontrada
              </h3>
              <p className="text-muted-foreground text-center max-w-md mb-6">
                Para usar o módulo de cobrança automática, você precisa criar uma organização primeiro.
                Organizações permitem gerenciar múltiplas conexões e integrações.
              </p>
              <Button variant="gradient" onClick={() => toast.info("Funcionalidade em desenvolvimento")}>
                Criar Organização
              </Button>
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between animate-slide-up">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Cobrança Automática</h1>
            <p className="mt-1 text-muted-foreground">
              Integração com Asaas para notificações de cobrança via WhatsApp
            </p>
          </div>
          
          {organizations.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Organização:</span>
              <div className="flex gap-2">
                {organizations.map((org) => (
                  <Button
                    key={org.id}
                    variant={selectedOrg === org.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedOrg(org.id)}
                  >
                    {org.name}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>

        {selectedOrg && (
          <AsaasConfig 
            organizationId={selectedOrg} 
            connections={connections.map(c => ({ id: c.id, name: c.name }))}
          />
        )}
      </div>
    </MainLayout>
  );
};

export default Cobranca;
