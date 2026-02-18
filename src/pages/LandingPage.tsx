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
  CheckCircle2,
  ArrowRight,
  Menu,
  X,
  Loader2,
  Building2,
  Brain,
  Target,
  Calendar,
  TrendingUp,
  Star,
  Sparkles,
  FileText,
  Globe,
  Bell,
  RefreshCw,
  Scale,
  Gavel,
  Briefcase,
  FolderOpen,
  ClipboardList,
  UserCheck,
  AlertTriangle,
  Lock,
  Search,
  Layers,
  ArrowLeftRight,
  Database,
  MessageCircle,
  Cpu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import heroImage from "@/assets/system-preview-crm-kanban.png";

const featureCategories = [
  {
    category: "WhatsApp Organizado",
    icon: MessageSquare,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    features: [
      {
        icon: MessageSquare,
        title: "Chat Centralizado",
        description: "Todas as conversas de clientes em um único painel, sem perder nenhuma mensagem.",
      },
      {
        icon: Users,
        title: "Multi-Advogados",
        description: "Cada advogado atende seus clientes com filas organizadas e transferências.",
      },
      {
        icon: Bell,
        title: "Solicitações de Clientes",
        description: "Receba alertas quando clientes enviam documentos, dúvidas ou novas demandas.",
      },
      {
        icon: Building2,
        title: "Setores do Escritório",
        description: "Separe atendimento por área: cível, trabalhista, família, criminal.",
      },
    ],
  },
  {
    category: "Organização Interna",
    icon: FolderOpen,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
    features: [
      {
        icon: FolderOpen,
        title: "Kanban de Demandas",
        description: "Organize solicitações e demandas dos clientes em quadros visuais por status.",
      },
      {
        icon: ClipboardList,
        title: "Tarefas da Equipe",
        description: "Atribua e acompanhe tarefas entre advogados, estagiários e secretaria.",
      },
      {
        icon: Bot,
        title: "Secretária IA nos Grupos",
        description: "IA inteligente monitora grupos do WhatsApp, identifica solicitações, cria tarefas automaticamente e envia alertas para os responsáveis.",
      },
      {
        icon: Users,
        title: "Gestão de Grupos",
        description: "Grupos internos por caso ou área para comunicação rápida da equipe.",
      },
      {
        icon: Lock,
        title: "Permissões por Cargo",
        description: "Controle quem vê o quê: sócios, associados, estagiários e secretaria.",
      },
    ],
  },
  {
    category: "Lembretes & Agenda",
    icon: Clock,
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
    features: [
      {
        icon: Bell,
        title: "Lembretes Automáticos",
        description: "Crie lembretes para compromissos, reuniões e retornos a clientes.",
      },
      {
        icon: Clock,
        title: "Mensagens Agendadas",
        description: "Programe mensagens para clientes em datas e horários específicos.",
      },
      {
        icon: Calendar,
        title: "Agenda do Escritório",
        description: "Visualize compromissos de toda a equipe em um calendário integrado.",
      },
      {
        icon: RefreshCw,
        title: "Follow-up Automático",
        description: "Sequências de acompanhamento para clientes que não responderam.",
      },
    ],
  },
  {
    category: "IA Jurídica",
    icon: Brain,
    color: "text-violet-500",
    bgColor: "bg-violet-500/10",
    features: [
      {
        icon: Brain,
        title: "Assistente para Peças",
        description: "IA que ajuda a redigir petições, contestações e pareceres dentro do sistema.",
      },
      {
        icon: ArrowLeftRight,
        title: "Transferir para IA",
        description: "Transfira o atendimento de um cliente diretamente para um agente de IA especializado.",
      },
      {
        icon: MessageCircle,
        title: "Consulta IA no Chat",
        description: "Peça ajuda à IA durante o atendimento: análise da conversa, sugestões de resposta e fechamento.",
      },
      {
        icon: Database,
        title: "Base de Conhecimento",
        description: "Alimente a IA com documentos, URLs e textos do escritório para respostas precisas (RAG).",
      },
      {
        icon: Bot,
        title: "Chatbot para Clientes",
        description: "Atenda clientes 24h com triagem automática e coleta de informações.",
      },
      {
        icon: FileText,
        title: "Resumos de Conversas",
        description: "IA resume conversas longas com clientes destacando os pontos importantes.",
      },
      {
        icon: Cpu,
        title: "Múltiplos Agentes IA",
        description: "Crie agentes especializados: qualificação, fechamento, suporte técnico, cada um com seu conhecimento.",
      },
      {
        icon: Sparkles,
        title: "Tira-Dúvidas Jurídico",
        description: "Pergunte sobre legislação, jurisprudência e procedimentos diretamente no chat.",
      },
    ],
  },
  {
    category: "Automação",
    icon: Zap,
    color: "text-rose-500",
    bgColor: "bg-rose-500/10",
    features: [
      {
        icon: Bot,
        title: "Fluxos de Atendimento",
        description: "Crie menus automáticos para triagem: tipo de caso, urgência e área.",
      },
      {
        icon: Send,
        title: "Disparos em Massa",
        description: "Envie comunicados e informativos para toda sua base de clientes.",
      },
      {
        icon: UserCheck,
        title: "Distribuição Automática",
        description: "Novos contatos são distribuídos automaticamente entre os advogados.",
      },
      {
        icon: Target,
        title: "Tags e Segmentação",
        description: "Classifique clientes por tipo de caso, status e prioridade.",
      },
    ],
  },
  {
    category: "Relatórios",
    icon: BarChart3,
    color: "text-cyan-500",
    bgColor: "bg-cyan-500/10",
    features: [
      {
        icon: BarChart3,
        title: "Dashboard do Escritório",
        description: "Visão geral de atendimentos, demandas abertas e performance da equipe.",
      },
      {
        icon: TrendingUp,
        title: "Métricas de Atendimento",
        description: "Tempo de resposta, volume de conversas e satisfação dos clientes.",
      },
      {
        icon: Search,
        title: "Busca de Conversas",
        description: "Encontre qualquer conversa, cliente ou mensagem em segundos.",
      },
      {
        icon: Globe,
        title: "Formulários de Captação",
        description: "Capte novos clientes com formulários online integrados ao WhatsApp.",
      },
    ],
  },
];

