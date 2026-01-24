import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { 
  BarChart3, Users, MessageSquare, ArrowRightLeft, 
  Sparkles, TrendingUp, Calendar
} from "lucide-react";
import { useChatbots, Chatbot, ChatbotStats } from "@/hooks/use-chatbots";
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, BarChart, Bar
} from "recharts";

interface ChatbotStatsDialogProps {
  open: boolean;
  chatbot: Chatbot | null;
  onClose: () => void;
}

export function ChatbotStatsDialog({ open, chatbot, onClose }: ChatbotStatsDialogProps) {
  const { getStats } = useChatbots();
  const [stats, setStats] = useState<ChatbotStats | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && chatbot) {
      loadStats();
    }
  }, [open, chatbot]);

  const loadStats = async () => {
    if (!chatbot) return;
    
    setLoading(true);
    const data = await getStats(chatbot.id);
    setStats(data);
    setLoading(false);
  };

  if (!chatbot) return null;

  const completionRate = stats?.summary?.total_sessions 
    ? ((stats.summary.completed_sessions / stats.summary.total_sessions) * 100).toFixed(1)
    : '0';

  const transferRate = stats?.summary?.total_sessions 
    ? ((stats.summary.transferred_sessions / stats.summary.total_sessions) * 100).toFixed(1)
    : '0';

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Estatísticas - {chatbot.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-blue-500/10">
                    <Users className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats?.summary?.total_sessions || 0}</p>
                    <p className="text-xs text-muted-foreground">Sessões</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-green-500/10">
                    <TrendingUp className="h-5 w-5 text-green-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{completionRate}%</p>
                    <p className="text-xs text-muted-foreground">Concluídas</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-orange-500/10">
                    <ArrowRightLeft className="h-5 w-5 text-orange-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{transferRate}%</p>
                    <p className="text-xs text-muted-foreground">Transferidas</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-purple-500/10">
                    <Sparkles className="h-5 w-5 text-purple-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats?.summary?.ai_requests || 0}</p>
                    <p className="text-xs text-muted-foreground">Requests IA</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Messages Stats */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <MessageSquare className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-lg font-semibold">
                      {stats?.summary?.total_messages_in || 0} recebidas
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {stats?.summary?.total_messages_out || 0} enviadas
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Calendar className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-lg font-semibold">
                      {stats?.active_sessions || 0} ativas agora
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Duração média: {Math.round((stats?.summary?.avg_duration || 0) / 60)}min
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Daily Chart */}
          {stats?.daily && stats.daily.length > 0 && (
            <Card>
              <CardContent className="pt-6">
                <h4 className="font-medium mb-4">Sessões por Dia</h4>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.daily}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="date" 
                        tick={{ fontSize: 12 }}
                        tickFormatter={(value) => new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                      />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip 
                        labelFormatter={(value) => new Date(value).toLocaleDateString('pt-BR')}
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px'
                        }}
                      />
                      <Bar dataKey="total_sessions" fill="hsl(var(--primary))" name="Sessões" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="completed_sessions" fill="hsl(142, 76%, 36%)" name="Concluídas" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="transferred_sessions" fill="hsl(25, 95%, 53%)" name="Transferidas" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* AI Usage */}
          {chatbot.ai_provider !== 'none' && (
            <Card>
              <CardContent className="pt-6">
                <h4 className="font-medium mb-4 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Uso de IA
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-muted">
                    <p className="text-2xl font-bold">{stats?.summary?.ai_requests || 0}</p>
                    <p className="text-sm text-muted-foreground">Requisições</p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted">
                    <p className="text-2xl font-bold">
                      {((stats?.summary?.ai_tokens_used || 0) / 1000).toFixed(1)}k
                    </p>
                    <p className="text-sm text-muted-foreground">Tokens usados</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Empty State */}
          {!loading && (!stats?.daily || stats.daily.length === 0) && (
            <div className="text-center py-8 text-muted-foreground">
              <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Nenhuma estatística disponível ainda</p>
              <p className="text-sm">Os dados aparecerão conforme o chatbot for usado</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
