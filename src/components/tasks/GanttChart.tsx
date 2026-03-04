import { useMemo, useState } from "react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TaskCard, useAllTaskCards, useTaskBoards } from "@/hooks/use-task-boards";
import { format, parseISO, differenceInDays, startOfDay, addDays, isWithinInterval, isBefore, isAfter } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, AlertTriangle } from "lucide-react";

const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#94a3b8',
};

export function GanttChart() {
  const { data: allCards } = useAllTaskCards();
  const { data: boards } = useTaskBoards();
  const [dayWidth, setDayWidth] = useState(40);
  const [offsetDays, setOffsetDays] = useState(0);

  const cardsWithDates = useMemo(() => {
    if (!allCards) return [];
    return allCards
      .filter(c => c.due_date || c.created_at)
      .sort((a, b) => {
        const aDate = a.due_date || a.created_at;
        const bDate = b.due_date || b.created_at;
        return aDate.localeCompare(bDate);
      });
  }, [allCards]);

  const { startDate, endDate, totalDays, days } = useMemo(() => {
    if (cardsWithDates.length === 0) {
      const today = startOfDay(new Date());
      const days = Array.from({ length: 30 }, (_, i) => addDays(today, i));
      return { startDate: today, endDate: addDays(today, 30), totalDays: 30, days };
    }

    const dates = cardsWithDates.map(c => {
      const created = startOfDay(parseISO(c.created_at));
      const due = c.due_date ? startOfDay(parseISO(c.due_date)) : created;
      return { start: created, end: due };
    });

    let minDate = dates[0].start;
    let maxDate = dates[0].end;
    dates.forEach(d => {
      if (isBefore(d.start, minDate)) minDate = d.start;
      if (isAfter(d.end, maxDate)) maxDate = d.end;
    });

    // Add padding
    const start = addDays(minDate, -3 + offsetDays);
    const end = addDays(maxDate, 7 + offsetDays);
    const total = differenceInDays(end, start) + 1;
    const daysList = Array.from({ length: total }, (_, i) => addDays(start, i));
    return { startDate: start, endDate: end, totalDays: total, days: daysList };
  }, [cardsWithDates, offsetDays]);

  const boardMap = useMemo(() => {
    const map: Record<string, TaskCard['board_id']> = {};
    boards?.forEach(b => { map[b.id] = b as any; });
    return map;
  }, [boards]);

  const getBarStyle = (card: TaskCard) => {
    const created = startOfDay(parseISO(card.created_at));
    const due = card.due_date ? startOfDay(parseISO(card.due_date)) : created;
    const barStart = Math.max(0, differenceInDays(created, startDate));
    const barEnd = Math.max(barStart + 1, differenceInDays(due, startDate) + 1);
    const width = Math.max(1, barEnd - barStart);
    return {
      left: barStart * dayWidth,
      width: width * dayWidth - 4,
    };
  };

  const today = startOfDay(new Date());
  const todayOffset = differenceInDays(today, startDate);

  if (cardsWithDates.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <p>Nenhuma tarefa com prazo definido para exibir no Gantt</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setOffsetDays(o => o - 7)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => setOffsetDays(0)}>Hoje</Button>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setOffsetDays(o => o + 7)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-1 ml-4">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDayWidth(w => Math.max(20, w - 10))}>
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDayWidth(w => Math.min(80, w + 10))}>
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
        </div>
        <Badge variant="secondary" className="ml-auto text-xs">{cardsWithDates.length} tarefas</Badge>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <ScrollArea className="w-full">
          <div className="flex">
            {/* Task names sidebar */}
            <div className="w-[200px] min-w-[200px] border-r bg-muted/30 z-10 sticky left-0">
              {/* Header */}
              <div className="h-12 border-b px-3 flex items-center font-medium text-sm bg-muted/50">
                Tarefa
              </div>
              {/* Task rows */}
              {cardsWithDates.map(card => (
                <div key={card.id} className="h-10 border-b px-3 flex items-center gap-2 text-xs">
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: PRIORITY_COLORS[card.priority] }}
                  />
                  <span className={cn("truncate flex-1", card.status === 'completed' && "line-through text-muted-foreground")}>
                    {card.title}
                  </span>
                </div>
              ))}
            </div>

            {/* Timeline */}
            <div style={{ width: totalDays * dayWidth }} className="relative">
              {/* Date headers */}
              <div className="h-12 border-b flex bg-muted/50 sticky top-0 z-10">
                {days.map((day, i) => {
                  const isToday = differenceInDays(day, today) === 0;
                  const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                  return (
                    <div
                      key={i}
                      className={cn(
                        "flex flex-col items-center justify-center text-[10px] border-r shrink-0",
                        isToday && "bg-primary/10 font-bold",
                        isWeekend && "bg-muted/80"
                      )}
                      style={{ width: dayWidth }}
                    >
                      <span className="text-muted-foreground">{format(day, "EEE", { locale: ptBR })}</span>
                      <span className={cn(isToday && "text-primary")}>{format(day, "dd")}</span>
                    </div>
                  );
                })}
              </div>

              {/* Today line */}
              {todayOffset >= 0 && todayOffset < totalDays && (
                <div
                  className="absolute top-12 bottom-0 w-0.5 bg-primary/60 z-20"
                  style={{ left: todayOffset * dayWidth + dayWidth / 2 }}
                />
              )}

              {/* Task bars */}
              {cardsWithDates.map(card => {
                const bar = getBarStyle(card);
                const isOverdue = card.due_date && isBefore(parseISO(card.due_date), today) && card.status !== 'completed';
                return (
                  <div key={card.id} className="h-10 border-b relative">
                    {/* Weekend shading */}
                    {days.map((day, i) => {
                      if (day.getDay() === 0 || day.getDay() === 6) {
                        return <div key={i} className="absolute top-0 bottom-0 bg-muted/40" style={{ left: i * dayWidth, width: dayWidth }} />;
                      }
                      return null;
                    })}
                    <Popover>
                      <PopoverTrigger asChild>
                        <div
                          className={cn(
                            "absolute top-1.5 h-7 rounded-md cursor-pointer transition-all hover:shadow-lg hover:scale-y-110",
                            card.status === 'completed' ? "opacity-60" : "",
                            isOverdue ? "animate-pulse" : ""
                          )}
                          style={{
                            left: bar.left + 2,
                            width: Math.max(bar.width, dayWidth - 4),
                            backgroundColor: isOverdue ? '#ef4444' : PRIORITY_COLORS[card.priority],
                            opacity: card.status === 'completed' ? 0.4 : 0.85,
                          }}
                        >
                          <span className="text-[10px] text-white px-1.5 truncate block leading-7 font-medium">
                            {card.title}
                          </span>
                        </div>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-3 space-y-2 text-sm">
                        <div className="font-medium">{card.title}</div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>Criado: {format(parseISO(card.created_at), "dd/MM/yyyy", { locale: ptBR })}</span>
                        </div>
                        {card.due_date && (
                          <div className={cn("flex items-center gap-1 text-xs", isOverdue && "text-destructive font-medium")}>
                            {isOverdue && <AlertTriangle className="h-3 w-3" />}
                            Prazo: {format(parseISO(card.due_date), "dd/MM/yyyy", { locale: ptBR })}
                          </div>
                        )}
                        {card.assigned_to_name && (
                          <div className="text-xs text-muted-foreground">👤 {card.assigned_to_name}</div>
                        )}
                        <Badge variant={card.status === 'completed' ? "default" : "secondary"} className="text-[10px]">
                          {card.status === 'completed' ? 'Concluída' : 'Em aberto'}
                        </Badge>
                      </PopoverContent>
                    </Popover>
                  </div>
                );
              })}
            </div>
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>
    </div>
  );
}
