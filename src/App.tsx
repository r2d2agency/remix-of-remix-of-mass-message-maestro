import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { useBranding } from "@/hooks/use-branding";
import ProtectedRoute from "@/components/ProtectedRoute";
import LandingPage from "./pages/LandingPage";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Cadastro from "./pages/Cadastro";
import Conexao from "./pages/Conexao";
import Contatos from "./pages/Contatos";
import Mensagens from "./pages/Mensagens";
import Campanhas from "./pages/Campanhas";
import Chat from "./pages/Chat";
import Cobranca from "./pages/Cobranca";
import Organizacoes from "./pages/Organizacoes";
import Admin from "./pages/Admin";
import Configuracoes from "./pages/Configuracoes";
import Agendamentos from "./pages/Agendamentos";
import Tags from "./pages/Tags";
import ContatosChat from "./pages/ContatosChat";
import Chatbots from "./pages/Chatbots";
import Fluxos from "./pages/Fluxos";
import Departamentos from "./pages/Departamentos";
import AgentesIA from "./pages/AgentesIA";
import CRMNegociacoes from "./pages/CRMNegociacoes";
import CRMProspects from "./pages/CRMProspects";
import CRMEmpresas from "./pages/CRMEmpresas";
import CRMTarefas from "./pages/CRMTarefas";
import CRMAgenda from "./pages/CRMAgenda";
import CRMConfiguracoes from "./pages/CRMConfiguracoes";
import CRMRelatorios from "./pages/CRMRelatorios";
import Mapa from "./pages/Mapa";
import PoliticaPrivacidade from "./pages/PoliticaPrivacidade";
import FluxosExternos from "./pages/FluxosExternos";
import PublicFormPage from "./pages/PublicFormPage";
import LeadWebhooks from "./pages/LeadWebhooks";
import SequenciasNurturing from "./pages/SequenciasNurturing";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// Component to handle favicon update
function FaviconUpdater() {
  const { branding } = useBranding();

  useEffect(() => {
    if (branding.favicon) {
      const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
      if (link) {
        link.href = branding.favicon;
      } else {
        const newLink = document.createElement('link');
        newLink.rel = 'icon';
        newLink.href = branding.favicon;
        document.head.appendChild(newLink);
      }
    }
  }, [branding.favicon]);

  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <FaviconUpdater />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/cadastro" element={<Cadastro />} />
            <Route path="/" element={<LandingPage />} />
            <Route path="/dashboard" element={<ProtectedRoute><Index /></ProtectedRoute>} />
            <Route path="/conexao" element={<ProtectedRoute><Conexao /></ProtectedRoute>} />
            <Route path="/contatos" element={<ProtectedRoute><Contatos /></ProtectedRoute>} />
            <Route path="/mensagens" element={<ProtectedRoute><Mensagens /></ProtectedRoute>} />
            <Route path="/campanhas" element={<ProtectedRoute><Campanhas /></ProtectedRoute>} />
            <Route path="/chat" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
            <Route path="/agendamentos" element={<ProtectedRoute><Agendamentos /></ProtectedRoute>} />
            <Route path="/tags" element={<ProtectedRoute><Tags /></ProtectedRoute>} />
            <Route path="/contatos-chat" element={<ProtectedRoute><ContatosChat /></ProtectedRoute>} />
            <Route path="/cobranca" element={<ProtectedRoute><Cobranca /></ProtectedRoute>} />
            <Route path="/organizacoes" element={<ProtectedRoute><Organizacoes /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
            <Route path="/configuracoes" element={<ProtectedRoute><Configuracoes /></ProtectedRoute>} />
            <Route path="/chatbots" element={<ProtectedRoute><Chatbots /></ProtectedRoute>} />
            <Route path="/fluxos" element={<ProtectedRoute><Fluxos /></ProtectedRoute>} />
            <Route path="/departamentos" element={<ProtectedRoute><Departamentos /></ProtectedRoute>} />
            <Route path="/agentes-ia" element={<ProtectedRoute><AgentesIA /></ProtectedRoute>} />
            <Route path="/crm/negociacoes" element={<ProtectedRoute><CRMNegociacoes /></ProtectedRoute>} />
            <Route path="/crm/prospects" element={<ProtectedRoute><CRMProspects /></ProtectedRoute>} />
            <Route path="/crm/empresas" element={<ProtectedRoute><CRMEmpresas /></ProtectedRoute>} />
            <Route path="/crm/tarefas" element={<ProtectedRoute><CRMTarefas /></ProtectedRoute>} />
            <Route path="/crm/agenda" element={<ProtectedRoute><CRMAgenda /></ProtectedRoute>} />
            <Route path="/crm/configuracoes" element={<ProtectedRoute><CRMConfiguracoes /></ProtectedRoute>} />
            <Route path="/crm/relatorios" element={<ProtectedRoute><CRMRelatorios /></ProtectedRoute>} />
            <Route path="/mapa" element={<ProtectedRoute><Mapa /></ProtectedRoute>} />
            <Route path="/fluxos-externos" element={<ProtectedRoute><FluxosExternos /></ProtectedRoute>} />
            <Route path="/lead-webhooks" element={<ProtectedRoute><LeadWebhooks /></ProtectedRoute>} />
            <Route path="/sequencias" element={<ProtectedRoute><SequenciasNurturing /></ProtectedRoute>} />
            <Route path="/f/:slug" element={<PublicFormPage />} />
            <Route path="/politica-privacidade" element={<PoliticaPrivacidade />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
