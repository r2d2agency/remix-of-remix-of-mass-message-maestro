import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { TaskDialog } from "@/components/crm/TaskDialog";
import { useCRMTasks, useCRMTaskCounts, useCRMTaskMutations, CRMTask } from "@/hooks/use-crm";
import { Plus, CheckCircle, Clock, AlertTriangle, Calendar, Phone, Mail, MessageSquare, Users, Trash2, Loader2 } from "lucide-react";
import { format, parseISO, isToday, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

export default function CRMTarefas() {
  const [period, setPeriod] = useState("today");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<CRMTask | null>(null);

  const { data: tasks, isLoading } = useCRMTasks({ period, status: period === "completed" ? "completed" : "pending" });
  const { data: counts } = useCRMTaskCounts();
  const { completeTask, deleteTask } = useCRMTaskMutations();

  const handleNewTask = () => {
    setEditingTask(null);
    setDialogOpen(true);
  };

  const handleEditTask = (task: CRMTask) => {
    setEditingTask(task);
    setDialogOpen(true);
  };

  const handleComplete = (id: string) => {
    completeTask.mutate(id);
  };

  const handleDelete = (id: string) => {
    if (confirm("Tem certeza que deseja excluir esta tarefa?")) {
      deleteTask.mutate(id);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "call": return <Phone className="h-4 w-4" />;
      case "email": return <Mail className="h-4 w-4" />;
      case "meeting": return <Users className="h-4 w-4" />;
      case "follow_up": return <MessageSquare className="h-4 w-4" />;
      default: return <CheckCircle className="h-4 w-4" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent": return "bg-red-100 text-red-700 border-red-200";
      case "high": return "bg-orange-100 text-orange-700 border-orange-200";
      case "medium": return "bg-yellow-100 text-yellow-700 border-yellow-200";
      default: return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  const priorityLabels: Record<string, string> = {
    urgent: "Urgente",
    high: "Alta",
    medium: "Média",
    low: "Baixa",
  };

  const typeLabels: Record<string, string> = {
    task: "Tarefa",
    call: "Ligação",
    email: "Email",
    meeting: "Reunião",
    follow_up: "Follow-up",
  };

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Tarefas</h1>
            <p className="text-muted-foreground">Central de tarefas e atividades</p>
          </div>
          <Button onClick={handleNewTask}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Tarefa
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <Card className={cn("cursor-pointer transition-colors", period === "today" && "ring-2 ring-primary")} onClick={() => setPeriod("today")}>
            <CardContent className="p-4 text-center">
              <Calendar className="h-5 w-5 mx-auto mb-2 text-primary" />
              <p className="text-2xl font-bold">{counts?.today || 0}</p>
              <p className="text-xs text-muted-foreground">Hoje</p>
            </CardContent>
          </Card>
          <Card className={cn("cursor-pointer transition-colors", period === "week" && "ring-2 ring-primary")} onClick={() => setPeriod("week")}>
            <CardContent className="p-4 text-center">
              <Clock className="h-5 w-5 mx-auto mb-2 text-blue-500" />
              <p className="text-2xl font-bold">{counts?.week || 0}</p>
              <p className="text-xs text-muted-foreground">Esta Semana</p>
            </CardContent>
          </Card>
          <Card className={cn("cursor-pointer transition-colors", period === "month" && "ring-2 ring-primary")} onClick={() => setPeriod("month")}>
            <CardContent className="p-4 text-center">
              <Calendar className="h-5 w-5 mx-auto mb-2 text-purple-500" />
              <p className="text-2xl font-bold">{counts?.month || 0}</p>
              <p className="text-xs text-muted-foreground">Este Mês</p>
            </CardContent>
          </Card>
          <Card className={cn("cursor-pointer transition-colors", period === "overdue" && "ring-2 ring-primary")} onClick={() => setPeriod("overdue")}>
            <CardContent className="p-4 text-center">
              <AlertTriangle className="h-5 w-5 mx-auto mb-2 text-red-500" />
              <p className="text-2xl font-bold">{counts?.overdue || 0}</p>
              <p className="text-xs text-muted-foreground">Atrasadas</p>
            </CardContent>
          </Card>
          <Card className={cn("cursor-pointer transition-colors", period === "pending" && "ring-2 ring-primary")} onClick={() => setPeriod("pending")}>
            <CardContent className="p-4 text-center">
              <Clock className="h-5 w-5 mx-auto mb-2 text-yellow-500" />
              <p className="text-2xl font-bold">{counts?.pending || 0}</p>
              <p className="text-xs text-muted-foreground">Pendentes</p>
            </CardContent>
          </Card>
          <Card className={cn("cursor-pointer transition-colors", period === "completed" && "ring-2 ring-primary")} onClick={() => setPeriod("completed")}>
            <CardContent className="p-4 text-center">
              <CheckCircle className="h-5 w-5 mx-auto mb-2 text-green-500" />
              <p className="text-2xl font-bold">{counts?.completed || 0}</p>
              <p className="text-xs text-muted-foreground">Concluídas</p>
            </CardContent>
          </Card>
        </div>

        {/* Task List */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : !tasks?.length ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">Nenhuma tarefa encontrada</h3>
                <p className="text-muted-foreground mb-4">
                  {period === "completed" ? "Nenhuma tarefa concluída" : "Você está em dia com suas tarefas!"}
                </p>
                <Button onClick={handleNewTask}>
                  <Plus className="h-4 w-4 mr-2" />
                  Criar Tarefa
                </Button>
              </div>
            ) : (
              <div className="divide-y">
                {tasks.map((task) => {
                  const isOverdue = task.due_date && isPast(parseISO(task.due_date)) && task.status === "pending";
                  const isDueToday = task.due_date && isToday(parseISO(task.due_date));

                    return (
                      <div 
                        key={task.id} 
                        className={cn(
                          "flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors",
                          isOverdue && task.status === "pending" && "bg-red-50 dark:bg-red-900/10",
                          task.status === "completed" && "bg-green-50 dark:bg-green-900/10"
                        )}
                      >
                        {/* Complete button */}
                        <button
                          onClick={() => task.status === "pending" && handleComplete(task.id)}
                          className={cn(
                            "w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                            task.status === "completed" 
                              ? "bg-green-500 border-green-500 text-white" 
                              : isOverdue 
                                ? "border-red-500 hover:border-red-600 hover:bg-red-50"
                                : "border-muted-foreground hover:border-primary hover:bg-primary/10"
                          )}
                        >
                          {task.status === "completed" && <CheckCircle className="h-4 w-4" />}
                        </button>

                      {/* Task info */}
                      <div 
                        className="flex-1 min-w-0 cursor-pointer" 
                        onClick={() => handleEditTask(task)}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-muted-foreground">
                            {getTypeIcon(task.type)}
                          </span>
                          <p className={cn(
                            "font-medium truncate",
                            task.status === "completed" && "line-through text-muted-foreground"
                          )}>
                            {task.title}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          {task.deal_title && (
                            <span className="truncate">{task.deal_title}</span>
                          )}
                          {task.company_name && (
                            <>
                              {task.deal_title && <span>•</span>}
                              <span className="truncate">{task.company_name}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Meta */}
                      <div className="flex items-center gap-3 shrink-0">
                        <Badge variant="outline" className={getPriorityColor(task.priority)}>
                          {priorityLabels[task.priority]}
                        </Badge>

                        {task.due_date && (
                          <span className={cn(
                            "text-sm",
                            isOverdue && "text-red-600 font-medium",
                            isDueToday && !isOverdue && "text-primary font-medium"
                          )}>
                            {format(parseISO(task.due_date), "dd/MM HH:mm", { locale: ptBR })}
                          </span>
                        )}

                        {task.assigned_to_name && (
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium">
                            {task.assigned_to_name.charAt(0).toUpperCase()}
                          </div>
                        )}

                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => handleDelete(task.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <TaskDialog
        task={editingTask}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </MainLayout>
  );
}