const pricingPlans = [
  {
    name: "Solo",
    description: "Para advogados autônomos e escritórios pequenos",
    price: "R$ 300",
    period: "/mês",
    popular: false,
    cta: "Começar Agora",
    features: [
      { text: "1 conexão WhatsApp", included: true },
      { text: "2 usuários", included: true },
      { text: "Chat centralizado", included: true },
      { text: "Kanban de demandas", included: true },
      { text: "Lembretes e agendamentos", included: true },
      { text: "Chatbot de triagem", included: true },
      { text: "Consulta IA no chat", included: false },
      { text: "Transferir para IA", included: false },
      { text: "Base de conhecimento IA", included: false },
    ],
    color: "border-border",
  },
  {
    name: "Escritório",
    description: "Para escritórios com equipe e múltiplas áreas",
    price: "R$ 750",
    period: "/mês",
    popular: true,
    cta: "Testar 7 Dias Grátis",
    features: [
      { text: "3 conexões WhatsApp", included: true },
      { text: "8 usuários", included: true },
      { text: "Tudo do Solo +", included: true },
      { text: "Setores e áreas de atuação", included: true },
      { text: "Distribuição de clientes", included: true },
      { text: "Gestão de grupos internos", included: true },
      { text: "Secretária IA nos grupos", included: true },
      { text: "Disparos em massa", included: true },
      { text: "Consulta IA no chat", included: true },
      { text: "Transferir para IA", included: false },
      { text: "Base de conhecimento IA", included: false },
    ],
    color: "border-primary ring-2 ring-primary/20",
  },
  {
    name: "Premium",
    description: "Para escritórios que querem IA e automação total",
    price: "R$ 1.500",
    period: "/mês",
    popular: false,
    cta: "Testar 7 Dias Grátis",
    features: [
      { text: "6 conexões WhatsApp", included: true },
      { text: "20 usuários", included: true },
      { text: "Tudo do Escritório +", included: true },
      { text: "IA jurídica ilimitada", included: true },
      { text: "Transferir para IA", included: true },
      { text: "Base de conhecimento IA (RAG)", included: true },
      { text: "Múltiplos agentes especializados", included: true },
      { text: "Assistente para peças", included: true },
      { text: "Resumos de conversas por IA", included: true },
      { text: "Análise fantasma de conversas", included: true },
      { text: "Relatórios gerenciais", included: true },
      { text: "Suporte prioritário", included: true },
    ],
    color: "border-border",
  },
  {
    name: "Enterprise",
    description: "Para bancas e escritórios de grande porte",
    price: "Sob consulta",
    period: "",
    popular: false,
    cta: "Falar com Consultor",
    features: [
      { text: "WhatsApps ilimitados", included: true },
      { text: "Usuários ilimitados", included: true },
      { text: "Tudo do Premium +", included: true },
      { text: "Análise fantasma de conversas", included: true },
      { text: "Onboarding dedicado", included: true },
      { text: "SLA garantido", included: true },
      { text: "Suporte 24/7", included: true },
      { text: "Multi-unidades", included: true },
    ],
    color: "border-border bg-gradient-to-br from-background to-muted/50",
  },
];

