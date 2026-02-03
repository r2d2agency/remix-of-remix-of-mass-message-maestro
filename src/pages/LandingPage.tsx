import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBranding } from "@/hooks/use-branding";
import { API_URL } from "@/lib/api";
import { toast } from "sonner";
import {
  MessageSquare,
  Users,
  Zap,
  Send,
  BarChart3,
  Clock,
  Shield,
  Headphones,
  Bot,
  Workflow,
  CheckCircle2,
  ArrowRight,
  Menu,
  X,
  Loader2,
  Building2,
  Brain,
  Webhook,
  Target,
  Calendar,
  CreditCard,
  TrendingUp,
  Star,
  Sparkles,
  LineChart,
  FileText,
  Globe,
  Mail,
  Bell,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import systemPreviewChat from "@/assets/system-preview-chat.png";
import systemPreviewCRM from "@/assets/system-preview-crm.png";
import systemPreviewFlows from "@/assets/system-preview-flows.png";

const systemScreenshots = [
  {
    id: "chat",
    title: "Chat Unificado",
    description: "Gerencie todas as conversas em um único lugar",
    image: systemPreviewChat,
  },
  {
    id: "crm",
    title: "CRM Kanban",
    description: "Visualize seu funil de vendas completo",
    image: systemPreviewCRM,
  },
  {
    id: "flows",
    title: "Construtor de Fluxos",
    description: "Crie automações visuais com drag-and-drop",
    image: systemPreviewFlows,
  },
];

// Feature categories for better organization
const featureCategories = [
  {
    category: "Atendimento",
    icon: Headphones,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    features: [
      {
        icon: MessageSquare,
        title: "Chat Multicanal",
        description: "Gerencie conversas de múltiplos WhatsApps em uma interface unificada com histórico completo.",
      },
      {
        icon: Users,
        title: "Multi-Atendentes",
        description: "Distribua conversas entre sua equipe com filas inteligentes e transferências.",
      },
      {
        icon: Building2,
        title: "Departamentos",
        description: "Organize atendentes por setores com horários e regras específicas.",
      },
      {
        icon: Bell,
        title: "Notificações",
        description: "Alertas em tempo real por som, push e indicadores visuais.",
      },
    ],
  },
  {
    category: "Automação",
    icon: Zap,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
    features: [
      {
        icon: Bot,
        title: "Chatbots Visuais",
        description: "Crie fluxos de atendimento com menu, coleta de dados e condições.",
      },
      {
        icon: Brain,
        title: "Agentes de IA",
        description: "Assistentes virtuais que respondem com base na sua base de conhecimento.",
      },
      {
        icon: Workflow,
        title: "Fluxos Automáticos",
        description: "Automações por gatilhos, webhooks e eventos do sistema.",
      },
      {
        icon: Clock,
        title: "Agendamentos",
        description: "Mensagens programadas para datas específicas ou recorrentes.",
      },
    ],
  },
  {
    category: "Marketing",
    icon: Send,
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    features: [
      {
        icon: Send,
        title: "Campanhas em Massa",
        description: "Dispare mensagens para milhares de contatos com personalização.",
      },
      {
        icon: RefreshCw,
        title: "Sequências Nurturing",
        description: "Séries automáticas de mensagens para nutrição de leads.",
      },
      {
        icon: Target,
        title: "Segmentação",
        description: "Filtre contatos por tags, comportamento e dados do CRM.",
      },
      {
        icon: Mail,
        title: "E-mail Marketing",
        description: "Dispare e-mails integrados com templates personalizados.",
      },
    ],
  },
  {
    category: "CRM & Vendas",
    icon: TrendingUp,
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
    features: [
      {
        icon: Building2,
        title: "Kanban de Vendas",
        description: "Gerencie negociações em funis visuais com drag-and-drop.",
      },
      {
        icon: FileText,
        title: "Gestão de Leads",
        description: "Cadastre prospects, empresas e acompanhe o ciclo de vendas.",
      },
      {
        icon: Calendar,
        title: "Agenda Integrada",
        description: "Reuniões, tarefas e follow-ups com Google Calendar.",
      },
    ],
  },
  {
    category: "Inteligência",
    icon: Brain,
    color: "text-rose-500",
    bgColor: "bg-rose-500/10",
    features: [
      {
        icon: Target,
        title: "Lead Scoring",
        description: "Pontuação automática de leads (Frio, Morno, Quente) por IA.",
      },
      {
        icon: LineChart,
        title: "Análise Preditiva",
        description: "Probabilidade de fechamento e risco de churn por negociação.",
      },
      {
        icon: BarChart3,
        title: "Revenue Intelligence",
        description: "Previsões de receita e análise de pipeline velocity.",
      },
      {
        icon: TrendingUp,
        title: "Relatórios Avançados",
        description: "Dashboards de performance, conversão e gargalos.",
      },
    ],
  },
  {
    category: "Integrações",
    icon: Globe,
    color: "text-cyan-500",
    bgColor: "bg-cyan-500/10",
    features: [
      {
        icon: Webhook,
        title: "Webhooks",
        description: "Receba leads de Meta Ads, Zapier, Make e qualquer fonte.",
      },
      {
        icon: FileText,
        title: "Formulários Externos",
        description: "Landing pages com formulários integrados ao CRM.",
      },
      {
        icon: Users,
        title: "Distribuição de Leads",
        description: "Round-robin automático entre vendedores.",
      },
      {
        icon: Globe,
        title: "API Completa",
        description: "Integre com qualquer sistema externo.",
      },
    ],
  },
];

// Pricing plans
const pricingPlans = [
  {
    name: "Starter",
    description: "Para pequenos negócios começando no WhatsApp Business",
    price: "R$ 249",
    period: "/mês",
    popular: false,
    cta: "Começar Grátis",
    features: [
      { text: "1 conexão WhatsApp", included: true },
      { text: "2 usuários", included: true },
      { text: "Chat unificado", included: true },
      { text: "Respostas rápidas", included: true },
      { text: "Chatbots básicos", included: true },
      { text: "Webhooks e integrações", included: true },
      { text: "500 mensagens/mês", included: true },
      { text: "CRM Kanban básico", included: true },
      { text: "Campanhas em massa", included: false },
      { text: "Agentes de IA", included: false },
      { text: "Lead Scoring", included: false },
    ],
    color: "border-border",
  },
  {
    name: "Professional",
    description: "Para equipes de vendas que precisam escalar",
    price: "R$ 480",
    period: "/mês",
    popular: true,
    cta: "Testar 3 Dias Grátis",
    features: [
      { text: "3 conexões WhatsApp", included: true },
      { text: "6 usuários", included: true },
      { text: "Tudo do Starter +", included: true },
      { text: "CRM Kanban completo", included: true },
      { text: "Campanhas em massa", included: true },
      { text: "Agendamentos", included: true },
      { text: "Departamentos", included: true },
      { text: "Webhooks e integrações", included: true },
      { text: "2.000 mensagens/mês", included: true },
      { text: "Agentes de IA", included: false },
      { text: "Lead Scoring", included: false },
    ],
    color: "border-primary ring-2 ring-primary/20",
  },
  {
    name: "Business",
    description: "Para operações avançadas com IA e integrações",
    price: "R$ 750",
    period: "/mês",
    popular: false,
    cta: "Testar 3 Dias Grátis",
    features: [
      { text: "6 conexões WhatsApp", included: true },
      { text: "12 usuários", included: true },
      { text: "Tudo do Professional +", included: true },
      { text: "Agentes de IA ilimitados", included: true },
      { text: "Lead Scoring automático", included: true },
      { text: "Sequências Nurturing", included: true },
      { text: "Webhooks e APIs avançadas", included: true },
      { text: "5.000 mensagens/mês", included: true },
      { text: "Análise Preditiva", included: false },
      { text: "Revenue Intelligence", included: false },
      { text: "Suporte prioritário", included: false },
    ],
    color: "border-border",
  },
  {
    name: "Enterprise",
    description: "Para grandes operações com recursos premium",
    price: "Sob consulta",
    period: "",
    popular: false,
    cta: "Falar com Vendas",
    features: [
      { text: "WhatsApps ilimitados", included: true },
      { text: "Usuários ilimitados", included: true },
      { text: "Tudo do Business +", included: true },
      { text: "Análise Preditiva (IA)", included: true },
      { text: "Revenue Intelligence", included: true },
      { text: "Webhooks e APIs sem limite", included: true },
      { text: "Mensagens ilimitadas", included: true },
      { text: "Suporte prioritário 24/7", included: true },
      { text: "Onboarding dedicado", included: true },
      { text: "Integrações customizadas", included: true },
      { text: "SLA garantido", included: true },
    ],
    color: "border-border bg-gradient-to-br from-background to-muted/50",
  },
];

const stats = [
  { value: "50k+", label: "Mensagens/dia processadas" },
  { value: "99.9%", label: "Uptime garantido" },
  { value: "500+", label: "Empresas ativas" },
  { value: "<2s", label: "Tempo de resposta" },
];

export default function LandingPage() {
  const { branding } = useBranding();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeScreen, setActiveScreen] = useState("chat");
  const [activeCategory, setActiveCategory] = useState("Atendimento");
  
  // Pre-register form state
  const [showPreRegister, setShowPreRegister] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    whatsapp: "",
  });

  const handlePreRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim() || !formData.email.trim() || !formData.whatsapp.trim()) {
      toast.error("Por favor, preencha todos os campos");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      toast.error("Por favor, insira um email válido");
      return;
    }

    const phone = formData.whatsapp.replace(/\D/g, "");
    if (phone.length < 10) {
      toast.error("Por favor, insira um WhatsApp válido");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/api/public/pre-register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name.trim(),
          email: formData.email.trim(),
          whatsapp: phone,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Erro ao enviar cadastro");
      }

      toast.success("Cadastro recebido! Entraremos em contato em breve.");
      setShowPreRegister(false);
      setFormData({ name: "", email: "", whatsapp: "" });
    } catch (error: any) {
      toast.error(error.message || "Erro ao enviar cadastro");
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeFeatures = featureCategories.find(c => c.category === activeCategory)?.features || [];

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              {branding.logo_topbar ? (
                <img
                  src={branding.logo_topbar}
                  alt={branding.company_name || "Logo"}
                  className="h-8 object-contain"
                />
              ) : (
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                    <MessageSquare className="h-5 w-5 text-primary-foreground" />
                  </div>
                  <span className="font-bold text-xl">
                    {branding.company_name || "Whatsale"}
                  </span>
                </div>
              )}
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-6">
              <a href="#funcionalidades" className="text-sm text-muted-foreground hover:text-foreground transition">
                Funcionalidades
              </a>
              <a href="#precos" className="text-sm text-muted-foreground hover:text-foreground transition">
                Preços
              </a>
              <Link to="/login">
                <Button variant="ghost" size="sm">
                  Entrar
                </Button>
              </Link>
              <Button size="sm" className="gap-2" onClick={() => setShowPreRegister(true)}>
                Testar Grátis
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Mobile Menu Button */}
            <button
              className="md:hidden p-2"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </button>
          </div>

          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <div className="md:hidden py-4 border-t">
              <div className="flex flex-col gap-4">
                <a href="#funcionalidades" className="text-sm text-muted-foreground hover:text-foreground" onClick={() => setMobileMenuOpen(false)}>
                  Funcionalidades
                </a>
                <a href="#precos" className="text-sm text-muted-foreground hover:text-foreground" onClick={() => setMobileMenuOpen(false)}>
                  Preços
                </a>
                <div className="flex gap-2 pt-2">
                  <Link to="/login" className="flex-1">
                    <Button variant="outline" className="w-full">Entrar</Button>
                  </Link>
                  <Button className="flex-1" onClick={() => { setMobileMenuOpen(false); setShowPreRegister(true); }}>
                    Testar Grátis
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-4xl mx-auto">
            <Badge className="mb-6 px-4 py-1.5" variant="secondary">
              <Sparkles className="h-3 w-3 mr-1" />
              Plataforma completa com IA integrada
            </Badge>
            
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
              Transforme seu WhatsApp em uma{" "}
              <span className="text-primary">máquina de vendas</span>
            </h1>
            
            <p className="text-lg sm:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Automatize atendimentos, dispare campanhas, gerencie seu CRM e feche mais vendas 
              com inteligência artificial integrada.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                size="lg" 
                className="gap-2 px-8 h-12 text-base w-full sm:w-auto"
                onClick={() => setShowPreRegister(true)}
              >
                Testar 3 Dias Grátis
                <ArrowRight className="h-5 w-5" />
              </Button>
              <a href="#precos">
                <Button 
                  size="lg" 
                  variant="outline"
                  className="gap-2 px-8 h-12 text-base w-full sm:w-auto"
                >
                  Ver Planos
                </Button>
              </a>
            </div>

            <p className="text-sm text-muted-foreground mt-4">
              Sem cartão de crédito • Cancele quando quiser
            </p>
          </div>

          {/* Stats Bar */}
          <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
            {stats.map((stat, index) => (
              <div key={index} className="text-center p-4">
                <div className="text-2xl md:text-3xl font-bold text-primary">{stat.value}</div>
                <div className="text-xs md:text-sm text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Hero Image/Preview with Tabs */}
          <div className="mt-16 relative">
            <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent z-10 pointer-events-none" />
            
            {/* Screenshot Tabs */}
            <div className="flex justify-center gap-4 mb-6">
              {systemScreenshots.map((screen) => (
                <button
                  key={screen.id}
                  onClick={() => setActiveScreen(screen.id)}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                    activeScreen === screen.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  {screen.title}
                </button>
              ))}
            </div>

            <div className="rounded-xl border shadow-2xl bg-card overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/30">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500" />
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                </div>
                <div className="flex-1 text-center text-xs text-muted-foreground">
                  {branding.company_name || "Whatsale"} - {systemScreenshots.find(s => s.id === activeScreen)?.title}
                </div>
              </div>
              {systemScreenshots.map((screen) => (
                <img 
                  key={screen.id}
                  src={screen.image} 
                  alt={screen.description}
                  className={cn(
                    "w-full h-auto transition-opacity duration-300",
                    activeScreen === screen.id ? "block" : "hidden"
                  )}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features Section - Tabbed */}
      <section id="funcionalidades" className="py-20 px-4 sm:px-6 lg:px-8 bg-muted/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <Badge variant="outline" className="mb-4">+30 Funcionalidades</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Tudo que você precisa em um só lugar
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Da automação de atendimento à inteligência de vendas, cobrimos todo o ciclo do cliente.
            </p>
          </div>

          {/* Category Tabs */}
          <div className="flex flex-wrap justify-center gap-2 mb-10">
            {featureCategories.map((cat) => (
              <button
                key={cat.category}
                onClick={() => setActiveCategory(cat.category)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all",
                  activeCategory === cat.category
                    ? `${cat.bgColor} ${cat.color} ring-2 ring-current/20`
                    : "bg-background border text-muted-foreground hover:text-foreground"
                )}
              >
                <cat.icon className="h-4 w-4" />
                {cat.category}
              </button>
            ))}
          </div>

          {/* Features Grid */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {activeFeatures.map((feature, index) => (
              <Card key={index} className="group hover:shadow-lg transition-all duration-300 hover:-translate-y-1 bg-background">
                <CardContent className="p-5">
                  <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center mb-3",
                    featureCategories.find(c => c.category === activeCategory)?.bgColor
                  )}>
                    <feature.icon className={cn(
                      "h-5 w-5",
                      featureCategories.find(c => c.category === activeCategory)?.color
                    )} />
                  </div>
                  <h3 className="font-semibold mb-1">{feature.title}</h3>
                  <p className="text-muted-foreground text-sm">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* All Features Summary */}
          <div className="mt-16 grid md:grid-cols-3 gap-6">
            {featureCategories.slice(0, 6).map((cat, index) => (
              <div key={index} className="flex items-start gap-3 p-4 rounded-lg bg-background border">
                <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0", cat.bgColor)}>
                  <cat.icon className={cn("h-5 w-5", cat.color)} />
                </div>
                <div>
                  <h4 className="font-medium mb-1">{cat.category}</h4>
                  <p className="text-sm text-muted-foreground">
                    {cat.features.map(f => f.title).join(", ")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="precos" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <Badge variant="outline" className="mb-4">Preços</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Planos para cada momento do seu negócio
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Comece pequeno e escale conforme cresce. Todos os planos incluem 3 dias de teste grátis.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {pricingPlans.map((plan, index) => (
              <Card key={index} className={cn("relative flex flex-col", plan.color)}>
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="gap-1 px-3 py-1">
                      <Star className="h-3 w-3 fill-current" />
                      Mais Popular
                    </Badge>
                  </div>
                )}
                <CardHeader className="pb-4">
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  <CardDescription className="min-h-[40px]">{plan.description}</CardDescription>
                  <div className="pt-2">
                    <span className="text-3xl font-bold">{plan.price}</span>
                    <span className="text-muted-foreground">{plan.period}</span>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col">
                  <ul className="space-y-2 mb-6 flex-1">
                    {plan.features.map((feature, fIndex) => (
                      <li key={fIndex} className="flex items-start gap-2 text-sm">
                        {feature.included ? (
                          <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                        ) : (
                          <X className="h-4 w-4 text-muted-foreground/40 flex-shrink-0 mt-0.5" />
                        )}
                        <span className={feature.included ? "" : "text-muted-foreground/60"}>
                          {feature.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <Button 
                    className="w-full" 
                    variant={plan.popular ? "default" : "outline"}
                    onClick={() => setShowPreRegister(true)}
                  >
                    {plan.cta}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Enterprise CTA */}
          <div className="mt-12 text-center">
            <p className="text-muted-foreground mb-4">
              Precisa de algo personalizado? Oferecemos planos customizados para grandes operações.
            </p>
            <Button variant="link" className="gap-2" onClick={() => setShowPreRegister(true)}>
              Falar com nossa equipe comercial
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* Social Proof / Trust Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-muted/30">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-12">
            Por que centenas de empresas confiam em nós?
          </h2>
          
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="p-6">
              <Shield className="h-8 w-8 mx-auto text-primary mb-3" />
              <h3 className="font-semibold mb-1">Segurança</h3>
              <p className="text-sm text-muted-foreground">Dados criptografados e backup automático</p>
            </Card>
            <Card className="p-6">
              <Zap className="h-8 w-8 mx-auto text-primary mb-3" />
              <h3 className="font-semibold mb-1">Performance</h3>
              <p className="text-sm text-muted-foreground">Infraestrutura escalável e rápida</p>
            </Card>
            <Card className="p-6">
              <Headphones className="h-8 w-8 mx-auto text-primary mb-3" />
              <h3 className="font-semibold mb-1">Suporte</h3>
              <p className="text-sm text-muted-foreground">Equipe técnica especializada</p>
            </Card>
            <Card className="p-6">
              <RefreshCw className="h-8 w-8 mx-auto text-primary mb-3" />
              <h3 className="font-semibold mb-1">Atualizações</h3>
              <p className="text-sm text-muted-foreground">Novos recursos toda semana</p>
            </Card>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-primary text-primary-foreground">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Pronto para transformar seu atendimento?
          </h2>
          <p className="text-lg opacity-90 mb-8">
            Junte-se a mais de 500 empresas que já escalam vendas com nossa plataforma.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              size="lg" 
              variant="secondary" 
              className="gap-2 px-8 h-12 text-base w-full sm:w-auto"
              onClick={() => setShowPreRegister(true)}
            >
              Começar Teste Grátis
              <ArrowRight className="h-5 w-5" />
            </Button>
            <Link to="/login">
              <Button size="lg" variant="ghost" className="gap-2 px-8 h-12 text-base w-full sm:w-auto border-2 border-white/40 text-white hover:bg-white/10 hover:text-white">
                Já tenho conta
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 sm:px-6 lg:px-8 border-t">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              {branding.logo_topbar ? (
                <img
                  src={branding.logo_topbar}
                  alt={branding.company_name || "Logo"}
                  className="h-8 object-contain"
                />
              ) : (
                <>
                  <div className="w-8 h-8 rounded bg-primary flex items-center justify-center">
                    <MessageSquare className="h-5 w-5 text-primary-foreground" />
                  </div>
                  <span className="font-semibold text-lg">{branding.company_name || "Whatsale"}</span>
                </>
              )}
            </div>
            
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <Link to="/politica-privacidade" className="hover:text-foreground transition">
                Política de Privacidade
              </Link>
              <a href="#funcionalidades" className="hover:text-foreground transition">
                Funcionalidades
              </a>
              <a href="#precos" className="hover:text-foreground transition">
                Preços
              </a>
            </div>
          </div>
          
          <div className="mt-8 pt-8 border-t flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              <span>CNPJ: 04.609.030/0001-29</span>
            </div>
            <span>© {new Date().getFullYear()} {branding.company_name || "Whatsale"}. Todos os direitos reservados.</span>
          </div>
        </div>
      </footer>

      {/* Pre-registration Dialog */}
      <Dialog open={showPreRegister} onOpenChange={setShowPreRegister}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Teste Grátis por 3 Dias
            </DialogTitle>
            <DialogDescription>
              Preencha seus dados e nossa equipe entrará em contato para ativar seu acesso.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handlePreRegister} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome completo</Label>
              <Input
                id="name"
                placeholder="Seu nome"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="whatsapp">WhatsApp</Label>
              <Input
                id="whatsapp"
                placeholder="(11) 99999-9999"
                value={formData.whatsapp}
                onChange={(e) => setFormData(prev => ({ ...prev, whatsapp: e.target.value }))}
                required
              />
            </div>
            <DialogFooter className="pt-2">
              <Button type="submit" className="w-full gap-2" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    Solicitar Teste Grátis
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
