import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Send,
  Plus,
  Calendar as CalendarIcon,
  Clock,
  Play,
  Pause,
  CheckCircle2,
  AlertCircle,
  Eye,
  Trash2,
  Timer,
  Users,
  MessageSquare,
  Shuffle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCampaigns, Campaign } from "@/hooks/use-campaigns";
import { useContacts, ContactList } from "@/hooks/use-contacts";
import { useMessages, MessageTemplate } from "@/hooks/use-messages";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface Connection {
  id: string;
  name: string;
  status: string;
}

const statusConfig = {
  pending: { icon: CalendarIcon, label: "Agendada", color: "text-muted-foreground", bgColor: "bg-muted" },
  running: { icon: Play, label: "Em Execução", color: "text-warning", bgColor: "bg-warning/10" },
  completed: { icon: CheckCircle2, label: "Concluída", color: "text-success", bgColor: "bg-success/10" },
  paused: { icon: Pause, label: "Pausada", color: "text-destructive", bgColor: "bg-destructive/10" },
  cancelled: { icon: AlertCircle, label: "Cancelada", color: "text-muted-foreground", bgColor: "bg-muted" },
};

const Campanhas = () => {
  const { loading: loadingCampaigns, getCampaigns, createCampaign, updateStatus, deleteCampaign } = useCampaigns();
  const { getLists } = useContacts();
  const { getMessages } = useMessages();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [lists, setLists] = useState<ContactList[]>([]);
  const [messages, setMessages] = useState<MessageTemplate[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);

  const [activeTab, setActiveTab] = useState("list");
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  
  // Form state
  const [campaignName, setCampaignName] = useState("");
  const [selectedConnection, setSelectedConnection] = useState("");
  const [selectedList, setSelectedList] = useState("");
  const [selectedMessage, setSelectedMessage] = useState("");
  const [startDate, setStartDate] = useState<Date>();
  const [minDelay, setMinDelay] = useState("5");
  const [maxDelay, setMaxDelay] = useState("15");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [campaignsData, listsData, messagesData, connectionsData] = await Promise.all([
        getCampaigns(),
        getLists(),
        getMessages(),
        api<Connection[]>('/api/connections'),
      ]);
      setCampaigns(campaignsData);
      setLists(listsData);
      setMessages(messagesData);
      setConnections(connectionsData);
    } catch (err) {
      toast.error("Erro ao carregar dados");
    }
  };

  const resetForm = () => {
    setCampaignName("");
    setSelectedConnection("");
    setSelectedList("");
    setSelectedMessage("");
    setStartDate(undefined);
    setMinDelay("5");
    setMaxDelay("15");
  };

  const handleCreateCampaign = async () => {
    if (!campaignName || !selectedConnection || !selectedList || !selectedMessage) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    try {
      await createCampaign({
        name: campaignName,
        connection_id: selectedConnection,
        list_id: selectedList,
        message_id: selectedMessage,
        scheduled_at: startDate?.toISOString(),
        min_delay: parseInt(minDelay),
        max_delay: parseInt(maxDelay),
      });
      toast.success("Campanha criada com sucesso!");
      resetForm();
      setActiveTab("list");
      loadData();
    } catch (err) {
      toast.error("Erro ao criar campanha");
    }
  };

  const handleUpdateStatus = async (id: string, status: Campaign['status']) => {
    try {
      await updateStatus(id, status);
      toast.success("Status atualizado!");
      loadData();
    } catch (err) {
      toast.error("Erro ao atualizar status");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteCampaign(id);
      toast.success("Campanha deletada!");
      loadData();
    } catch (err) {
      toast.error("Erro ao deletar campanha");
    }
  };

  const getProgress = (campaign: Campaign) => {
    const list = lists.find(l => l.id === campaign.list_id);
    const total = list?.contact_count || 0;
    if (total === 0) return 0;
    return ((campaign.sent_count + campaign.failed_count) / total) * 100;
  };

  return (
    <MainLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between animate-slide-up">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Campanhas</h1>
            <p className="mt-1 text-muted-foreground">
              Gerencie e acompanhe seus disparos de mensagens
            </p>
          </div>
          <Button variant="gradient" onClick={() => { resetForm(); setActiveTab("create"); }}>
            <Plus className="h-4 w-4" />
            Nova Campanha
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="list">Campanhas</TabsTrigger>
            <TabsTrigger value="create">Criar Campanha</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-4 mt-6">
            {loadingCampaigns && campaigns.length === 0 ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : campaigns.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Send className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhuma campanha criada</p>
                <p className="text-sm">Clique em "Nova Campanha" para começar</p>
              </div>
            ) : (
              campaigns.map((campaign, index) => {
                const config = statusConfig[campaign.status] || statusConfig.pending;
                const StatusIcon = config.icon;
                const progress = getProgress(campaign);
                const list = lists.find(l => l.id === campaign.list_id);
                const totalContacts = list?.contact_count || 0;

                return (
                  <Card
                    key={campaign.id}
                    className="transition-all duration-200 hover:shadow-elevated animate-fade-in"
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <CardContent className="p-6">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <h3 className="text-lg font-semibold text-foreground">
                              {campaign.name}
                            </h3>
                            <Badge className={cn(config.bgColor, config.color, "border-0")}>
                              <StatusIcon className="h-3 w-3 mr-1" />
                              {config.label}
                            </Badge>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-4 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Users className="h-4 w-4" />
                              {campaign.list_name || "Lista removida"}
                            </span>
                            <span className="flex items-center gap-1">
                              <MessageSquare className="h-4 w-4" />
                              {campaign.message_name || "Mensagem removida"}
                            </span>
                            {campaign.scheduled_at && (
                              <span className="flex items-center gap-1">
                                <CalendarIcon className="h-4 w-4" />
                                {format(new Date(campaign.scheduled_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Clock className="h-4 w-4" />
                              {campaign.min_delay}-{campaign.max_delay}s entre envios
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-2xl font-bold text-foreground">
                              {campaign.sent_count}/{totalContacts}
                            </p>
                            <p className="text-sm text-muted-foreground">mensagens enviadas</p>
                          </div>
                          <div className="flex gap-2">
                            {campaign.status === "pending" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleUpdateStatus(campaign.id, "running")}
                              >
                                <Play className="h-4 w-4" />
                                Iniciar
                              </Button>
                            )}
                            {campaign.status === "running" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleUpdateStatus(campaign.id, "paused")}
                              >
                                <Pause className="h-4 w-4" />
                                Pausar
                              </Button>
                            )}
                            {campaign.status === "paused" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleUpdateStatus(campaign.id, "running")}
                              >
                                <Play className="h-4 w-4" />
                                Retomar
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(campaign.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </div>
                      {campaign.status !== "pending" && (
                        <div className="mt-4">
                          <Progress value={progress} className="h-2" />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>

          <TabsContent value="create" className="mt-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="animate-fade-in shadow-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Send className="h-5 w-5 text-primary" />
                    Nova Campanha
                  </CardTitle>
                  <CardDescription>
                    Configure os detalhes da sua campanha de envio
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="campaignName">Nome da Campanha</Label>
                    <Input
                      id="campaignName"
                      placeholder="Ex: Promoção de Verão"
                      value={campaignName}
                      onChange={(e) => setCampaignName(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Conexão WhatsApp</Label>
                    <Select value={selectedConnection} onValueChange={setSelectedConnection}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione uma conexão" />
                      </SelectTrigger>
                      <SelectContent>
                        {connections.map((conn) => (
                          <SelectItem key={conn.id} value={conn.id}>
                            {conn.name} ({conn.status})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Lista de Contatos</Label>
                    <Select value={selectedList} onValueChange={setSelectedList}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione uma lista" />
                      </SelectTrigger>
                      <SelectContent>
                        {lists.map((list) => (
                          <SelectItem key={list.id} value={list.id}>
                            {list.name} ({list.contact_count || 0} contatos)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Mensagem</Label>
                    <Select value={selectedMessage} onValueChange={setSelectedMessage}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione uma mensagem" />
                      </SelectTrigger>
                      <SelectContent>
                        {messages.map((msg) => (
                          <SelectItem key={msg.id} value={msg.id}>
                            {msg.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              <Card className="animate-fade-in shadow-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Timer className="h-5 w-5 text-primary" />
                    Agendamento
                  </CardTitle>
                  <CardDescription>
                    Configure quando e como os envios serão feitos
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Data de Início (opcional)</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !startDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {startDate ? format(startDate, "dd/MM/yyyy", { locale: ptBR }) : "Iniciar imediatamente"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={startDate}
                          onSelect={setStartDate}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="minDelay">Delay Mínimo (seg)</Label>
                      <Input
                        id="minDelay"
                        type="number"
                        min="1"
                        max="300"
                        value={minDelay}
                        onChange={(e) => setMinDelay(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="maxDelay">Delay Máximo (seg)</Label>
                      <Input
                        id="maxDelay"
                        type="number"
                        min="1"
                        max="300"
                        value={maxDelay}
                        onChange={(e) => setMaxDelay(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="rounded-lg bg-accent/50 p-4">
                    <div className="flex items-start gap-3">
                      <Shuffle className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          Envio Aleatório Ativo
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          As mensagens serão enviadas com pausas aleatórias de {minDelay} a {maxDelay} segundos
                          entre cada envio para proteger sua conta.
                        </p>
                      </div>
                    </div>
                  </div>

                  <Button 
                    variant="gradient" 
                    className="w-full"
                    onClick={handleCreateCampaign}
                    disabled={loadingCampaigns}
                  >
                    {loadingCampaigns ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Criar Campanha
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
};

export default Campanhas;
