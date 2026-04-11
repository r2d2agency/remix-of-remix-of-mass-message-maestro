import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Meeting } from "@/hooks/use-meetings";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, isToday, isSameMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Clock } from "lucide-react";

interface Props {
  meetings: Meeting[];
  onMeetingClick: (meeting: Meeting) => void;
}

const STATUS_COLORS: Record<string, string> = {
  aguardando_transcricao: "bg-yellow-500",
  transcrevendo: "bg-blue-500",
  resumo_gerado: "bg-green-500",
  pendente_revisao: "bg-orange-500",
  finalizado: "bg-emerald-500",
  com_pendencias: "bg-red-500",
};

export function MeetingCalendarView({ meetings, onMeetingClick }: Props) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const days = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  // Pad start to align with weekday (Sun=0)
  const startPadding = useMemo(() => {
    const dayOfWeek = days[0].getDay();
    return dayOfWeek;
  }, [days]);

  const meetingsByDay = useMemo(() => {
    const map = new Map<string, Meeting[]>();
    meetings.forEach(m => {
      const key = format(new Date(m.scheduled_at), "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    });
    // Sort each day's meetings by time
    map.forEach(list => list.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()));
    return map;
  }, [meetings]);

  const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  return (
    <div className="space-y-4">
      {/* Month nav */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(prev => subMonths(prev, 1))}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h3 className="font-semibold text-lg capitalize">
          {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
        </h3>
        <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(prev => addMonths(prev, 1))}>
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
        {/* Header */}
        {weekDays.map(d => (
          <div key={d} className="bg-muted p-2 text-center text-xs font-medium text-muted-foreground">
            {d}
          </div>
        ))}

        {/* Empty cells for padding */}
        {Array.from({ length: startPadding }).map((_, i) => (
          <div key={`pad-${i}`} className="bg-card p-2 min-h-[80px]" />
        ))}

        {/* Day cells */}
        {days.map(day => {
          const key = format(day, "yyyy-MM-dd");
          const dayMeetings = meetingsByDay.get(key) || [];
          const today = isToday(day);

          return (
            <div
              key={key}
              className={`bg-card p-1.5 min-h-[80px] ${today ? "ring-2 ring-primary ring-inset" : ""}`}
            >
              <span className={`text-xs font-medium inline-block w-6 h-6 text-center leading-6 rounded-full ${today ? "bg-primary text-primary-foreground" : "text-foreground"}`}>
                {format(day, "d")}
              </span>
              <div className="space-y-0.5 mt-0.5">
                {dayMeetings.slice(0, 3).map(m => (
                  <button
                    key={m.id}
                    onClick={() => onMeetingClick(m)}
                    className="w-full text-left flex items-center gap-1 px-1 py-0.5 rounded text-[10px] hover:bg-muted transition-colors truncate"
                  >
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${STATUS_COLORS[m.status] || "bg-gray-400"}`} />
                    <span className="truncate">{format(new Date(m.scheduled_at), "HH:mm")} {m.title}</span>
                  </button>
                ))}
                {dayMeetings.length > 3 && (
                  <span className="text-[10px] text-muted-foreground px-1">+{dayMeetings.length - 3} mais</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Today's meetings list */}
      <Card className="p-4">
        <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          Reuniões de Hoje
        </h4>
        {(() => {
          const todayKey = format(new Date(), "yyyy-MM-dd");
          const todayMeetings = meetingsByDay.get(todayKey) || [];
          if (todayMeetings.length === 0) return <p className="text-sm text-muted-foreground italic">Nenhuma reunião agendada para hoje</p>;
          return (
            <div className="space-y-2">
              {todayMeetings.map(m => (
                <button
                  key={m.id}
                  onClick={() => onMeetingClick(m)}
                  className="w-full text-left flex items-center gap-3 p-2.5 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${STATUS_COLORS[m.status] || "bg-gray-400"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{m.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(m.scheduled_at), "HH:mm")}
                      {m.duration_minutes ? ` · ${m.duration_minutes}min` : ""}
                      {m.lawyer_name ? ` · ${m.lawyer_name}` : ""}
                    </p>
                  </div>
                  {m.meeting_link && (
                    <Badge variant="outline" className="text-[10px] shrink-0">Com link</Badge>
                  )}
                </button>
              ))}
            </div>
          );
        })()}
      </Card>
    </div>
  );
}
