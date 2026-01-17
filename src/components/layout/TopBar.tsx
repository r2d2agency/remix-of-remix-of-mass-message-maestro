import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Clock, Sun, Sunset, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

function getGreeting(hour: number): { text: string; icon: typeof Sun } {
  if (hour >= 5 && hour < 12) {
    return { text: "Bom dia", icon: Sun };
  } else if (hour >= 12 && hour < 18) {
    return { text: "Boa tarde", icon: Sunset };
  } else {
    return { text: "Boa noite", icon: Moon };
  }
}

export function TopBar() {
  const { user } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const greeting = getGreeting(currentTime.getHours());
  const GreetingIcon = greeting.icon;
  const firstName = user?.name?.split(" ")[0] || "Usuário";

  return (
    <div className="hidden lg:flex fixed top-0 right-0 left-16 h-14 items-center justify-end gap-6 px-6 bg-background/80 backdrop-blur-sm border-b border-border/50 z-40">
      {/* Date and Time */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Clock className="h-4 w-4" />
        <span className="font-medium">
          {format(currentTime, "dd 'de' MMMM", { locale: ptBR })}
        </span>
        <span className="text-primary font-semibold">
          {format(currentTime, "HH:mm:ss")}
        </span>
      </div>

      {/* Divider */}
      <div className="h-6 w-px bg-border" />

      {/* Greeting */}
      <div className="flex items-center gap-2">
        <GreetingIcon className={cn(
          "h-5 w-5",
          greeting.text === "Bom dia" && "text-yellow-500",
          greeting.text === "Boa tarde" && "text-orange-500",
          greeting.text === "Boa noite" && "text-indigo-400"
        )} />
        <span className="text-sm">
          <span className="text-muted-foreground">{greeting.text},</span>
          <span className="font-semibold text-foreground ml-1">{firstName}</span>
        </span>
      </div>
    </div>
  );
}
