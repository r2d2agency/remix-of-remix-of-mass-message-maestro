import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CRMDeal, CRMTask, useCRMDeal, useCRMDealMutations, useCRMTaskMutations } from "@/hooks/use-crm";
import { Building2, User, Phone, Mail, Calendar, Clock, CheckCircle, Plus, Trash2, X } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface DealDetailDialogProps {
  deal: CRMDeal | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DealDetailDialog({ deal, open, onOpenChange }: DealDetailDialogProps) {
  const [activeTab, setActiveTab] = useState("details");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskType, setNewTaskType] = useState<string>("task");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");

  const { data: fullDeal, isLoading } = useCRMDeal(deal?.id || null);
  const { updateDeal } = useCRMDealMutations();
  const { createTask, completeTask, deleteTask } = useCRMTaskMutations();

  if (!deal) return null;

  const currentDeal = fullDeal || deal;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const handleStatusChange = (status: string) => {
    updateDeal.mutate({ 
      id: deal.id, 
      status: status as 'open' | 'won' | 'lost'
    });
  };

  const handleAddTask = () => {
    if (!newTaskTitle.trim()) return;
    
    createTask.mutate({
      deal_id: deal.id,
      title: newTaskTitle,
      type: newTaskType as CRMTask['type'],
      due_date: newTaskDueDate || undefined,
    });
    
    setNewTaskTitle("");
    setNewTaskType("task");
    setNewTaskDueDate("");
  };

  const taskTypeLabels: Record<string, string> = {
    task: "Tarefa",
    call: "Ligação",
    email: "Email",
    meeting: "Reunião",
    follow_up: "Follow-up",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-xl">{currentDeal.title}</DialogTitle>
              <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                <Building2 className="h-4 w-4" />
                <span>{currentDeal.company_name}</span>
                <span>•</span>
                <span className="font-semibold text-foreground">
                  {formatCurrency(currentDeal.value)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Select value={currentDeal.status} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Em aberto</SelectItem>
                  <SelectItem value="won">Ganho</SelectItem>
                  <SelectItem value="lost">Perdido</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList>
            <TabsTrigger value="details">Detalhes</TabsTrigger>
            <TabsTrigger value="tasks">
              Tarefas
              {fullDeal?.tasks && fullDeal.tasks.filter(t => t.status === 'pending').length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">
                  {fullDeal.tasks.filter(t => t.status === 'pending').length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="contacts">Contatos</TabsTrigger>
            <TabsTrigger value="history">Histórico</TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 mt-4">
            <TabsContent value="details" className="m-0">
              <div className="grid grid-cols-2 gap-4">
                <Card className="p-4">
                  <h4 className="font-medium mb-3">Informações</h4>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Probabilidade</span>
                      <Badge variant="outline">{currentDeal.probability}%</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Etapa</span>
                      <span>{currentDeal.stage_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Responsável</span>
                      <span>{currentDeal.owner_name || "Não definido"}</span>
                    </div>
                    {currentDeal.expected_close_date && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Fechamento previsto</span>
                        <span>{format(parseISO(currentDeal.expected_close_date), "dd/MM/yyyy")}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Criado em</span>
                      <span>{format(parseISO(currentDeal.created_at), "dd/MM/yyyy", { locale: ptBR })}</span>
                    </div>
                  </div>
                </Card>

                <Card className="p-4">
                  <h4 className="font-medium mb-3">Descrição</h4>
                  <p className="text-sm text-muted-foreground">
                    {currentDeal.description || "Nenhuma descrição"}
                  </p>
                  {currentDeal.tags && currentDeal.tags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {currentDeal.tags.map((tag, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="tasks" className="m-0">
              {/* New task form */}
              <Card className="p-4 mb-4">
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Nova Tarefa
                </h4>
                <div className="flex gap-2">
                  <Input
                    placeholder="Título da tarefa"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    className="flex-1"
                  />
                  <Select value={newTaskType} onValueChange={setNewTaskType}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="task">Tarefa</SelectItem>
                      <SelectItem value="call">Ligação</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="meeting">Reunião</SelectItem>
                      <SelectItem value="follow_up">Follow-up</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="datetime-local"
                    value={newTaskDueDate}
                    onChange={(e) => setNewTaskDueDate(e.target.value)}
                    className="w-48"
                  />
                  <Button onClick={handleAddTask} disabled={!newTaskTitle.trim()}>
                    Adicionar
                  </Button>
                </div>
              </Card>

              {/* Task list */}
              <div className="space-y-2">
                {fullDeal?.tasks?.map((task: CRMTask) => (
                  <Card key={task.id} className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => {
                            if (task.status === 'pending') {
                              completeTask.mutate(task.id);
                            }
                          }}
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            task.status === 'completed' 
                              ? 'bg-green-500 border-green-500 text-white' 
                              : 'border-muted-foreground hover:border-primary'
                          }`}
                        >
                          {task.status === 'completed' && <CheckCircle className="h-3 w-3" />}
                        </button>
                        <div>
                          <p className={`text-sm font-medium ${task.status === 'completed' ? 'line-through text-muted-foreground' : ''}`}>
                            {task.title}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="outline" className="text-[10px]">
                              {taskTypeLabels[task.type]}
                            </Badge>
                            {task.due_date && (
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {format(parseISO(task.due_date), "dd/MM HH:mm")}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteTask.mutate(task.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </Card>
                ))}
                {(!fullDeal?.tasks || fullDeal.tasks.length === 0) && (
                  <p className="text-center text-muted-foreground py-8">
                    Nenhuma tarefa vinculada
                  </p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="contacts" className="m-0">
              <div className="space-y-2">
                {fullDeal?.contacts?.map((contact: any) => (
                  <Card key={contact.id} className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">
                            {contact.name}
                            {contact.is_primary && (
                              <Badge variant="secondary" className="ml-2 text-[10px]">Principal</Badge>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {contact.phone}
                          </p>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
                {(!fullDeal?.contacts || fullDeal.contacts.length === 0) && (
                  <p className="text-center text-muted-foreground py-8">
                    Nenhum contato vinculado
                  </p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="history" className="m-0">
              <div className="space-y-3">
                {fullDeal?.history?.map((item: any) => (
                  <div key={item.id} className="flex gap-3 text-sm">
                    <div className="w-2 h-2 rounded-full bg-primary mt-2" />
                    <div className="flex-1">
                      <p>
                        <span className="font-medium">{item.user_name || "Sistema"}</span>
                        {" "}
                        {item.action === 'created' && "criou a negociação"}
                        {item.action === 'stage_changed' && `moveu de "${item.from_value}" para "${item.to_value}"`}
                        {item.action === 'value_changed' && `alterou o valor de ${item.from_value} para ${item.to_value}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(parseISO(item.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                  </div>
                ))}
                {(!fullDeal?.history || fullDeal.history.length === 0) && (
                  <p className="text-center text-muted-foreground py-8">
                    Nenhum histórico disponível
                  </p>
                )}
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
