import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useGoogleCalendarStatus, useGoogleCalendarEvents, GoogleCalendarEvent } from "@/hooks/use-google-calendar";
import { Calendar, Clock, Video, ExternalLink, MapPin, Loader2 } from "lucide-react";
import { format, parseISO, isToday, isTomorrow, differenceInMinutes, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

function getEventTimeLabel(event: GoogleCalendarEvent) {
  if (!event.start?.dateTime) return "";
  const start = parseISO(event.start.dateTime);
  const end = event.end?.dateTime ? parseISO(event.end.dateTime) : null;
  const duration = end ? differenceInMinutes(end, start) : null;

  let time = format(start, "HH:mm");
  if (end) time += ` - ${format(end, "HH:mm")}`;
  if (duration && duration >= 60) {
    const h = Math.floor(duration / 60);
    const m = duration % 60;
    time += ` (${h}h${m > 0 ? `${m}min` : ""})`;
  } else if (duration) {
    time += ` (${duration}min)`;
  }
  return time;
}

function getDayLabel(dateStr: string) {
  const date = parseISO(dateStr);
  if (isToday(date)) return "Hoje";
  if (isTomorrow(date)) return "Amanhã";
  return format(date, "EEEE, dd/MM", { locale: ptBR });
}

function EventItem({ event }: { event: GoogleCalendarEvent }) {
  const isNow = useMemo(() => {
    if (!event.start?.dateTime || !event.end?.dateTime) return false;
    const now = new Date();
    return now >= parseISO(event.start.dateTime) && now <= parseISO(event.end.dateTime);
  }, [event]);

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg border transition-colors hover:bg-muted/50 cursor-pointer group",
        isNow && "border-primary/50 bg-primary/5"
      )}
      onClick={() => event.htmlLink && window.open(event.htmlLink, "_blank")}
    >
      <div 
        className={cn(
          "w-1 self-stretch rounded-full flex-shrink-0",
          isNow ? "bg-primary" : "bg-muted-foreground/30"
        )} 
        style={event.calendarColor && !isNow ? { backgroundColor: event.calendarColor } : undefined}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-sm truncate">{event.summary || "Sem título"}</p>
          {isNow && (
            <Badge variant="default" className="text-[10px] px-1.5 py-0 h-4 bg-primary">
              Agora
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {getEventTimeLabel(event)}
          </span>
          {event.calendarName && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              <span className="truncate">{event.calendarName}</span>
            </span>
          )}
          {event.location && (
            <span className="flex items-center gap-1 truncate">
              <MapPin className="h-3 w-3" />
              <span className="truncate">{event.location}</span>
            </span>
          )}
        </div>
      </div>
      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-1" />
    </div>
  );
}

export function GoogleCalendarWidget() {
  const { data: status, isLoading: statusLoading } = useGoogleCalendarStatus();

  // Fetch next 7 days of events
  const dateRange = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const end = addDays(now, 7);
    return { timeMin: now.toISOString(), timeMax: end.toISOString() };
  }, []);

  const { data: events = [], isLoading: eventsLoading } = useGoogleCalendarEvents(
    status?.connected ? dateRange.timeMin : undefined,
    status?.connected ? dateRange.timeMax : undefined
  );

  // Group events by day
  const groupedEvents = useMemo(() => {
    const groups: { label: string; events: GoogleCalendarEvent[] }[] = [];
    const dayMap = new Map<string, GoogleCalendarEvent[]>();

    events.forEach((event) => {
      if (!event.start?.dateTime) return;
      const dayKey = format(parseISO(event.start.dateTime), "yyyy-MM-dd");
      const existing = dayMap.get(dayKey) || [];
      dayMap.set(dayKey, [...existing, event]);
    });

    // Sort by date
    const sortedKeys = Array.from(dayMap.keys()).sort();
    sortedKeys.forEach((key) => {
      groups.push({
        label: getDayLabel(`${key}T00:00:00`),
        events: dayMap.get(key)!,
      });
    });

    return groups;
  }, [events]);

  // Don't render if not connected
  if (statusLoading) return null;
  if (!status?.connected) return null;

  const isLoading = eventsLoading;
  const totalEvents = events.length;

  return (
    <Card className="animate-fade-in shadow-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-5 w-5 text-primary" />
              Google Calendar
            </CardTitle>
            <CardDescription>
              Próximos 7 dias • {status.email}
            </CardDescription>
          </div>
          {totalEvents > 0 && (
            <Badge variant="secondary" className="text-xs">
              {totalEvents} evento{totalEvents !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : totalEvents === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nenhum compromisso nos próximos 7 dias</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-4">
              {groupedEvents.map((group) => (
                <div key={group.label}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 capitalize">
                    {group.label}
                  </p>
                  <div className="space-y-2">
                    {group.events.map((event) => (
                      <EventItem key={event.id} event={event} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
        <Button
          variant="outline"
          size="sm"
          className="w-full mt-3"
          onClick={() => window.open("https://calendar.google.com", "_blank")}
        >
          <ExternalLink className="h-3.5 w-3.5 mr-2" />
          Abrir Google Calendar
        </Button>
      </CardContent>
    </Card>
  );
}
