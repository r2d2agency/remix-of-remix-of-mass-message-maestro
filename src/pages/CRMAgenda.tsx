import { useState, useMemo } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar } from "@/components/ui/calendar";
import { TaskDialog } from "@/components/crm/TaskDialog";
import { useCRMTasks, useCRMTaskMutations, CRMTask } from "@/hooks/use-crm";
import { useAllTaskCards, TaskCard } from "@/hooks/use-task-boards";
import { useGoogleCalendarStatus, useGoogleCalendarEvents, GoogleCalendarEvent } from "@/hooks/use-google-calendar";
import { 
  Plus, 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon,
  Phone, 
  Mail, 
  Users, 
  MessageSquare, 
  CheckCircle,
  Clock,
  Building2,
  Kanban,
  Video,
  ExternalLink
} from "lucide-react";
import { 
  format, 
  parseISO, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameDay, 
  addMonths, 
  subMonths,
  isToday,
  isPast,
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

type ViewMode = "month" | "week" | "day";

export default function CRMAgenda() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<CRMTask | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // Fetch all tasks for the calendar
  const { data: allTasks, isLoading } = useCRMTasks({ period: "all" });
  const { completeTask } = useCRMTaskMutations();
  const { data: allTaskCards } = useAllTaskCards();

  // Merge task_cards (from Kanban) into CRM tasks for the calendar
  const mergedTasks = useMemo(() => {
    const crmTasks = allTasks || [];
    const taskCards = (allTaskCards || []).filter(tc => tc.due_date && tc.status !== 'archived');
    // Convert task_cards to CRM task-like objects for display
    const convertedCards: CRMTask[] = taskCards.map(tc => ({
      id: `tc_${tc.id}`,
      title: tc.title,
      description: tc.description,
      type: 'task' as const,
      priority: tc.priority,
      due_date: tc.due_date,
      status: tc.status === 'completed' ? 'completed' as const : 'pending' as const,
      assigned_to: tc.assigned_to,
      assigned_to_name: tc.assigned_to_name,
      created_by: tc.created_by,
      created_by_name: tc.created_by_name,
      deal_id: tc.deal_id,
      deal_title: tc.deal_title,
      company_id: tc.company_id,
      company_name: tc.company_name,
      created_at: tc.created_at,
      completed_at: tc.completed_at,
    }));
    // Deduplicate by title+due_date to avoid showing CRM task + its synced task_card
    const seen = new Set(crmTasks.map(t => `${t.title}|${t.due_date?.slice(0,10)}`));
    const uniqueCards = convertedCards.filter(c => !seen.has(`${c.title}|${c.due_date?.slice(0,10)}`));
    return [...crmTasks, ...uniqueCards];
  }, [allTasks, allTaskCards]);

  // Fetch Google Calendar status and events
  const { data: googleStatus } = useGoogleCalendarStatus();
  
  // Calculate date range for Google Calendar events based on view
  const googleDateRange = useMemo(() => {
    if (viewMode === "month") {
      const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 0 });
      const end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 0 });
      return { timeMin: start.toISOString(), timeMax: end.toISOString() };
    } else if (viewMode === "week") {
      const start = startOfWeek(currentDate, { weekStartsOn: 0 });
      const end = endOfWeek(currentDate, { weekStartsOn: 0 });
      return { timeMin: start.toISOString(), timeMax: end.toISOString() };
    } else {
      const start = new Date(currentDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(currentDate);
      end.setHours(23, 59, 59, 999);
      return { timeMin: start.toISOString(), timeMax: end.toISOString() };
    }
  }, [currentDate, viewMode]);

  const { data: googleEvents = [] } = useGoogleCalendarEvents(
    googleStatus?.connected ? googleDateRange.timeMin : undefined,
    googleStatus?.connected ? googleDateRange.timeMax : undefined
  );

  // Group tasks by date
  const tasksByDate = useMemo(() => {
    if (!allTasks) return new Map<string, CRMTask[]>();
    
    const map = new Map<string, CRMTask[]>();
    allTasks.forEach((task) => {
      if (task.due_date) {
        const dateKey = format(parseISO(task.due_date), "yyyy-MM-dd");
        const existing = map.get(dateKey) || [];
        map.set(dateKey, [...existing, task]);
      }
    });
    return map;
  }, [allTasks]);

  // Group Google Calendar events by date
  const googleEventsByDate = useMemo(() => {
    const map = new Map<string, GoogleCalendarEvent[]>();
    googleEvents.forEach((event) => {
      if (event.start?.dateTime) {
        const dateKey = format(parseISO(event.start.dateTime), "yyyy-MM-dd");
        const existing = map.get(dateKey) || [];
        map.set(dateKey, [...existing, event]);
      }
    });
    return map;
  }, [googleEvents]);

  // Get days for current view
  const viewDays = useMemo(() => {
    if (viewMode === "month") {
      const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 0 });
      const end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 0 });
      return eachDayOfInterval({ start, end });
    } else if (viewMode === "week") {
      const start = startOfWeek(currentDate, { weekStartsOn: 0 });
      const end = endOfWeek(currentDate, { weekStartsOn: 0 });
      return eachDayOfInterval({ start, end });
    } else {
      return [currentDate];
    }
  }, [currentDate, viewMode]);

  const handlePrevious = () => {
    if (viewMode === "month") {
      setCurrentDate(subMonths(currentDate, 1));
    } else if (viewMode === "week") {
      setCurrentDate(subWeeks(currentDate, 1));
    } else {
      setCurrentDate(new Date(currentDate.getTime() - 86400000));
    }
  };

  const handleNext = () => {
    if (viewMode === "month") {
      setCurrentDate(addMonths(currentDate, 1));
    } else if (viewMode === "week") {
      setCurrentDate(addWeeks(currentDate, 1));
    } else {
      setCurrentDate(new Date(currentDate.getTime() + 86400000));
    }
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const handleNewTask = (date?: Date) => {
    setEditingTask(null);
    setSelectedDate(date || null);
    setDialogOpen(true);
  };

  const handleEditTask = (task: CRMTask) => {
    setEditingTask(task);
    setDialogOpen(true);
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "call": return <Phone className="h-3 w-3" />;
      case "email": return <Mail className="h-3 w-3" />;
      case "meeting": return <Users className="h-3 w-3" />;
      case "follow_up": return <MessageSquare className="h-3 w-3" />;
      default: return <CheckCircle className="h-3 w-3" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "call": return "bg-blue-100 text-blue-700 border-blue-200";
      case "email": return "bg-purple-100 text-purple-700 border-purple-200";
      case "meeting": return "bg-green-100 text-green-700 border-green-200";
      case "follow_up": return "bg-orange-100 text-orange-700 border-orange-200";
      default: return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  const typeLabels: Record<string, string> = {
    task: "Tarefa",
    call: "Ligação",
    email: "Email",
    meeting: "Reunião",
    follow_up: "Follow-up",
  };

  const getViewTitle = () => {
    if (viewMode === "month") {
      return format(currentDate, "MMMM yyyy", { locale: ptBR });
    } else if (viewMode === "week") {
      const start = startOfWeek(currentDate, { weekStartsOn: 0 });
      const end = endOfWeek(currentDate, { weekStartsOn: 0 });
      return `${format(start, "dd MMM", { locale: ptBR })} - ${format(end, "dd MMM yyyy", { locale: ptBR })}`;
    } else {
      return format(currentDate, "EEEE, dd 'de' MMMM", { locale: ptBR });
    }
  };

  // Tasks for selected day (sidebar)
  const selectedDayTasks = useMemo(() => {
    if (!selectedDate) return [];
    const dateKey = format(selectedDate, "yyyy-MM-dd");
    return tasksByDate.get(dateKey) || [];
  }, [selectedDate, tasksByDate]);

  // Google events for selected day
  const selectedDayGoogleEvents = useMemo(() => {
    if (!selectedDate) return [];
    const dateKey = format(selectedDate, "yyyy-MM-dd");
    return googleEventsByDate.get(dateKey) || [];
  }, [selectedDate, googleEventsByDate]);

  return (
    <MainLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex flex-col gap-4 p-4 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold">Agenda</h1>
              
              {/* View Mode */}
              <Select value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">Mês</SelectItem>
                  <SelectItem value="week">Semana</SelectItem>
                  <SelectItem value="day">Dia</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handlePrevious}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={handleToday}>
                Hoje
              </Button>
              <Button variant="outline" size="sm" onClick={handleNext}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              
              <span className="font-medium min-w-[200px] text-center capitalize">
                {getViewTitle()}
              </span>

              <Button onClick={() => handleNewTask()}>
                <Plus className="h-4 w-4 mr-2" />
                Novo Compromisso
              </Button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Calendar Grid */}
          <div className="flex-1 overflow-auto p-4">
            {viewMode === "month" && (
              <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
                {/* Week day headers */}
                {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((day) => (
                  <div key={day} className="bg-muted p-2 text-center text-sm font-medium">
                    {day}
                  </div>
                ))}

                {/* Calendar cells */}
                {viewDays.map((day) => {
                  const dateKey = format(day, "yyyy-MM-dd");
                  const dayTasks = tasksByDate.get(dateKey) || [];
                  const dayGoogleEvents = googleEventsByDate.get(dateKey) || [];
                  const isCurrentMonth = day.getMonth() === currentDate.getMonth();
                  const isSelected = selectedDate && isSameDay(day, selectedDate);
                  const totalItems = dayTasks.length + dayGoogleEvents.length;

                  return (
                    <div
                      key={dateKey}
                      className={cn(
                        "min-h-[120px] bg-background p-1 cursor-pointer transition-colors hover:bg-muted/50",
                        !isCurrentMonth && "bg-muted/30",
                        isToday(day) && "ring-2 ring-primary ring-inset",
                        isSelected && "bg-primary/10"
                      )}
                      onClick={() => setSelectedDate(day)}
                      onDoubleClick={() => handleNewTask(day)}
                    >
                      <div className={cn(
                        "text-sm font-medium mb-1",
                        !isCurrentMonth && "text-muted-foreground",
                        isToday(day) && "text-primary"
                      )}>
                        {format(day, "d")}
                      </div>
                      <div className="space-y-1">
                        {/* CRM Tasks */}
                        {dayTasks.slice(0, 2).map((task) => (
                          <button
                            key={task.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditTask(task);
                            }}
                            className={cn(
                              "w-full text-left text-xs px-1.5 py-0.5 rounded truncate flex items-center gap-1",
                              getTypeColor(task.type),
                              task.status === "completed" && "opacity-50 line-through"
                            )}
                          >
                            {getTypeIcon(task.type)}
                            <span className="truncate">{task.title}</span>
                          </button>
                        ))}
                        {/* Google Calendar Events */}
                        {dayGoogleEvents.slice(0, Math.max(0, 3 - dayTasks.length)).map((event) => (
                          <button
                            key={event.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (event.htmlLink) window.open(event.htmlLink, "_blank");
                            }}
                            className="w-full text-left text-xs px-1.5 py-0.5 rounded truncate flex items-center gap-1 bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800"
                          >
                            <Video className="h-3 w-3" />
                            <span className="truncate">{event.summary}</span>
                          </button>
                        ))}
                        {totalItems > 3 && (
                          <div className="text-xs text-muted-foreground pl-1">
                            +{totalItems - 3} mais
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {viewMode === "week" && (
              <div className="grid grid-cols-7 gap-2">
                {viewDays.map((day) => {
                  const dateKey = format(day, "yyyy-MM-dd");
                  const dayTasks = tasksByDate.get(dateKey) || [];
                  const dayGoogleEvents = googleEventsByDate.get(dateKey) || [];
                  const isSelected = selectedDate && isSameDay(day, selectedDate);

                  return (
                    <Card
                      key={dateKey}
                      className={cn(
                        "p-3 cursor-pointer transition-colors hover:bg-muted/50 min-h-[400px]",
                        isToday(day) && "ring-2 ring-primary",
                        isSelected && "bg-primary/10"
                      )}
                      onClick={() => setSelectedDate(day)}
                      onDoubleClick={() => handleNewTask(day)}
                    >
                      <div className={cn(
                        "text-center mb-3",
                        isToday(day) && "text-primary"
                      )}>
                        <div className="text-xs text-muted-foreground uppercase">
                          {format(day, "EEE", { locale: ptBR })}
                        </div>
                        <div className="text-2xl font-bold">{format(day, "d")}</div>
                      </div>
                      <div className="space-y-2">
                        {/* CRM Tasks */}
                        {dayTasks.map((task) => (
                          <button
                            key={task.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditTask(task);
                            }}
                            className={cn(
                              "w-full text-left text-xs p-2 rounded border",
                              getTypeColor(task.type),
                              task.status === "completed" && "opacity-50"
                            )}
                          >
                            <div className="flex items-center gap-1 mb-1">
                              {getTypeIcon(task.type)}
                              <span className="font-medium truncate">{task.title}</span>
                            </div>
                            {task.due_date && (
                              <div className="text-[10px] opacity-75">
                                {format(parseISO(task.due_date), "HH:mm")}
                              </div>
                            )}
                          </button>
                        ))}
                        {/* Google Calendar Events */}
                        {dayGoogleEvents.map((event) => (
                          <button
                            key={event.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (event.htmlLink) window.open(event.htmlLink, "_blank");
                            }}
                            className="w-full text-left text-xs p-2 rounded border bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800"
                          >
                            <div className="flex items-center gap-1 mb-1">
                              <Video className="h-3 w-3" />
                              <span className="font-medium truncate">{event.summary}</span>
                            </div>
                            {event.start?.dateTime && (
                              <div className="text-[10px] opacity-75">
                                {format(parseISO(event.start.dateTime), "HH:mm")}
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}

            {viewMode === "day" && (
              <Card className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold">
                    {format(currentDate, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                  </h2>
                  <Button variant="outline" size="sm" onClick={() => handleNewTask(currentDate)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar
                  </Button>
                </div>

                <ScrollArea className="h-[calc(100vh-280px)]">
                  <div className="space-y-3">
                    {(() => {
                      const dateKey = format(currentDate, "yyyy-MM-dd");
                      const dayTasks = tasksByDate.get(dateKey) || [];
                      const dayGoogleEvents = googleEventsByDate.get(dateKey) || [];
                      const hasAny = dayTasks.length > 0 || dayGoogleEvents.length > 0;
                      
                      if (!hasAny) {
                        return (
                          <div className="text-center py-12 text-muted-foreground">
                            <CalendarIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <p>Nenhum compromisso para este dia</p>
                            <Button 
                              variant="outline" 
                              className="mt-4"
                              onClick={() => handleNewTask(currentDate)}
                            >
                              <Plus className="h-4 w-4 mr-2" />
                              Agendar compromisso
                            </Button>
                          </div>
                        );
                      }

                      return (
                        <>
                          {/* CRM Tasks */}
                          {dayTasks.map((task) => (
                            <Card
                              key={task.id}
                              className={cn(
                                "p-4 cursor-pointer hover:bg-muted/50 transition-colors",
                                task.status === "completed" && "opacity-60"
                              )}
                              onClick={() => handleEditTask(task)}
                            >
                              <div className="flex items-start gap-4">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (task.status !== "completed") {
                                      completeTask.mutate(task.id);
                                    }
                                  }}
                                  className={cn(
                                    "w-6 h-6 rounded-full border-2 flex items-center justify-center mt-0.5 flex-shrink-0",
                                    task.status === "completed"
                                      ? "bg-green-500 border-green-500 text-white"
                                      : "border-muted-foreground hover:border-primary"
                                  )}
                                >
                                  {task.status === "completed" && <CheckCircle className="h-4 w-4" />}
                                </button>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <Badge className={getTypeColor(task.type)}>
                                      {getTypeIcon(task.type)}
                                      <span className="ml-1">{typeLabels[task.type]}</span>
                                    </Badge>
                                    {task.due_date && (
                                      <span className="text-sm text-muted-foreground flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        {format(parseISO(task.due_date), "HH:mm")}
                                      </span>
                                    )}
                                  </div>
                                  <h4 className={cn(
                                    "font-medium",
                                    task.status === "completed" && "line-through"
                                  )}>
                                    {task.title}
                                  </h4>
                                  {task.description && (
                                    <p className="text-sm text-muted-foreground mt-1">
                                      {task.description}
                                    </p>
                                  )}
                                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                                    {task.deal_title && (
                                      <span className="flex items-center gap-1">
                                        <Kanban className="h-3 w-3" />
                                        {task.deal_title}
                                      </span>
                                    )}
                                    {task.company_name && (
                                      <span className="flex items-center gap-1">
                                        <Building2 className="h-3 w-3" />
                                        {task.company_name}
                                      </span>
                                    )}
                                    {task.assigned_to_name && (
                                      <span className="flex items-center gap-1">
                                        <Users className="h-3 w-3" />
                                        {task.assigned_to_name}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </Card>
                          ))}

                          {/* Google Calendar Events */}
                          {dayGoogleEvents.map((event) => (
                            <Card
                              key={event.id}
                              className="p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                              onClick={() => event.htmlLink && window.open(event.htmlLink, "_blank")}
                            >
                              <div className="flex items-start gap-4">
                                <div className="w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center mt-0.5 flex-shrink-0">
                                  <Video className="h-3 w-3" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <Badge className="bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300">
                                      <Video className="h-3 w-3 mr-1" />
                                      Google Calendar
                                    </Badge>
                                    {event.start?.dateTime && (
                                      <span className="text-sm text-muted-foreground flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        {format(parseISO(event.start.dateTime), "HH:mm")}
                                        {event.end?.dateTime && ` - ${format(parseISO(event.end.dateTime), "HH:mm")}`}
                                      </span>
                                    )}
                                  </div>
                                  <h4 className="font-medium">{event.summary}</h4>
                                  {event.description && (
                                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                      {event.description}
                                    </p>
                                  )}
                                  {event.htmlLink && (
                                    <div className="flex items-center gap-1 mt-2 text-xs text-primary">
                                      <ExternalLink className="h-3 w-3" />
                                      Abrir no Google Calendar
                                    </div>
                                  )}
                                </div>
                              </div>
                            </Card>
                          ))}
                        </>
                      );
                    })()}
                  </div>
                </ScrollArea>
              </Card>
            )}
          </div>

          {/* Sidebar - Selected Day Details */}
          {selectedDate && viewMode !== "day" && (
            <div className="w-80 border-l bg-muted/30 p-4 overflow-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">
                  {format(selectedDate, "dd 'de' MMMM", { locale: ptBR })}
                </h3>
                <Button variant="ghost" size="sm" onClick={() => handleNewTask(selectedDate)}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {selectedDayTasks.length === 0 && selectedDayGoogleEvents.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CalendarIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Nenhum compromisso</p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-2"
                    onClick={() => handleNewTask(selectedDate)}
                  >
                    Agendar
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* CRM Tasks */}
                  {selectedDayTasks.map((task) => (
                    <Card
                      key={task.id}
                      className={cn(
                        "p-3 cursor-pointer hover:bg-muted/50 transition-colors",
                        task.status === "completed" && "opacity-60"
                      )}
                      onClick={() => handleEditTask(task)}
                    >
                      <div className="flex items-start gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (task.status !== "completed") {
                              completeTask.mutate(task.id);
                            }
                          }}
                          className={cn(
                            "w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 flex-shrink-0",
                            task.status === "completed"
                              ? "bg-green-500 border-green-500 text-white"
                              : "border-muted-foreground hover:border-primary"
                          )}
                        >
                          {task.status === "completed" && <CheckCircle className="h-3 w-3" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1 mb-1">
                            <span className={cn("p-0.5 rounded", getTypeColor(task.type))}>
                              {getTypeIcon(task.type)}
                            </span>
                            {task.due_date && (
                              <span className="text-xs text-muted-foreground">
                                {format(parseISO(task.due_date), "HH:mm")}
                              </span>
                            )}
                          </div>
                          <h4 className={cn(
                            "text-sm font-medium truncate",
                            task.status === "completed" && "line-through"
                          )}>
                            {task.title}
                          </h4>
                          {task.deal_title && (
                            <p className="text-xs text-muted-foreground truncate mt-1">
                              {task.deal_title}
                            </p>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}

                  {/* Google Calendar Events */}
                  {selectedDayGoogleEvents.map((event) => (
                    <Card
                      key={event.id}
                      className="p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => event.htmlLink && window.open(event.htmlLink, "_blank")}
                    >
                      <div className="flex items-start gap-2">
                        <div className="w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center mt-0.5 flex-shrink-0">
                          <Video className="h-3 w-3" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1 mb-1">
                            {event.start?.dateTime && (
                              <span className="text-xs text-muted-foreground">
                                {format(parseISO(event.start.dateTime), "HH:mm")}
                              </span>
                            )}
                          </div>
                          <h4 className="text-sm font-medium truncate">
                            {event.summary}
                          </h4>
                          <p className="text-xs text-red-600 dark:text-red-400 mt-1 flex items-center gap-1">
                            <ExternalLink className="h-3 w-3" />
                            Google Calendar
                          </p>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Task Dialog */}
      <TaskDialog
        task={editingTask}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultDate={selectedDate}
      />
    </MainLayout>
  );
}
