import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useChat } from "@/hooks/use-chat";
import { toast } from "sonner";
import { Bell, X, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

interface SecretaryAlert {
  id: string;
  title: string;
  message: string | null;
  metadata: {
    conversation_id?: string;
    source?: string;
  };
  created_at: string;
}

export function GroupSecretaryPopup() {
  const { isAuthenticated } = useAuth();
  const { getAlerts, markAlertsRead } = useChat();
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<SecretaryAlert[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const lastCheckRef = useRef<string | null>(null);

  const checkForAlerts = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const allAlerts = await getAlerts();
      const secretaryAlerts = allAlerts.filter(
        (a) => (a.type === "group_secretary" || a.type === "task_reminder") && !a.is_read
      );

      // Show new ones
      const newAlerts = secretaryAlerts.filter(
        (a) =>
          !dismissed.has(a.id) &&
          (!lastCheckRef.current ||
            new Date(a.created_at) > new Date(lastCheckRef.current))
      );

      if (newAlerts.length > 0) {
        setAlerts((prev) => {
          const ids = new Set(prev.map((p) => p.id));
          const unique = newAlerts.filter((a) => !ids.has(a.id));
          return [...unique, ...prev].slice(0, 5);
        });

        // Play notification sound
        try {
          const audio = new Audio("/sounds/notification-chime.mp3");
          audio.volume = 0.5;
          audio.play().catch(() => {});
        } catch {}
      }

      lastCheckRef.current = new Date().toISOString();
    } catch {
      // Silent
    }
  }, [isAuthenticated, getAlerts, dismissed]);

  useEffect(() => {
    if (!isAuthenticated) return;
    checkForAlerts();
    const interval = setInterval(checkForAlerts, 10000);
    return () => clearInterval(interval);
  }, [isAuthenticated, checkForAlerts]);

  const dismissAlert = async (alertId: string) => {
    setDismissed((prev) => new Set([...prev, alertId]));
    setAlerts((prev) => prev.filter((a) => a.id !== alertId));
    try {
      await markAlertsRead([alertId]);
    } catch {}
  };

  const goToConversation = (alert: SecretaryAlert) => {
    if (alert.metadata?.conversation_id) {
      navigate(`/chat?conversation=${alert.metadata.conversation_id}`);
    }
    dismissAlert(alert.id);
  };

  if (alerts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className={cn(
            "bg-card border border-primary/30 rounded-lg shadow-2xl p-4 animate-in slide-in-from-right-5 fade-in duration-300",
            "flex flex-col gap-2"
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 text-primary">
              <Bell className="h-4 w-4 shrink-0 animate-pulse" />
              <span className="font-semibold text-sm line-clamp-2">
                {alert.title}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={() => dismissAlert(alert.id)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          {alert.message && (
            <p className="text-xs text-muted-foreground line-clamp-3 pl-6">
              {alert.message}
            </p>
          )}
          <div className="flex justify-end gap-2 mt-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => dismissAlert(alert.id)}
            >
              Dispensar
            </Button>
            {alert.metadata?.conversation_id && (
              <Button
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => goToConversation(alert)}
              >
                <MessageSquare className="h-3 w-3" />
                Ver conversa
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
