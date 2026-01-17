import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  Building2,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Plug,
  Receipt,
  Send,
  Settings,
  Shield,
  Users,
  Zap,
  Bell,
  Lock,
} from "lucide-react";
import { API_URL, getAuthToken } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface NavItem {
  name: string;
  href: string;
  icon: any;
}

interface NavSection {
  title: string;
  icon: any;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: "Disparos",
    icon: Send,
    items: [
      { name: "Listas", href: "/contatos", icon: Users },
      { name: "Mensagens", href: "/mensagens", icon: MessageSquare },
      { name: "Campanhas", href: "/campanhas", icon: Send },
      { name: "Ajustes", href: "/configuracoes", icon: Settings },
    ],
  },
  {
    title: "Configurações",
    icon: Settings,
    items: [
      { name: "Cobrança", href: "/cobranca", icon: Receipt },
      { name: "Conexões", href: "/conexao", icon: Plug },
      { name: "Organizações", href: "/organizacoes", icon: Building2 },
    ],
  },
];

interface SidebarContentProps {
  isExpanded: boolean;
  isSuperadmin: boolean;
  onNavigate?: () => void;
}

function SidebarContentComponent({ isExpanded, isSuperadmin, onNavigate }: SidebarContentProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const [openSections, setOpenSections] = useState<string[]>(["Disparos", "Configurações"]);

  const handleLogout = () => {
    logout();
    navigate("/login");
    onNavigate?.();
  };

  const toggleSection = (title: string) => {
    setOpenSections(prev =>
      prev.includes(title)
        ? prev.filter(s => s !== title)
        : [...prev, title]
    );
  };

  const isActiveRoute = (href: string) => location.pathname === href;

  const isSectionActive = (section: NavSection) =>
    section.items.some(item => isActiveRoute(item.href));

  const renderNavItem = (item: NavItem, indent = false) => {
    const isActive = isActiveRoute(item.href);
    
    const linkContent = (
      <Link
        key={item.name}
        to={item.href}
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
          indent && isExpanded && "ml-4",
          isExpanded ? "" : "justify-center",
          isActive
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        <item.icon className={cn("h-4 w-4 shrink-0", isActive && "text-primary")} />
        {isExpanded && <span className="whitespace-nowrap">{item.name}</span>}
      </Link>
    );

    if (!isExpanded) {
      return (
        <Tooltip key={item.name} delayDuration={0}>
          <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
          <TooltipContent side="right" className="font-medium">
            {item.name}
          </TooltipContent>
        </Tooltip>
      );
    }

    return linkContent;
  };

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div
        className={cn(
          "flex h-16 items-center gap-3 border-b border-border transition-all duration-300",
          isExpanded ? "px-6" : "px-3 justify-center"
        )}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-primary neon-glow shrink-0">
          <Zap className="h-5 w-5 text-primary-foreground" />
        </div>
        {isExpanded && (
          <div className="overflow-hidden">
            <h1 className="text-lg font-bold text-foreground whitespace-nowrap">Whatsale</h1>
            <p className="text-xs text-muted-foreground whitespace-nowrap">Disparo em Massa</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-2 py-4 overflow-y-auto scrollbar-none hover:scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
        {/* Dashboard - always visible */}
        {renderNavItem({ name: "Dashboard", href: "/", icon: LayoutDashboard })}

        {/* Sections */}
        {navSections.map((section) => {
          const isOpen = openSections.includes(section.title);
          const sectionActive = isSectionActive(section);

          if (!isExpanded) {
            // When collapsed, show items directly with tooltips
            return (
              <div key={section.title} className="space-y-1 pt-2">
                {section.items.map(item => renderNavItem(item))}
              </div>
            );
          }

          return (
            <Collapsible
              key={section.title}
              open={isOpen}
              onOpenChange={() => toggleSection(section.title)}
              className="pt-2"
            >
              <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted transition-colors">
                <div className="flex items-center gap-3">
                  <section.icon className={cn("h-4 w-4", sectionActive && "text-primary")} />
                  <span>{section.title}</span>
                </div>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-muted-foreground transition-transform",
                    isOpen && "rotate-180"
                  )}
                />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-1 pt-1">
                {section.items.map(item => renderNavItem(item, true))}
              </CollapsibleContent>
            </Collapsible>
          );
        })}

        {/* Superadmin Link */}
        {isSuperadmin && (
          <>
            {!isExpanded ? (
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <Link
                    to="/admin"
                    onClick={onNavigate}
                    className={cn(
                      "flex items-center justify-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 mt-4 border border-primary/30",
                      location.pathname === "/admin"
                        ? "bg-primary/20 text-primary neon-glow"
                        : "text-primary hover:bg-primary/10"
                    )}
                  >
                    <Shield className="h-5 w-5 shrink-0" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right" className="font-medium">
                  Superadmin
                </TooltipContent>
              </Tooltip>
            ) : (
              <Link
                to="/admin"
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 mt-4 border border-primary/30",
                  location.pathname === "/admin"
                    ? "bg-primary/20 text-primary neon-glow"
                    : "text-primary hover:bg-primary/10"
                )}
              >
                <Shield className="h-5 w-5 shrink-0" />
                <span className="whitespace-nowrap">Superadmin</span>
              </Link>
            )}
          </>
        )}
      </nav>

      {/* Footer */}
      <div
        className={cn(
          "border-t border-border p-3 space-y-2",
          !isExpanded && "flex flex-col items-center"
        )}
      >
        {user && isExpanded && (
          <div className="rounded-lg bg-accent/50 p-3">
            <p className="text-xs font-medium text-accent-foreground truncate">
              {user.name || user.email}
            </p>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>
        )}

        {!isExpanded ? (
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <button
                onClick={handleLogout}
                className="flex items-center justify-center rounded-lg p-2.5 text-destructive hover:bg-destructive/10 transition-all duration-200"
              >
                <LogOut className="h-5 w-5 shrink-0" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="font-medium">
              Sair
            </TooltipContent>
          </Tooltip>
        ) : (
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10 transition-all duration-200"
          >
            <LogOut className="h-5 w-5 shrink-0" />
            <span className="whitespace-nowrap">Sair</span>
          </button>
        )}

        {isExpanded && (
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Versão 1.0.0</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function Sidebar() {
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    checkSuperadmin();
  }, []);

  const checkSuperadmin = async () => {
    try {
      const token = getAuthToken();
      if (!token) return;

      const response = await fetch(`${API_URL}/api/admin/check`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setIsSuperadmin(data.isSuperadmin);
      }
    } catch {
      setIsSuperadmin(false);
    }
  };

  const collapsedWidth = "w-16";
  const expandedWidth = "w-64";

  return (
    <>
      {/* Mobile Menu Button */}
      <div className="fixed top-4 left-4 z-50 lg:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="bg-card border-border shadow-lg">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0 bg-card border-border">
            <SidebarContentComponent
              isExpanded={true}
              isSuperadmin={isSuperadmin}
              onNavigate={() => setMobileOpen(false)}
            />
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 h-screen bg-card border-r border-border shadow-card transition-all duration-300 ease-in-out hidden lg:block",
          isHovered ? expandedWidth : collapsedWidth
        )}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <SidebarContentComponent isExpanded={isHovered} isSuperadmin={isSuperadmin} />
      </aside>
    </>
  );
}

export const SIDEBAR_COLLAPSED_WIDTH = 64;
export const SIDEBAR_EXPANDED_WIDTH = 256;
