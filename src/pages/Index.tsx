import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { ConnectionStatus } from "@/components/dashboard/ConnectionStatus";
import { AttendanceChart } from "@/components/dashboard/AttendanceChart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, MessageSquare, Send, CheckCircle2, Loader2, Play, Clock, Calendar as CalendarIcon, Pause, MessageCircle, CheckCheck, Hourglass, Headphones, Megaphone } from "lucide-react";
import { useContacts } from "@/hooks/use-contacts";
import { useMessages } from "@/hooks/use-messages";
import { useCampaigns, Campaign } from "@/hooks/use-campaigns";
import { useConnectionStatus } from "@/hooks/use-connection-status";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useChat } from "@/hooks/use-chat";

interface DashboardStats {
  totalContacts: number;
  totalMessages: number;
  activeCampaigns: number;
  scheduledCampaigns: number;
  sentMessages: number;
  conversationsAssigned: number;
  conversationsUnassigned: number;
  conversationsWaiting: number;
  conversationsAttending: number;
  conversationsFinished: number;
  totalUsers: number;
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
  const { connections, hasConnectedConnection, isLoading: connectionLoading } = useConnectionStatus({ intervalSeconds: 30 });
  const { getChatStats } = useChat();

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    totalContacts: 0,
    totalMessages: 0,
    activeCampaigns: 0,
    scheduledCampaigns: 0,
    sentMessages: 0,
    conversationsAssigned: 0,
    conversationsUnassigned: 0,
    conversationsWaiting: 0,
    conversationsAttending: 0,
    conversationsFinished: 0,
    totalUsers: 0,
  });
  const [recentCampaigns, setRecentCampaigns] = useState<Campaign[]>([]);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const [listsData, messagesData, campaignsData, chatStats, attendanceCounts, orgs] = await Promise.all([
        getLists(),
        getMessages(),
        getCampaigns(),
        getChatStats().catch(() => null),
        api<{ waiting: number; attending: number; finished: number }>('/api/chat/conversations/attendance-counts?is_group=false').catch(() => ({ waiting: 0, attending: 0, finished: 0 })),
        api<Array<{ id: string; name: string }>>('/api/organizations').catch(() => []),
      ]);

      const orgId = orgs?.[0]?.id;
      const members = orgId
        ? await api<Array<{ id: string }>>(`/api/organizations/${orgId}/members`).catch(() => [])
        : [];

      // Calculate stats
      const totalContacts = listsData.reduce((sum, list) => sum + Number(list.contact_count || 0), 0);
      const totalMessages = messagesData.length;
      const activeCampaigns = campaignsData.filter(c => c.status === 'running').length;
      const scheduledCampaigns = campaignsData.filter(c => c.status === 'pending').length;
      const sentMessages = campaignsData.reduce((sum, c) => sum + c.sent_count, 0);

      const assigned = chatStats?.conversations_by_status?.find(s => s.status === 'assigned')?.count ?? 0;
      const unassigned = chatStats?.conversations_by_status?.find(s => s.status === 'unassigned')?.count ?? 0;

      setStats({
        totalContacts,
        totalMessages,
        activeCampaigns,
        scheduledCampaigns,
        sentMessages,
        conversationsAssigned: assigned,
        conversationsUnassigned: unassigned,
        conversationsWaiting: attendanceCounts.waiting,
        conversationsAttending: attendanceCounts.attending,
        conversationsFinished: attendanceCounts.finished,
        totalUsers: members.length,
      });

      // Recent campaigns (last 5)
      setRecentCampaigns(campaignsData.slice(0, 5));

    } catch (err) {
      console.error('Error loading dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  // Get first connection for display
  const firstConnection = connections[0];
  const connectionStatus = firstConnection?.status === 'connected' ? 'connected' : 'disconnected';
  const connectionName = firstConnection?.name || "Nenhuma conexão";
  const connectionPhone = firstConnection?.phoneNumber;

  // NOTE: connection status polling runs continuously; don't block the whole dashboard while it refreshes.
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
            Visão geral do seu sistema
          </p>
        </div>

        {/* Connection Status */}
        <ConnectionStatus
          status={connectionStatus}
          instanceName={connectionName}
          phoneNumber={connectionPhone}
        />

        {/* General Stats */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="WhatsApps Conectados"
            value={`${connections.filter(c => c.status === 'connected').length}/${connections.length}`}
            description={connectionLoading ? "Atualizando status..." : (hasConnectedConnection ? "Conectado" : "Sem conexão")}
            icon={<Users className="h-6 w-6 text-primary" />}
          />
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
            title="Usuários"
            value={stats.totalUsers.toLocaleString('pt-BR')}
            description="Membros da organização"
            icon={<Users className="h-6 w-6 text-primary" />}
          />
        </div>

        {/* === ATENDIMENTO SECTION === */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-500/10">
              <Headphones className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">Atendimento</h2>
              <p className="text-sm text-muted-foreground">Métricas de conversas e suporte</p>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Stats cards */}
            <div className="grid gap-4 lg:col-span-1">
              <StatsCard
                title="Aguardando"
                value={stats.conversationsWaiting.toLocaleString('pt-BR')}
                description="Na fila de espera"
                icon={<Hourglass className="h-6 w-6 text-amber-500" />}
              />
              <StatsCard
                title="Atendendo"
                value={stats.conversationsAttending.toLocaleString('pt-BR')}
                description="Em atendimento ativo"
                icon={<MessageCircle className="h-6 w-6 text-blue-500" />}
              />
              <StatsCard
                title="Finalizados"
                value={stats.conversationsFinished.toLocaleString('pt-BR')}
                description="Atendimentos concluídos"
                icon={<CheckCheck className="h-6 w-6 text-green-500" />}
              />
            </div>

            {/* Chart */}
            <AttendanceChart 
              className="lg:col-span-2 animate-fade-in" 
              connections={connections}
              currentCounts={{
                waiting: stats.conversationsWaiting,
                attending: stats.conversationsAttending,
                finished: stats.conversationsFinished,
              }}
            />
          </div>
        </div>

        {/* === DISPAROS SECTION === */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
              <Megaphone className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">Disparos</h2>
              <p className="text-sm text-muted-foreground">Campanhas e envio em massa</p>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <StatsCard
              title="Campanhas Ativas"
              value={stats.activeCampaigns.toString()}
              description={`${stats.scheduledCampaigns} agendadas`}
              icon={<Play className="h-6 w-6 text-green-500" />}
            />
            <StatsCard
              title="Mensagens Enviadas"
              value={stats.sentMessages.toLocaleString('pt-BR')}
              description="Total de envios"
              icon={<CheckCircle2 className="h-6 w-6 text-primary" />}
            />
            <StatsCard
              title="Campanhas"
              value={`${stats.activeCampaigns + stats.scheduledCampaigns}`}
              description="Ativas + agendadas"
              icon={<Send className="h-6 w-6 text-primary" />}
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
      </div>
    </MainLayout>
  );
};

export default Index;
