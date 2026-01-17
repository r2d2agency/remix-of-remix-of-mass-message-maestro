import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  MessageSquare, 
  Users, 
  Clock, 
  TrendingUp,
  Phone,
  UserCheck,
  UserX
} from "lucide-react";
import { ChatStats as ChatStatsType } from "@/hooks/use-chat";

interface ChatStatsProps {
  stats: ChatStatsType | null;
  loading?: boolean;
}

export function ChatStats({ stats, loading }: ChatStatsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4">
              <div className="h-4 bg-muted rounded w-1/2 mb-2" />
              <div className="h-6 bg-muted rounded w-1/3" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const statCards = [
    {
      title: "Conversas Ativas",
      value: stats.total_conversations,
      icon: MessageSquare,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      title: "Não Lidas",
      value: stats.unread_conversations,
      icon: Clock,
      color: "text-amber-500",
      bgColor: "bg-amber-500/10",
    },
    {
      title: "Mensagens Hoje",
      value: stats.messages_today,
      icon: TrendingUp,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    },
    {
      title: "Mensagens Semana",
      value: stats.messages_week,
      icon: Users,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
    },
  ];

  return (
    <div className="space-y-4 mb-4">
      {/* Main stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map((stat, index) => (
          <Card key={index} className="border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{stat.title}</p>
                  <p className="text-2xl font-bold mt-1">{stat.value}</p>
                </div>
                <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                  <stat.icon className={`h-5 w-5 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* By Connection */}
        {stats.conversations_by_connection.length > 0 && (
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Phone className="h-4 w-4 text-primary" />
                Por Conexão
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex flex-wrap gap-2">
                {stats.conversations_by_connection.map((item, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {item.connection_name}: {item.count}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* By Status */}
        {stats.conversations_by_status.length > 0 && (
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Por Status
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex flex-wrap gap-2">
                {stats.conversations_by_status.map((item, i) => (
                  <Badge 
                    key={i} 
                    variant={item.status === 'assigned' ? 'default' : 'outline'} 
                    className="text-xs"
                  >
                    {item.status === 'assigned' ? (
                      <><UserCheck className="h-3 w-3 mr-1" /> Atribuídas: {item.count}</>
                    ) : (
                      <><UserX className="h-3 w-3 mr-1" /> Não atribuídas: {item.count}</>
                    )}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
