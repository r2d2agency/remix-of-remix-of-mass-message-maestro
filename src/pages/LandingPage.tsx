import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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

const features = [
  {
    icon: MessageSquare,
    title: "Chat Unificado",
    description: "Gerencie todas as conversas do WhatsApp em um único lugar com atendimento multi-agente.",
  },
  {
    icon: Send,
    title: "Campanhas em Massa",
    description: "Envie mensagens personalizadas para milhares de contatos com agendamento inteligente.",
  },
  {
    icon: Bot,
    title: "Chatbots & IA",
    description: "Automatize atendimentos com chatbots inteligentes e agentes de IA integrados.",
  },
  {
    icon: Workflow,
    title: "Fluxos Visuais",
    description: "Crie automações complexas com nosso editor visual drag-and-drop.",
  },
  {
    icon: BarChart3,
    title: "CRM Integrado",
    description: "Gerencie leads, negociações e funis de vendas diretamente na plataforma.",
  },
  {
    icon: Headphones,
    title: "Atendimento Profissional",
    description: "Filas, departamentos, transferências e métricas em tempo real.",
  },
];

const benefits = [
  "Múltiplos WhatsApps conectados",
  "Planos flexíveis por equipe",
  "Chatbots sem limite de fluxos",
  "Relatórios e métricas completas",
  "API para integrações",
  "Suporte técnico especializado",
];

export default function LandingPage() {
  const { branding } = useBranding();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeScreen, setActiveScreen] = useState("chat");
  
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

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      toast.error("Por favor, insira um email válido");
      return;
    }

    // Basic phone validation (at least 10 digits)
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
              <a href="#beneficios" className="text-sm text-muted-foreground hover:text-foreground transition">
                Benefícios
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
                <a href="#beneficios" className="text-sm text-muted-foreground hover:text-foreground" onClick={() => setMobileMenuOpen(false)}>
                  Benefícios
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
              <Zap className="h-3 w-3 mr-1" />
              Plataforma completa para WhatsApp Business
            </Badge>
            
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
              Transforme seu WhatsApp em uma{" "}
              <span className="text-primary">máquina de vendas</span>
            </h1>
            
            <p className="text-lg sm:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Automatize atendimentos, dispare campanhas, gerencie equipes e aumente suas vendas 
              com a plataforma mais completa do mercado.
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
            </div>

            <p className="text-sm text-muted-foreground mt-4">
              Sem cartão de crédito • Cancele quando quiser
            </p>
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

      {/* Features Section */}
      <section id="funcionalidades" className="py-20 px-4 sm:px-6 lg:px-8 bg-muted/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <Badge variant="outline" className="mb-4">Funcionalidades</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Tudo que você precisa em um só lugar
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Ferramentas poderosas para automatizar, escalar e profissionalizar seu atendimento via WhatsApp.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <Card key={index} className="group hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                <CardContent className="p-6">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground text-sm">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section id="beneficios" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <Badge variant="outline" className="mb-4">Por que nos escolher?</Badge>
              <h2 className="text-3xl sm:text-4xl font-bold mb-6">
                A plataforma mais completa para{" "}
                <span className="text-primary">escalar seu negócio</span>
              </h2>
              <p className="text-muted-foreground mb-8">
                Desenvolvida para empresas que levam o atendimento via WhatsApp a sério. 
                Do pequeno empreendedor à grande operação de vendas.
              </p>

              <div className="grid sm:grid-cols-2 gap-4">
                {benefits.map((benefit, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                    </div>
                    <span className="text-sm">{benefit}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Card className="p-6 text-center">
                <div className="text-4xl font-bold text-primary mb-2">10k+</div>
                <p className="text-sm text-muted-foreground">Mensagens/dia</p>
              </Card>
              <Card className="p-6 text-center">
                <div className="text-4xl font-bold text-primary mb-2">99.9%</div>
                <p className="text-sm text-muted-foreground">Uptime garantido</p>
              </Card>
              <Card className="p-6 text-center">
                <div className="text-4xl font-bold text-primary mb-2">24/7</div>
                <p className="text-sm text-muted-foreground">Suporte técnico</p>
              </Card>
              <Card className="p-6 text-center">
                <div className="text-4xl font-bold text-primary mb-2">
                  <Shield className="h-10 w-10 mx-auto text-primary" />
                </div>
                <p className="text-sm text-muted-foreground">Dados seguros</p>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section id="precos" className="py-20 px-4 sm:px-6 lg:px-8 bg-primary text-primary-foreground">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Pronto para transformar seu atendimento?
          </h2>
          <p className="text-lg opacity-90 mb-8">
            Comece agora com 3 dias grátis. Sem compromisso, sem cartão de crédito.
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
              <Button size="lg" variant="outline" className="gap-2 px-8 h-12 text-base w-full sm:w-auto border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10">
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
            <div className="flex items-center gap-2">
              {branding.logo_topbar ? (
                <img
                  src={branding.logo_topbar}
                  alt={branding.company_name || "Logo"}
                  className="h-6 object-contain"
                />
              ) : (
                <>
                  <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
                    <MessageSquare className="h-4 w-4 text-primary-foreground" />
                  </div>
                  <span className="font-semibold">
                    {branding.company_name || "Whatsale"}
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <Link to="/politica-privacidade" className="hover:text-foreground transition">
                Política de Privacidade
              </Link>
              <a href="#" className="hover:text-foreground transition">
                Termos de Uso
              </a>
              <a href="#" className="hover:text-foreground transition">
                Contato
              </a>
            </div>
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} {branding.company_name || "Whatsale"}. Todos os direitos reservados.
            </p>
          </div>
        </div>
      </footer>

      {/* Pre-Register Dialog */}
      <Dialog open={showPreRegister} onOpenChange={setShowPreRegister}>
        <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Teste Grátis por 3 Dias
            </DialogTitle>
            <DialogDescription>
              Preencha seus dados e nossa equipe entrará em contato para liberar seu acesso.
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handlePreRegister} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome completo *</Label>
              <Input
                id="name"
                placeholder="Seu nome"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                disabled={isSubmitting}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="email">E-mail *</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                disabled={isSubmitting}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="whatsapp">WhatsApp *</Label>
              <Input
                id="whatsapp"
                placeholder="(11) 99999-9999"
                value={formData.whatsapp}
                onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                disabled={isSubmitting}
              />
            </div>

            <DialogFooter className="pt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setShowPreRegister(false)}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting} className="gap-2">
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
