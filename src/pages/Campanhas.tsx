import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
  Trash2,
  Timer,
  Users,
  MessageSquare,
  Shuffle,
  Loader2,
  Coffee,
  Settings2,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCampaigns, Campaign } from "@/hooks/use-campaigns";
import { useContacts, ContactList } from "@/hooks/use-contacts";
import { useMessages, MessageTemplate } from "@/hooks/use-messages";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { CampaignDetailModal } from "@/components/campanhas/CampaignDetailModal";

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
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  
  // Form state - Basic
  const [campaignName, setCampaignName] = useState("");
  const [selectedConnection, setSelectedConnection] = useState("");
  const [selectedList, setSelectedList] = useState("");
  const [selectedMessages, setSelectedMessages] = useState<string[]>([]);
  
  // Form state - Schedule
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("18:00");
  
  // Form state - Delays
  const [minDelay, setMinDelay] = useState("120");
  const [maxDelay, setMaxDelay] = useState("300");
  const [pauseAfterMessages, setPauseAfterMessages] = useState("20");
  const [pauseDuration, setPauseDuration] = useState("10");
  const [randomOrder, setRandomOrder] = useState(true);
  const [randomMessages, setRandomMessages] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const results = await Promise.allSettled([
      getCampaigns(),
      getLists(),
      getMessages(),
      api<Connection[]>('/api/connections'),
    ]);

    const [campaignsRes, listsRes, messagesRes, connectionsRes] = results;

    if (campaignsRes.status === 'fulfilled') {
      setCampaigns(campaignsRes.value);
    } else {
      console.error('Erro ao carregar campanhas:', campaignsRes.reason);
      setCampaigns([]);
      toast.error(`Erro ao carregar campanhas: ${campaignsRes.reason?.message || 'verifique o backend'}`);
    }

    if (listsRes.status === 'fulfilled') {
      setLists(listsRes.value);
    } else {
      console.error('Erro ao carregar listas:', listsRes.reason);
      setLists([]);
      toast.error(`Erro ao carregar listas: ${listsRes.reason?.message || 'verifique o backend'}`);
    }

    if (messagesRes.status === 'fulfilled') {
      setMessages(messagesRes.value);
    } else {
      console.error('Erro ao carregar mensagens:', messagesRes.reason);
      setMessages([]);
      toast.error(`Erro ao carregar mensagens: ${messagesRes.reason?.message || 'verifique o backend'}`);
    }

    if (connectionsRes.status === 'fulfilled') {
      setConnections(connectionsRes.value);
    } else {
      console.error('Erro ao carregar conexões:', connectionsRes.reason);
      setConnections([]);
      toast.error(`Erro ao carregar conexões: ${connectionsRes.reason?.message || 'verifique o backend'}`);
    }
  };

  const resetForm = () => {
    setCampaignName("");
    setSelectedConnection("");
    setSelectedList("");
    setSelectedMessages([]);
    setStartDate(undefined);
    setEndDate(undefined);
    setStartTime("08:00");
    setEndTime("18:00");
    setMinDelay("120");
    setMaxDelay("300");
    setPauseAfterMessages("20");
    setPauseDuration("10");
    setRandomOrder(true);
    setRandomMessages(false);
  };

  const toggleMessageSelection = (msgId: string) => {
    setSelectedMessages(prev => 
      prev.includes(msgId) 
        ? prev.filter(id => id !== msgId)
        : [...prev, msgId]
    );
  };

  const handleCreateCampaign = async () => {
    if (!campaignName || !selectedConnection || !selectedList || selectedMessages.length === 0) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    const minDelayNum = parseInt(minDelay);
    const maxDelayNum = parseInt(maxDelay);
    
    if (minDelayNum < 120) {
      toast.error("Delay mínimo deve ser de pelo menos 120 segundos");
      return;
    }
    
    if (maxDelayNum > 300) {
      toast.error("Delay máximo não pode exceder 300 segundos");
      return;
    }

    if (minDelayNum > maxDelayNum) {
      toast.error("Delay mínimo não pode ser maior que o máximo");
      return;
    }

    try {
      await createCampaign({
        name: campaignName,
        connection_id: selectedConnection,
        list_id: selectedList,
        message_ids: selectedMessages,
        start_date: startDate?.toISOString(),
        end_date: endDate?.toISOString(),
        start_time: startTime,
        end_time: endTime,
        min_delay: minDelayNum,
        max_delay: maxDelayNum,
        pause_after_messages: parseInt(pauseAfterMessages),
        pause_duration: parseInt(pauseDuration),
        random_order: randomOrder,
        random_messages: randomMessages,
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
                    className="transition-all duration-200 hover:shadow-elevated animate-fade-in cursor-pointer"
                    style={{ animationDelay: `${index * 100}ms` }}
                    onClick={() => {
                      setSelectedCampaignId(campaign.id);
                      setShowDetailModal(true);
                    }}
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
                            {campaign.random_order && (
                              <Badge variant="outline" className="text-xs">
                                <Shuffle className="h-3 w-3 mr-1" />
                                Aleatório
                              </Badge>
                            )}
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
                            {campaign.start_date && (
                              <span className="flex items-center gap-1">
                                <CalendarIcon className="h-4 w-4" />
                                {format(new Date(campaign.start_date), "dd/MM/yyyy", { locale: ptBR })}
                                {campaign.end_date && ` - ${format(new Date(campaign.end_date), "dd/MM/yyyy", { locale: ptBR })}`}
                              </span>
                            )}
                            {campaign.start_time && campaign.end_time && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-4 w-4" />
                                {campaign.start_time} - {campaign.end_time}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Timer className="h-4 w-4" />
                              {campaign.min_delay}-{campaign.max_delay}s
                            </span>
                            <span className="flex items-center gap-1">
                              <Coffee className="h-4 w-4" />
                              Pausa a cada {campaign.pause_after_messages} msgs
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
                          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
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
              {/* Campaign Details */}
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
                     <Select value={selectedConnection} onValueChange={setSelectedConnection} disabled={connections.length === 0}>
                       <SelectTrigger>
                         <SelectValue placeholder={connections.length === 0 ? "Nenhuma conexão disponível" : "Selecione uma conexão"} />
                       </SelectTrigger>
                       <SelectContent>
                         {connections.length === 0 ? (
                           <div className="px-2 py-2 text-sm text-muted-foreground">Nenhuma conexão encontrada</div>
                         ) : (
                           connections.map((conn) => (
                             <SelectItem key={conn.id} value={conn.id}>
                               {conn.name} ({conn.status})
                             </SelectItem>
                           ))
                         )}
                       </SelectContent>
                     </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Lista de Contatos</Label>
                     <Select value={selectedList} onValueChange={setSelectedList} disabled={lists.length === 0}>
                       <SelectTrigger>
                         <SelectValue placeholder={lists.length === 0 ? "Nenhuma lista disponível" : "Selecione uma lista"} />
                       </SelectTrigger>
                       <SelectContent>
                         {lists.length === 0 ? (
                           <div className="px-2 py-2 text-sm text-muted-foreground">Nenhuma lista encontrada</div>
                         ) : (
                           lists.map((list) => (
                             <SelectItem key={list.id} value={list.id}>
                               {list.name} ({list.contact_count || 0} contatos)
                             </SelectItem>
                           ))
                         )}
                       </SelectContent>
                     </Select>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Mensagens ({selectedMessages.length} selecionadas)</Label>
                      {selectedMessages.length > 1 && (
                        <Badge variant="outline" className="text-xs">
                          <Shuffle className="h-3 w-3 mr-1" />
                          Envio aleatório
                        </Badge>
                      )}
                    </div>
                     <div className="space-y-2 max-h-40 overflow-y-auto rounded-lg border p-2">
                       {messages.length === 0 ? (
                         <div className="p-3 text-sm text-muted-foreground">
                           Nenhuma mensagem encontrada
                         </div>
                       ) : (
                         messages.map((msg) => (
                           <div
                             key={msg.id}
                             className={cn(
                               "flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors",
                               selectedMessages.includes(msg.id)
                                 ? "bg-primary/10 border border-primary"
                                 : "hover:bg-accent"
                             )}
                             onClick={() => toggleMessageSelection(msg.id)}
                           >
                             <div className={cn(
                               "w-4 h-4 rounded border flex items-center justify-center",
                               selectedMessages.includes(msg.id) ? "bg-primary border-primary" : "border-muted-foreground"
                             )}>
                               {selectedMessages.includes(msg.id) && (
                                 <Check className="h-3 w-3 text-primary-foreground" />
                               )}
                             </div>
                             <span className="text-sm">{msg.name}</span>
                           </div>
                         ))
                       )}
                     </div>
                    <p className="text-xs text-muted-foreground">
                      Selecione múltiplas mensagens para envio aleatório entre contatos
                    </p>
                  </div>

                  {/* Random Order Toggle */}
                  <div className="flex items-center justify-between rounded-lg bg-accent/50 p-4">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <Shuffle className="h-4 w-4 text-primary" />
                        <Label className="font-medium">Ordem Aleatória</Label>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Enviar para contatos em ordem aleatória
                      </p>
                    </div>
                    <Switch
                      checked={randomOrder}
                      onCheckedChange={setRandomOrder}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Schedule Settings */}
              <div className="space-y-6">
                <Card className="animate-fade-in shadow-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CalendarIcon className="h-5 w-5 text-primary" />
                      Período de Envio
                    </CardTitle>
                    <CardDescription>
                      Configure quando a campanha deve ser executada
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Data de Início</Label>
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
                              {startDate ? format(startDate, "dd/MM/yyyy", { locale: ptBR }) : "Hoje"}
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
                      <div className="space-y-2">
                        <Label>Data de Término</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full justify-start text-left font-normal",
                                !endDate && "text-muted-foreground"
                              )}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {endDate ? format(endDate, "dd/MM/yyyy", { locale: ptBR }) : "Sem limite"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0">
                            <Calendar
                              mode="single"
                              selected={endDate}
                              onSelect={setEndDate}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="startTime">Horário de Início</Label>
                        <Input
                          id="startTime"
                          type="time"
                          value={startTime}
                          onChange={(e) => setStartTime(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="endTime">Horário de Término</Label>
                        <Input
                          id="endTime"
                          type="time"
                          value={endTime}
                          onChange={(e) => setEndTime(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                      <Clock className="inline h-3 w-3 mr-1" />
                      Envios serão feitos apenas entre {startTime} e {endTime}
                    </div>
                  </CardContent>
                </Card>

                <Card className="animate-fade-in shadow-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Settings2 className="h-5 w-5 text-primary" />
                      Configurações de Delay
                    </CardTitle>
                    <CardDescription>
                      Proteja sua conta com delays e pausas automáticas
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="minDelay">Delay Mínimo (seg)</Label>
                        <Input
                          id="minDelay"
                          type="number"
                          min="120"
                          max="300"
                          value={minDelay}
                          onChange={(e) => setMinDelay(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">Mínimo: 120s</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="maxDelay">Delay Máximo (seg)</Label>
                        <Input
                          id="maxDelay"
                          type="number"
                          min="120"
                          max="300"
                          value={maxDelay}
                          onChange={(e) => setMaxDelay(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">Máximo: 300s</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="pauseAfterMessages">Pausar após (msgs)</Label>
                        <Input
                          id="pauseAfterMessages"
                          type="number"
                          min="5"
                          max="50"
                          value={pauseAfterMessages}
                          onChange={(e) => setPauseAfterMessages(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="pauseDuration">Duração da pausa (min)</Label>
                        <Input
                          id="pauseDuration"
                          type="number"
                          min="5"
                          max="30"
                          value={pauseDuration}
                          onChange={(e) => setPauseDuration(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="rounded-lg bg-accent/50 p-4">
                      <div className="flex items-start gap-3">
                        <Coffee className="h-5 w-5 text-primary mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            Pausas Automáticas
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            A cada {pauseAfterMessages} mensagens, o sistema fará uma pausa de {pauseDuration} minutos
                            para proteger sua conta.
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
            </div>
          </TabsContent>
        </Tabs>

        {/* Campaign Detail Modal */}
        <CampaignDetailModal
          campaignId={selectedCampaignId}
          open={showDetailModal}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedCampaignId(null);
          }}
        />
      </div>
    </MainLayout>
  );
};

export default Campanhas;
