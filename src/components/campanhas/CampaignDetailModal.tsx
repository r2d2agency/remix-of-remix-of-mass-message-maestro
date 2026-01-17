import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Loader2, 
  RefreshCw,
  Phone,
  Calendar,
  Timer,
  Users,
  MessageSquare,
  AlertCircle
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface CampaignMessage {
  id: string;
  phone: string;
  contact_name?: string;
  status: 'pending' | 'sent' | 'failed';
  sent_at?: string;
  scheduled_time?: string;
  error_message?: string;
  created_at: string;
}

interface CampaignDetails {
  campaign: {
    id: string;
    name: string;
    status: string;
    list_name: string;
    message_name: string;
    connection_name: string;
    min_delay: number;
    max_delay: number;
    pause_after_messages: number;
    pause_duration: number;
    sent_count: number;
    failed_count: number;
    total_contacts: number;
  };
  messages: CampaignMessage[];
  stats: {
    total: number;
    sent: number;
    failed: number;
    pending: number;
  };
  estimatedCompletion: string | null;
}

interface CampaignDetailModalProps {
  campaignId: string | null;
  open: boolean;
  onClose: () => void;
}

const statusConfig = {
  sent: { icon: CheckCircle2, label: "Enviado", color: "text-green-500", bgColor: "bg-green-500/10" },
  failed: { icon: XCircle, label: "Falhou", color: "text-red-500", bgColor: "bg-red-500/10" },
  pending: { icon: Clock, label: "Aguardando", color: "text-yellow-500", bgColor: "bg-yellow-500/10" },
};

export function CampaignDetailModal({ campaignId, open, onClose }: CampaignDetailModalProps) {
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState<CampaignDetails | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const loadDetails = useCallback(async () => {
    if (!campaignId) return;
    
    setLoading(true);
    try {
      const data = await api<CampaignDetails>(`/api/campaigns/${campaignId}/details`);
      setDetails(data);
    } catch (error) {
      console.error('Error loading campaign details:', error);
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    if (open && campaignId) {
      loadDetails();
    }
  }, [open, campaignId, loadDetails]);

  // Auto-refresh when campaign is running
  useEffect(() => {
    if (!open || !autoRefresh || !details?.campaign) return;
    if (details.campaign.status !== 'running') return;

    const interval = setInterval(loadDetails, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, [open, autoRefresh, details?.campaign?.status, loadDetails]);

  if (!open) return null;

  const progress = details?.stats 
    ? ((details.stats.sent + details.stats.failed) / details.stats.total) * 100 
    : 0;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              {details?.campaign?.name || 'Carregando...'}
            </DialogTitle>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={loadDetails}
              disabled={loading}
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
          </div>
        </DialogHeader>

        {loading && !details ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : details ? (
          <div className="flex flex-col gap-4 overflow-hidden">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-accent/50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-foreground">{details.stats.total}</div>
                <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <Users className="h-3 w-3" /> Total
                </div>
              </div>
              <div className="bg-green-500/10 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-green-500">{details.stats.sent}</div>
                <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Enviados
                </div>
              </div>
              <div className="bg-red-500/10 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-red-500">{details.stats.failed}</div>
                <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <XCircle className="h-3 w-3" /> Falhas
                </div>
              </div>
              <div className="bg-yellow-500/10 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-yellow-500">{details.stats.pending}</div>
                <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <Clock className="h-3 w-3" /> Pendentes
                </div>
              </div>
            </div>

            {/* Progress */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Progresso</span>
                <span className="font-medium">{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>

            {/* Estimated Completion */}
            {details.estimatedCompletion && details.campaign.status === 'running' && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 border border-primary/20">
                <Timer className="h-4 w-4 text-primary" />
                <span className="text-sm">
                  <span className="text-muted-foreground">Previsão de término:</span>{' '}
                  <span className="font-medium">
                    {format(new Date(details.estimatedCompletion), "dd/MM 'às' HH:mm", { locale: ptBR })}
                  </span>
                  <span className="text-muted-foreground ml-2">
                    ({formatDistanceToNow(new Date(details.estimatedCompletion), { locale: ptBR, addSuffix: true })})
                  </span>
                </span>
              </div>
            )}

            {/* Campaign Info */}
            <div className="flex flex-wrap gap-3 text-sm">
              <Badge variant="outline" className="gap-1">
                <Phone className="h-3 w-3" />
                {details.campaign.connection_name}
              </Badge>
              <Badge variant="outline" className="gap-1">
                <Users className="h-3 w-3" />
                {details.campaign.list_name}
              </Badge>
              <Badge variant="outline" className="gap-1">
                <MessageSquare className="h-3 w-3" />
                {details.campaign.message_name}
              </Badge>
              <Badge variant="outline" className="gap-1">
                <Timer className="h-3 w-3" />
                {details.campaign.min_delay}-{details.campaign.max_delay}s
              </Badge>
            </div>

            {/* Messages List */}
            <div className="flex-1 min-h-0">
              <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                <Users className="h-4 w-4" />
                Contatos ({details.messages.length})
              </h3>
              <ScrollArea className="h-[300px] rounded-lg border">
                <div className="divide-y divide-border">
                  {details.messages.map((msg) => {
                    const config = statusConfig[msg.status];
                    const StatusIcon = config.icon;
                    
                    return (
                      <div 
                        key={msg.id} 
                        className={cn(
                          "flex items-center justify-between p-3 hover:bg-accent/30 transition-colors",
                          config.bgColor
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <StatusIcon className={cn("h-4 w-4", config.color)} />
                          <div>
                            <div className="font-medium text-sm">
                              {msg.contact_name || 'Contato'}
                            </div>
                            <div className="text-xs text-muted-foreground flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {msg.phone}
                            </div>
                          </div>
                        </div>
                        
                        <div className="text-right">
                          {msg.status === 'sent' && msg.sent_at && (
                            <div className="text-xs text-muted-foreground">
                              <span className="text-green-500 font-medium">Enviado</span>
                              <br />
                              {format(new Date(msg.sent_at), "dd/MM HH:mm:ss", { locale: ptBR })}
                            </div>
                          )}
                          {msg.status === 'failed' && (
                            <div className="text-xs">
                              <span className="text-red-500 font-medium">Falhou</span>
                              {msg.error_message && (
                                <div className="text-muted-foreground max-w-[150px] truncate" title={msg.error_message}>
                                  {msg.error_message}
                                </div>
                              )}
                            </div>
                          )}
                          {msg.status === 'pending' && msg.scheduled_time && (
                            <div className="text-xs text-muted-foreground">
                              <span className="text-yellow-500 font-medium">Agendado</span>
                              <br />
                              {format(new Date(msg.scheduled_time), "HH:mm:ss", { locale: ptBR })}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  
                  {details.messages.length === 0 && (
                    <div className="p-8 text-center text-muted-foreground">
                      <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>Nenhuma mensagem processada ainda</p>
                      <p className="text-xs mt-1">
                        As mensagens aparecerão aqui quando a campanha iniciar
                      </p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        ) : (
          <div className="py-8 text-center text-muted-foreground">
            Erro ao carregar detalhes
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
