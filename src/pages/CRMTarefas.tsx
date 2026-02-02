import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TaskDialog } from "@/components/crm/TaskDialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCRMTasks, useCRMTaskCounts, useCRMTaskMutations, CRMTask } from "@/hooks/use-crm";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganizations } from "@/hooks/use-organizations";
import { Plus, CheckCircle, Clock, AlertTriangle, Calendar as CalendarIcon, Phone, Mail, MessageSquare, Users, Trash2, Loader2, Filter, X } from "lucide-react";
import { format, parseISO, isToday, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface OrgMember {
  id: string;
  user_id: string;
  name: string;
  email: string;
  role: string;
}

export default function CRMTarefas() {
  const { user } = useAuth();
  const { getMembers } = useOrganizations();
  
  const [period, setPeriod] = useState("today");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<CRMTask | null>(null);
  
  // Advanced filters
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [selectedUser, setSelectedUser] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);

  // Check if user is admin/superadmin
  const isAdmin = user?.role && ['owner', 'admin', 'manager'].includes(user.role);
  const isSuperadmin = (user as any)?.is_superadmin === true;
  const canViewAll = isAdmin || isSuperadmin;

  // Load org members for admin filter
  useEffect(() => {
    if (canViewAll && user?.organization_id) {
      getMembers(user.organization_id).then(members => {
        setOrgMembers(members);
      });
    }
  }, [canViewAll, user?.organization_id, getMembers]);

  // Build filters
  const taskFilters = {
    period: startDate && endDate ? undefined : period,
    status: period === "completed" ? "completed" : "pending",
    assigned_to: canViewAll ? selectedUser : undefined,
    start_date: startDate ? format(startDate, "yyyy-MM-dd") : undefined,
    end_date: endDate ? format(endDate, "yyyy-MM-dd") : undefined,
    view_all: canViewAll && selectedUser === "all",
  };

  const { data: tasks, isLoading } = useCRMTasks(taskFilters);
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

  const clearDateFilter = () => {
    setStartDate(undefined);
    setEndDate(undefined);
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

  const hasActiveFilters = startDate || endDate || (canViewAll && selectedUser !== "all");

  return (
    <MainLayout>
      <div className="p-6 space-y-6 min-w-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold">Tarefas</h1>
            <p className="text-muted-foreground">Central de tarefas e atividades</p>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant={showFilters ? "secondary" : "outline"} 
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="relative"
            >
              <Filter className="h-4 w-4 mr-2" />
              Filtros
              {hasActiveFilters && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full" />
              )}
            </Button>
            <Button onClick={handleNewTask}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Tarefa
            </Button>
          </div>
        </div>

        {/* Advanced Filters Panel */}
        {showFilters && (
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-4">
                {/* Date Range Filter */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Período:</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className={cn(!startDate && "text-muted-foreground")}>
                        <CalendarIcon className="h-4 w-4 mr-2" />
                        {startDate ? format(startDate, "dd/MM/yyyy", { locale: ptBR }) : "Data inicial"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={startDate}
                        onSelect={setStartDate}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                  <span className="text-sm text-muted-foreground">até</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className={cn(!endDate && "text-muted-foreground")}>
                        <CalendarIcon className="h-4 w-4 mr-2" />
                        {endDate ? format(endDate, "dd/MM/yyyy", { locale: ptBR }) : "Data final"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={endDate}
                        onSelect={setEndDate}
                        disabled={(date) => startDate ? date < startDate : false}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                  {(startDate || endDate) && (
                    <Button variant="ghost" size="icon" onClick={clearDateFilter} className="h-8 w-8">
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                {/* User Filter (only for admins) */}
                {canViewAll && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Funcionário:</span>
                    <Select value={selectedUser} onValueChange={setSelectedUser}>
                      <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Selecionar funcionário" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os funcionários</SelectItem>
                        {orgMembers.map((member) => (
                          <SelectItem key={member.user_id} value={member.user_id}>
                            {member.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {hasActiveFilters && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => {
                      clearDateFilter();
                      setSelectedUser("all");
                    }}
                    className="text-muted-foreground"
                  >
                    Limpar filtros
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <Card className={cn("cursor-pointer transition-colors", period === "today" && !startDate && "ring-2 ring-primary")} onClick={() => { setPeriod("today"); clearDateFilter(); }}>
            <CardContent className="p-4 text-center">
              <CalendarIcon className="h-5 w-5 mx-auto mb-2 text-primary" />
              <p className="text-2xl font-bold">{counts?.today || 0}</p>
              <p className="text-xs text-muted-foreground">Hoje</p>
            </CardContent>
          </Card>
          <Card className={cn("cursor-pointer transition-colors", period === "week" && !startDate && "ring-2 ring-primary")} onClick={() => { setPeriod("week"); clearDateFilter(); }}>
            <CardContent className="p-4 text-center">
              <Clock className="h-5 w-5 mx-auto mb-2 text-blue-500" />
              <p className="text-2xl font-bold">{counts?.week || 0}</p>
              <p className="text-xs text-muted-foreground">Esta Semana</p>
            </CardContent>
          </Card>
          <Card className={cn("cursor-pointer transition-colors", period === "month" && !startDate && "ring-2 ring-primary")} onClick={() => { setPeriod("month"); clearDateFilter(); }}>
            <CardContent className="p-4 text-center">
              <CalendarIcon className="h-5 w-5 mx-auto mb-2 text-purple-500" />
              <p className="text-2xl font-bold">{counts?.month || 0}</p>
              <p className="text-xs text-muted-foreground">Este Mês</p>
            </CardContent>
          </Card>
          <Card className={cn("cursor-pointer transition-colors", period === "overdue" && !startDate && "ring-2 ring-primary")} onClick={() => { setPeriod("overdue"); clearDateFilter(); }}>
            <CardContent className="p-4 text-center">
              <AlertTriangle className="h-5 w-5 mx-auto mb-2 text-red-500" />
              <p className="text-2xl font-bold">{counts?.overdue || 0}</p>
              <p className="text-xs text-muted-foreground">Atrasadas</p>
            </CardContent>
          </Card>
          <Card className={cn("cursor-pointer transition-colors", period === "pending" && !startDate && "ring-2 ring-primary")} onClick={() => { setPeriod("pending"); clearDateFilter(); }}>
            <CardContent className="p-4 text-center">
              <Clock className="h-5 w-5 mx-auto mb-2 text-yellow-500" />
              <p className="text-2xl font-bold">{counts?.pending || 0}</p>
              <p className="text-xs text-muted-foreground">Pendentes</p>
            </CardContent>
          </Card>
          <Card className={cn("cursor-pointer transition-colors", period === "completed" && !startDate && "ring-2 ring-primary")} onClick={() => { setPeriod("completed"); clearDateFilter(); }}>
            <CardContent className="p-4 text-center">
              <CheckCircle className="h-5 w-5 mx-auto mb-2 text-green-500" />
              <p className="text-2xl font-bold">{counts?.completed || 0}</p>
              <p className="text-xs text-muted-foreground">Concluídas</p>
            </CardContent>
          </Card>
        </div>

        {/* Active filter indicator */}
        {(startDate && endDate) && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarIcon className="h-4 w-4" />
            <span>
              Exibindo tarefas de {format(startDate, "dd/MM/yyyy", { locale: ptBR })} até {format(endDate, "dd/MM/yyyy", { locale: ptBR })}
            </span>
            {selectedUser !== "all" && (
              <span>
                • {orgMembers.find(m => m.user_id === selectedUser)?.name || "Funcionário selecionado"}
              </span>
            )}
          </div>
        )}

        {/* Task List */}
        <Card className="min-w-0 overflow-hidden">
          <CardContent className="p-0 overflow-x-auto">
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
              <div className="divide-y min-w-[600px]">
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
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium" title={task.assigned_to_name}>
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