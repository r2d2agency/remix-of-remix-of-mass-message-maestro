import { Link, useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
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
  Shield,
  LogOut,
} from "lucide-react";
import { getAuthToken } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

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
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const [isSuperadmin, setIsSuperadmin] = useState(false);

  useEffect(() => {
    checkSuperadmin();
  }, []);

  const checkSuperadmin = async () => {
    try {
      const token = getAuthToken();
      if (!token) return;
      
      const response = await fetch(`${API_URL}/api/admin/check`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setIsSuperadmin(data.isSuperadmin);
      }
    } catch {
      setIsSuperadmin(false);
    }
  };

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 bg-card border-r border-border shadow-card">
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 px-6 border-b border-border">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-primary neon-glow">
            <Zap className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Whatsale</h1>
            <p className="text-xs text-muted-foreground">Disparo em Massa</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
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

          {/* Superadmin Link */}
          {isSuperadmin && (
            <Link
              to="/admin"
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 mt-4 border border-primary/30",
                location.pathname === "/admin"
                  ? "bg-primary/20 text-primary neon-glow"
                  : "text-primary hover:bg-primary/10"
              )}
            >
              <Shield className="h-5 w-5" />
              Superadmin
            </Link>
          )}
        </nav>

        {/* Footer */}
        <div className="border-t border-border p-4 space-y-3">
          {user && (
            <div className="rounded-lg bg-accent/50 p-3">
              <p className="text-xs font-medium text-accent-foreground truncate">
                {user.name || user.email}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {user.email}
              </p>
            </div>
          )}
          
          <button
            onClick={() => {
              logout();
              navigate('/login');
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10 transition-all duration-200"
          >
            <LogOut className="h-5 w-5" />
            Sair
          </button>
          
          <div className="text-center">
            <p className="text-xs text-muted-foreground">
              Versão 1.0.0
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}