import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export interface GoogleCalendarStatus {
  connected: boolean;
  email?: string;
  name?: string;
  lastSync?: string;
  lastError?: string;
  tokenExpired?: boolean;
}

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  htmlLink?: string;
}

// Get connection status
export function useGoogleCalendarStatus() {
  return useQuery({
    queryKey: ["google-calendar-status"],
    queryFn: async () => {
      return api<GoogleCalendarStatus>("/api/google-calendar/status");
    },
  });
}

// Get auth URL to start OAuth flow
export function useGoogleCalendarAuth() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      return api<{ url: string }>("/api/google-calendar/auth-url");
    },
    onSuccess: (data) => {
      // Redirect to Google OAuth
      window.location.href = data.url;
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao conectar Google",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

// Disconnect Google Calendar
export function useGoogleCalendarDisconnect() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      return api<{ success: boolean }>("/api/google-calendar/disconnect", {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["google-calendar-status"] });
      toast({ title: "Conta Google desconectada" });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao desconectar",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

// Sync task to Google Calendar
export function useSyncTaskToGoogle() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (taskId: string) => {
      return api<{ success: boolean; eventId: string; htmlLink: string }>(
        `/api/google-calendar/sync-task/${taskId}`,
        { method: "POST" }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["google-calendar-status"] });
      queryClient.invalidateQueries({ queryKey: ["crm-tasks"] });
      toast({
        title: "Sincronizado com Google Calendar",
        description: "Evento adicionado ao seu calendário",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao sincronizar",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

// Create event directly
export function useCreateGoogleEvent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (event: {
      title: string;
      description?: string;
      startDateTime: string;
      endDateTime: string;
      location?: string;
      taskId?: string;
      dealId?: string;
    }) => {
      return api<{ success: boolean; eventId: string; htmlLink: string }>(
        "/api/google-calendar/events",
        { method: "POST", body: event }
      );
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["google-calendar-status"] });
      toast({
        title: "Evento criado no Google Calendar",
        description: data.htmlLink ? "Clique para ver o evento" : "Evento criado com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao criar evento",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

// List events
export function useGoogleCalendarEvents(timeMin?: string, timeMax?: string) {
  return useQuery({
    queryKey: ["google-calendar-events", timeMin, timeMax],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (timeMin) params.append("timeMin", timeMin);
      if (timeMax) params.append("timeMax", timeMax);
      return api<GoogleCalendarEvent[]>(
        `/api/google-calendar/events?${params.toString()}`
      );
    },
  });
}
