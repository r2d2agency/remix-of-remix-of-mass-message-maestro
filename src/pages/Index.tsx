import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { ConnectionStatus } from "@/components/dashboard/ConnectionStatus";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, MessageSquare, Send, CheckCircle2, Loader2, Play, Clock, Calendar as CalendarIcon, Pause } from "lucide-react";
import { api } from "@/lib/api";
import { useContacts } from "@/hooks/use-contacts";
import { useMessages } from "@/hooks/use-messages";
import { useCampaigns, Campaign } from "@/hooks/use-campaigns";
import { cn } from "@/lib/utils";

interface Connection {
  id: string;
  name: string;
  instance_name: string;
  status: string;
  phone_number: string | null;
}

interface DashboardStats {
  totalContacts: number;
  totalMessages: number;
  activeCampaigns: number;
  sentMessages: number;
}

const statusConfig = {
  pending: { icon: CalendarIcon, label: "Agendada", color: "text-muted-foreground", bgColor: "bg-muted" },
  running: { icon: Play, label: "Em Execução", color: "text-warning", bgColor: "bg-warning/10" },
  completed: { icon: CheckCircle2, label: "Concluída", color: "text-success", bgColor: "bg-success/10" },
  paused: { icon: Pause, label: "Pausada", color: "text-destructive", bgColor: "bg-destructive/10" },
  cancelled: { icon: Clock, label: "Cancelada", color: "text-muted-foreground", bgColor: "bg-muted" },
};

const Index = () => {
  const { getLists } = useContacts();
  const { getMessages } = useMessages();
  const { getCampaigns } = useCampaigns();

  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [stats, setStats] = useState<DashboardStats>({
    totalContacts: 0,
    totalMessages: 0,
    activeCampaigns: 0,
    sentMessages: 0,
  });
  const [recentCampaigns, setRecentCampaigns] = useState<Campaign[]>([]);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const [listsData, messagesData, campaignsData, connectionsData] = await Promise.all([
        getLists(),
        getMessages(),
        getCampaigns(),
        api<Connection[]>('/api/connections'),
      ]);

      // Calculate stats
      const totalContacts = listsData.reduce((sum, list) => sum + Number(list.contact_count || 0), 0);
      const totalMessages = messagesData.length;
      const activeCampaigns = campaignsData.filter(c => c.status === 'running').length;
      const sentMessages = campaignsData.reduce((sum, c) => sum + c.sent_count, 0);

      setStats({
        totalContacts,
        totalMessages,
        activeCampaigns,
        sentMessages,
      });

      // Get first connected connection or first connection
      const activeConnection = connectionsData.find(c => c.status === 'connected') || connectionsData[0];
      setConnection(activeConnection || null);

      // Recent campaigns (last 5)
      setRecentCampaigns(campaignsData.slice(0, 5));

    } catch (err) {
      console.error('Error loading dashboard:', err);
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

  return (
    <MainLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="animate-slide-up">
          <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="mt-1 text-muted-foreground">
            Visão geral do seu sistema de disparo de mensagens
          </p>
        </div>

        {/* Connection Status */}
        <ConnectionStatus
          status={connection?.status === 'connected' ? 'connected' : connection ? 'disconnected' : 'disconnected'}
          instanceName={connection?.instance_name || "Nenhuma conexão"}
          phoneNumber={connection?.phone_number || undefined}
        />

        {/* Stats Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Total de Contatos"
            value={stats.totalContacts.toLocaleString('pt-BR')}
            description="Em todas as listas"
            icon={<Users className="h-6 w-6 text-primary" />}
          />
          <StatsCard
            title="Templates de Mensagem"
            value={stats.totalMessages.toString()}
            description="Mensagens criadas"
            icon={<MessageSquare className="h-6 w-6 text-primary" />}
          />
          <StatsCard
            title="Campanhas Ativas"
            value={stats.activeCampaigns.toString()}
            description="Em execução agora"
            icon={<Send className="h-6 w-6 text-primary" />}
          />
          <StatsCard
            title="Mensagens Enviadas"
            value={stats.sentMessages.toLocaleString('pt-BR')}
            description="Total de envios"
            icon={<CheckCircle2 className="h-6 w-6 text-primary" />}
          />
        </div>

        {/* Recent Campaigns & Quick Actions */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Recent Campaigns */}
          <Card className="animate-fade-in shadow-card">
            <CardHeader>
              <CardTitle>Campanhas Recentes</CardTitle>
              <CardDescription>Últimas campanhas criadas</CardDescription>
            </CardHeader>
            <CardContent>
              {recentCampaigns.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Send className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">Nenhuma campanha ainda</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentCampaigns.map((campaign) => {
                    const config = statusConfig[campaign.status] || statusConfig.pending;
                    const StatusIcon = config.icon;
                    return (
                      <div
                        key={campaign.id}
                        className="flex items-center justify-between rounded-lg border border-border p-3"
                      >
                        <div>
                          <p className="font-medium text-foreground">{campaign.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {campaign.list_name || "Lista"} • {campaign.sent_count} enviadas
                          </p>
                        </div>
                        <Badge className={cn(config.bgColor, config.color, "border-0")}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {config.label}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card className="rounded-xl bg-card p-6 shadow-card border border-border animate-fade-in">
            <CardHeader className="p-0 pb-6">
              <CardTitle>Ações Rápidas</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid gap-4 sm:grid-cols-2">
                <a
                  href="/contatos"
                  className="flex flex-col items-center gap-3 rounded-lg border border-border p-6 transition-all duration-200 hover:border-primary hover:bg-accent"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent">
                    <Users className="h-6 w-6 text-primary" />
                  </div>
                  <span className="text-sm font-medium text-foreground">
                    Importar Contatos
                  </span>
                </a>
                <a
                  href="/mensagens"
                  className="flex flex-col items-center gap-3 rounded-lg border border-border p-6 transition-all duration-200 hover:border-primary hover:bg-accent"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent">
                    <MessageSquare className="h-6 w-6 text-primary" />
                  </div>
                  <span className="text-sm font-medium text-foreground">
                    Criar Mensagem
                  </span>
                </a>
                <a
                  href="/campanhas"
                  className="flex flex-col items-center gap-3 rounded-lg border border-border p-6 transition-all duration-200 hover:border-primary hover:bg-accent sm:col-span-2"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent">
                    <Send className="h-6 w-6 text-primary" />
                  </div>
                  <span className="text-sm font-medium text-foreground">
                    Nova Campanha
                  </span>
                </a>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
};

export default Index;