const stats = [
  { value: "100%", label: "Focado em advocacia" },
  { value: "99.9%", label: "Uptime garantido" },
  { value: "24/7", label: "IA atendendo seus clientes" },
  { value: "<3s", label: "Tempo de resposta" },
];

const testimonials = [
  {
    name: "Dr. Ricardo Almeida",
    role: "Sócio - Almeida & Barros Advogados",
    text: "Organizamos todo o WhatsApp do escritório. Cada advogado atende seus clientes sem confusão e a IA ajuda a redigir peças.",
  },
  {
    name: "Dra. Camila Santos",
    role: "Advogada Autônoma - Direito de Família",
    text: "Os lembretes automáticos e o chatbot de triagem mudaram minha rotina. Nunca mais perdi um retorno a cliente.",
  },
  {
    name: "Dr. Fernando Costa",
    role: "Diretor - Costa & Associados",
    text: "A gestão de grupos internos e a distribuição automática de clientes entre 15 advogados ficou impecável.",
  },
];

export default function LandingPage() {
  const { branding } = useBranding();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState("WhatsApp Organizado");

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
                  <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
                    <Scale className="h-5 w-5 text-primary-foreground" />
                  </div>
                  <div className="flex flex-col">
                    <span className="font-bold text-lg leading-tight">
                      {branding.company_name || "Legal Tech App"}
                    </span>
                    <span className="text-[10px] text-muted-foreground leading-tight tracking-wider uppercase">
                      Gestão Jurídica
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="hidden md:flex items-center gap-6">
              <a href="#funcionalidades" className="text-sm text-muted-foreground hover:text-foreground transition">
                Funcionalidades
              </a>
              <a href="#precos" className="text-sm text-muted-foreground hover:text-foreground transition">
                Planos
              </a>
              <a href="#depoimentos" className="text-sm text-muted-foreground hover:text-foreground transition">
                Depoimentos
              </a>
              <Link to="/login">
                <Button variant="ghost" size="sm">Entrar</Button>
              </Link>
              <Button size="sm" className="gap-2" onClick={() => setShowPreRegister(true)}>
                Testar Grátis
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>

            <button className="md:hidden p-2" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>

          {mobileMenuOpen && (
            <div className="md:hidden py-4 border-t">
              <div className="flex flex-col gap-4">
                <a href="#funcionalidades" className="text-sm text-muted-foreground hover:text-foreground" onClick={() => setMobileMenuOpen(false)}>Funcionalidades</a>
                <a href="#precos" className="text-sm text-muted-foreground hover:text-foreground" onClick={() => setMobileMenuOpen(false)}>Planos</a>
                <a href="#depoimentos" className="text-sm text-muted-foreground hover:text-foreground" onClick={() => setMobileMenuOpen(false)}>Depoimentos</a>
                <div className="flex gap-2 pt-2">
                  <Link to="/login" className="flex-1">
                    <Button variant="outline" className="w-full">Entrar</Button>
                  </Link>
                  <Button className="flex-1" onClick={() => { setMobileMenuOpen(false); setShowPreRegister(true); }}>Testar Grátis</Button>
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
              <Gavel className="h-3 w-3 mr-1" />
              Plataforma exclusiva para advogados
            </Badge>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
              Organize seu{" "}
              <span className="text-primary">WhatsApp jurídico</span>{" "}
              com IA e gestão{" "}
              <span className="text-primary">inteligente</span>
            </h1>

            <p className="text-lg sm:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Centralize conversas, transfira atendimentos para agentes de IA, consulte a IA durante o chat,
              organize solicitações e use inteligência artificial com base de conhecimento do seu escritório.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                size="lg"
                className="gap-2 px-8 h-12 text-base w-full sm:w-auto"
                onClick={() => setShowPreRegister(true)}
              >
                Testar 7 Dias Grátis
                <ArrowRight className="h-5 w-5" />
              </Button>
              <a href="#funcionalidades">
                <Button
                  size="lg"
                  variant="outline"
                  className="gap-2 px-8 h-12 text-base w-full sm:w-auto"
                >
                  Conhecer Funcionalidades
                </Button>
              </a>
            </div>

            <p className="text-sm text-muted-foreground mt-4">
              Sem cartão de crédito • Específico para advocacia • Suporte especializado
            </p>
          </div>

          {/* Stats */}
          <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
            {stats.map((stat, index) => (
              <div key={index} className="text-center p-4">
                <div className="text-2xl md:text-3xl font-bold text-primary">{stat.value}</div>
                <div className="text-xs md:text-sm text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Hero Image */}
          <div className="mt-16 relative">
            <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent z-10 pointer-events-none" />
            <div className="rounded-xl border shadow-2xl bg-card overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/30">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500" />
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                </div>
                <div className="flex-1 text-center text-xs text-muted-foreground">
                  {branding.company_name || "Legal Tech App"} — WhatsApp Jurídico Organizado
                </div>
              </div>
              <img src={heroImage} alt="Plataforma de gestão jurídica com WhatsApp integrado" className="w-full h-auto" />
            </div>
          </div>
        </div>
      </section>

      {/* Pain Points / Why Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 border-y bg-muted/20">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-10">
            Problemas que resolvemos no seu escritório
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: MessageSquare, title: "WhatsApp caótico", desc: "Centralize todas as conversas de clientes em um único painel organizado." },
              { icon: Clock, title: "Esqueceu de retornar", desc: "Lembretes automáticos para retornos, reuniões e compromissos." },
              { icon: FolderOpen, title: "Solicitações perdidas", desc: "Kanban visual para organizar demandas e solicitações dos clientes." },
              { icon: Bot, title: "Grupos sem controle", desc: "Secretária IA monitora grupos do WhatsApp, identifica pedidos e cria tarefas automaticamente." },
              { icon: Brain, title: "Demora em peças", desc: "IA que ajuda a redigir petições e peças. Consulte a IA direto no chat durante o atendimento." },
              { icon: ArrowLeftRight, title: "Atendimento manual 24h", desc: "Transfira conversas para agentes IA que atendem automaticamente com base no conhecimento do escritório." },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3 p-4 rounded-lg bg-background border">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <item.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold mb-1">{item.title}</h4>
                  <p className="text-sm text-muted-foreground">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="funcionalidades" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <Badge variant="outline" className="mb-4">+30 Funcionalidades</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Tudo que seu escritório precisa no WhatsApp
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Da organização de conversas à IA com base de conhecimento, transferência para agentes inteligentes e assistente jurídico.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-2 mb-10">
            {featureCategories.map((cat) => (
              <button
                key={cat.category}
                onClick={() => setActiveCategory(cat.category)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all",
                  activeCategory === cat.category
                    ? `${cat.bgColor} ${cat.color} ring-2 ring-current/20`
                    : "bg-muted border text-muted-foreground hover:text-foreground"
                )}
              >
                <cat.icon className="h-4 w-4" />
                {cat.category}
              </button>
            ))}
          </div>

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

          {/* Summary Grid */}
          <div className="mt-16 grid md:grid-cols-3 gap-6">
            {featureCategories.slice(0, 6).map((cat, index) => (
              <div key={index} className="flex items-start gap-3 p-4 rounded-lg bg-muted/30 border">
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

      {/* Testimonials */}
      <section id="depoimentos" className="py-20 px-4 sm:px-6 lg:px-8 bg-muted/30">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <Badge variant="outline" className="mb-4">Depoimentos</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              O que advogados dizem sobre nós
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <Card key={i} className="bg-background">
                <CardContent className="p-6">
                  <div className="flex gap-1 mb-4">
                    {[...Array(5)].map((_, j) => (
                      <Star key={j} className="h-4 w-4 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground mb-4 italic">"{t.text}"</p>
                  <div>
                    <p className="font-semibold text-sm">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.role}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="precos" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <Badge variant="outline" className="mb-4">Planos</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Planos pensados para escritórios de advocacia
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Comece pequeno e escale conforme seu escritório cresce. Teste grátis por 7 dias.
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
        </div>
      </section>

      {/* Trust Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-muted/30">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-12">
            Por que escritórios confiam na nossa plataforma?
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="p-6">
              <Shield className="h-8 w-8 mx-auto text-primary mb-3" />
              <h3 className="font-semibold mb-1">Sigilo Total</h3>
              <p className="text-sm text-muted-foreground">Criptografia ponta a ponta e conformidade com LGPD</p>
            </Card>
            <Card className="p-6">
              <Gavel className="h-8 w-8 mx-auto text-primary mb-3" />
              <h3 className="font-semibold mb-1">Feito para OAB</h3>
              <p className="text-sm text-muted-foreground">Respeita o código de ética e normas da advocacia</p>
            </Card>
            <Card className="p-6">
              <Headphones className="h-8 w-8 mx-auto text-primary mb-3" />
              <h3 className="font-semibold mb-1">Suporte Jurídico</h3>
              <p className="text-sm text-muted-foreground">Equipe que entende as necessidades do advogado</p>
            </Card>
            <Card className="p-6">
              <Zap className="h-8 w-8 mx-auto text-primary mb-3" />
              <h3 className="font-semibold mb-1">Setup Personalizado</h3>
              <p className="text-sm text-muted-foreground">Configuração sob medida para a realidade do seu escritório</p>
            </Card>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-primary text-primary-foreground">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Pronto para modernizar seu escritório?
          </h2>
          <p className="text-lg opacity-90 mb-8">
            Junte-se a mais de 2.000 escritórios que já gerenciam processos e clientes pela nossa plataforma.
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
                <img src={branding.logo_topbar} alt={branding.company_name || "Logo"} className="h-8 object-contain" />
              ) : (
                <>
                  <div className="w-8 h-8 rounded bg-primary flex items-center justify-center">
                    <Scale className="h-5 w-5 text-primary-foreground" />
                  </div>
                  <span className="font-semibold text-lg">{branding.company_name || "Legal Tech App"}</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <Link to="/politica-privacidade" className="hover:text-foreground transition">Política de Privacidade</Link>
              <a href="#funcionalidades" className="hover:text-foreground transition">Funcionalidades</a>
              <a href="#precos" className="hover:text-foreground transition">Planos</a>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              <span>CNPJ: 04.609.030/0001-29</span>
            </div>
            <span>© {new Date().getFullYear()} {branding.company_name || "Legal Tech App"}. Todos os direitos reservados.</span>
          </div>
        </div>
      </footer>

      {/* Pre-registration Dialog */}
      <Dialog open={showPreRegister} onOpenChange={setShowPreRegister}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-primary" />
              Teste Grátis por 7 Dias
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
                placeholder="Dr(a). Nome Sobrenome"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail profissional</Label>
              <Input
                id="email"
                type="email"
                placeholder="contato@escritorio.com.br"
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
                    Solicitar Acesso
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
