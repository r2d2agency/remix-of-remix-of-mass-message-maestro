import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Plug,
  Users,
  MessageSquare,
  Send,
  Receipt,
  Settings,
  Zap,
  Building2,
} from "lucide-react";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Conexão", href: "/conexao", icon: Plug },
  { name: "Contatos", href: "/contatos", icon: Users },
  { name: "Mensagens", href: "/mensagens", icon: MessageSquare },
  { name: "Campanhas", href: "/campanhas", icon: Send },
  { name: "Cobrança", href: "/cobranca", icon: Receipt },
  { name: "Organizações", href: "/organizacoes", icon: Building2 },
  { name: "Configurações", href: "/configuracoes", icon: Settings },
];

export function Sidebar() {
  const location = useLocation();

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 bg-card border-r border-border shadow-card">
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 px-6 border-b border-border">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-primary">
            <Zap className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Blaster</h1>
            <p className="text-xs text-muted-foreground">Disparo em Massa</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className={cn("h-5 w-5", isActive && "text-primary")} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-border p-4">
          <div className="rounded-lg bg-accent/50 p-3">
            <p className="text-xs font-medium text-accent-foreground">
              Versão 1.0.0
            </p>
            <p className="text-xs text-muted-foreground">
              Evolution API conectada
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
