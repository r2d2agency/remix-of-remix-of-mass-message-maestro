import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { API_URL, getAuthToken } from '@/lib/api';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  MessageSquare,
  Send,
  Bot,
  Users,
  Calendar,
  CreditCard,
  Brain,
  GitBranch,
  Building2,
  BarChart3,
  Zap,
  FileText,
  Settings,
  Shield,
} from 'lucide-react';

type ModuleKey = 'campaigns' | 'billing' | 'groups' | 'scheduled_messages' | 'chatbots' | 'chat' | 'crm' | 'ai_agents' | 'group_secretary';

interface FeatureDoc {
  id: string;
  moduleKey?: ModuleKey;
  icon: React.ReactNode;
  title: string;
  description: string;
  howToActivate?: string;
  features: {
    name: string;
    description: string;
  }[];
}

const allFeatures: FeatureDoc[] = [
  {
    id: 'chat',
    moduleKey: 'chat',
    icon: <MessageSquare className="h-5 w-5" />,
    title: 'Chat & Atendimento',
    description: 'Central de atendimento multicanal via WhatsApp com recursos avançados de comunicação.',
    features: [
      { name: 'Conversas em tempo real', description: 'Receba e responda mensagens instantaneamente com notificações push.' },
      { name: 'Múltiplas conexões', description: 'Gerencie várias contas WhatsApp em uma única interface.' },
      { name: 'Transferência entre atendentes', description: 'Transfira conversas para outros membros da equipe ou departamentos.' },
      { name: 'Respostas rápidas', description: 'Salve templates de mensagens para agilizar o atendimento.' },
      { name: 'Notas internas', description: 'Adicione anotações privadas nas conversas visíveis apenas para a equipe.' },
      { name: 'Histórico completo', description: 'Acesse todo o histórico de conversas com cada contato.' },
      { name: 'Áudios e mídias', description: 'Envie e receba áudios, imagens, vídeos e documentos.' },
      { name: 'Indicador de digitação', description: 'Visualize quando o contato está digitando.' },
    ],
  },
  {
    id: 'campaigns',
    moduleKey: 'campaigns',
    icon: <Send className="h-5 w-5" />,
    title: 'Campanhas & Disparos',
    description: 'Envio em massa de mensagens segmentadas para listas de contatos.',
    features: [
      { name: 'Disparo em massa', description: 'Envie mensagens para milhares de contatos automaticamente.' },
      { name: 'Segmentação por tags', description: 'Filtre contatos por tags para campanhas direcionadas.' },
      { name: 'Agendamento', description: 'Programe campanhas para datas e horários específicos.' },
      { name: 'Templates de mensagem', description: 'Crie e reutilize modelos de mensagens com variáveis dinâmicas.' },
      { name: 'Relatórios de entrega', description: 'Acompanhe taxas de entrega, leitura e respostas.' },
      { name: 'Controle de velocidade', description: 'Configure intervalos entre envios para evitar bloqueios.' },
    ],
  },
  {
    id: 'chatbots',
    moduleKey: 'chatbots',
    icon: <Bot className="h-5 w-5" />,
    title: 'Chatbots & Fluxos',
    description: 'Automação de atendimento com bots inteligentes e fluxos de conversação.',
    features: [
      { name: 'Editor visual de fluxos', description: 'Crie fluxos de conversa arrastando e soltando blocos.' },
      { name: 'Menu de opções', description: 'Configure menus numerados para autoatendimento.' },
      { name: 'Coleta de dados', description: 'Capture informações do cliente durante a conversa.' },
      { name: 'Condições e ramificações', description: 'Crie lógica condicional para diferentes caminhos.' },
      { name: 'Integração com CRM', description: 'Crie negociações e prospects automaticamente.' },
      { name: 'Transferência humana', description: 'Transfira para atendente quando necessário.' },
      { name: 'Horários de funcionamento', description: 'Configure mensagens automáticas fora do expediente.' },
    ],
  },
  {
    id: 'ai_agents',
    moduleKey: 'ai_agents',
    icon: <Brain className="h-5 w-5" />,
    title: 'Agentes de IA',
    description: 'Assistentes virtuais com inteligência artificial para atendimento autônomo.',
    features: [
      { name: 'Respostas inteligentes', description: 'IA responde perguntas com base na sua base de conhecimento.' },
      { name: 'Base de conhecimento', description: 'Alimente o agente com informações sobre seu negócio.' },
      { name: 'Personalidade configurável', description: 'Defina tom, nome e comportamento do agente.' },
      { name: 'Aprendizado contínuo', description: 'O agente melhora com feedback e interações.' },
      { name: 'Integração com sistemas', description: 'Conecte a APIs externas para consultas em tempo real.' },
      { name: 'Fallback humano', description: 'Transfere automaticamente quando não consegue ajudar.' },
    ],
  },
  {
    id: 'crm',
    moduleKey: 'crm',
    icon: <Building2 className="h-5 w-5" />,
    title: 'CRM & Vendas',
    description: 'Gestão completa de relacionamento com clientes e pipeline de vendas.',
    features: [
      { name: 'Kanban de negociações', description: 'Visualize e gerencie deals em um quadro visual.' },
      { name: 'Funis personalizados', description: 'Crie múltiplos funis com etapas customizadas.' },
      { name: 'Gestão de empresas', description: 'Cadastre e organize empresas e contatos relacionados.' },
      { name: 'Gestão de prospects', description: 'Acompanhe leads desde a captação até a conversão.' },
      { name: 'Tarefas e follow-ups', description: 'Crie tarefas e lembretes vinculados às negociações.' },
      { name: 'Agenda integrada', description: 'Visualize compromissos e reuniões no calendário.' },
      { name: 'Lead Scoring', description: 'Pontue leads automaticamente com base em critérios.' },
      { name: 'Relatórios avançados', description: 'Analise performance, tendências e gargalos.' },
      { name: 'Automações de estágio', description: 'Execute ações automáticas ao mover negociações.' },
    ],
  },
  {
    id: 'scheduled_messages',
    moduleKey: 'scheduled_messages',
    icon: <Calendar className="h-5 w-5" />,
    title: 'Agendamentos',
    description: 'Programação de mensagens para envio automático em datas futuras.',
    features: [
      { name: 'Agendamento individual', description: 'Programe mensagens para contatos específicos.' },
      { name: 'Recorrência', description: 'Configure mensagens que se repetem periodicamente.' },
      { name: 'Fuso horário', description: 'Respeite o horário local do destinatário.' },
      { name: 'Cancelamento flexível', description: 'Cancele ou edite agendamentos a qualquer momento.' },
    ],
  },
  {
    id: 'billing',
    moduleKey: 'billing',
    icon: <CreditCard className="h-5 w-5" />,
    title: 'Cobrança & Financeiro',
    description: 'Integração com Asaas para gestão de cobranças e pagamentos.',
    features: [
      { name: 'Sincronização Asaas', description: 'Importe clientes e cobranças automaticamente.' },
      { name: 'Lembretes de vencimento', description: 'Envie avisos automáticos de boletos a vencer.' },
      { name: 'Confirmação de pagamento', description: 'Notifique clientes quando pagamentos são confirmados.' },
      { name: 'Fila de cobrança', description: 'Gerencie envios de cobrança em lote.' },
      { name: 'Relatórios financeiros', description: 'Acompanhe inadimplência e recebimentos.' },
    ],
  },
  {
    id: 'groups',
    moduleKey: 'groups',
    icon: <Users className="h-5 w-5" />,
    title: 'Grupos',
    description: 'Gestão de grupos WhatsApp com recursos administrativos.',
    features: [
      { name: 'Listagem de grupos', description: 'Visualize todos os grupos conectados.' },
      { name: 'Envio para grupos', description: 'Dispare mensagens para grupos selecionados.' },
      { name: 'Extração de membros', description: 'Exporte lista de participantes dos grupos.' },
    ],
  },
  {
    id: 'group_secretary',
    moduleKey: 'group_secretary',
    icon: <Bot className="h-5 w-5" />,
    title: 'Secretária IA de Grupos',
    description: 'Monitora grupos de WhatsApp e detecta quando alguém solicita algo à equipe, notificando o responsável.',
    features: [
      { name: 'Detecção inteligente', description: 'A IA analisa mensagens em grupos e identifica quando alguém está pedindo algo ou mencionando um membro da equipe.' },
      { name: 'Identificação por nome e apelido', description: 'Cadastre apelidos e nomes pelos quais cada membro é chamado nos grupos para identificação precisa.' },
      { name: 'Identificação por contexto', description: 'A IA entende o contexto da mensagem (ex: "preciso do financeiro") e mapeia para o responsável da área.' },
      { name: 'Criação de tarefa no CRM', description: 'Quando uma solicitação é detectada, uma tarefa é criada automaticamente no CRM atribuída ao responsável.' },
      { name: 'Popup com som na tela', description: 'Notificação instantânea na tela do responsável com preview da mensagem e som de alerta.' },
      { name: 'Seleção de grupos', description: 'Escolha quais grupos a IA deve monitorar, filtrando por conexão WhatsApp.' },
      { name: 'Nível de confiança', description: 'Ajuste a sensibilidade da IA — mais alto significa mais preciso, mais baixo detecta menções mais sutis.' },
      { name: 'Logs de detecção', description: 'Histórico completo de todas as detecções com grupo, remetente, responsável e confiança.' },
    ],
    howToActivate: 'Para ativar: acesse Configurações da Organização → aba Módulos → ative "Secretária IA de Grupos". O superadmin também pode habilitar/desabilitar no plano.',
  },
  {
    id: 'nurturing',
    icon: <Zap className="h-5 w-5" />,
    title: 'Sequências de Nurturing',
    description: 'Automação de sequências de mensagens para nutrição de leads.',
    features: [
      { name: 'Sequências automáticas', description: 'Crie séries de mensagens com intervalos programados.' },
      { name: 'Gatilhos de entrada', description: 'Inicie sequências por tags, eventos ou manualmente.' },
      { name: 'Pausa automática', description: 'Pause quando o contato responde.' },
      { name: 'Métricas de engajamento', description: 'Acompanhe aberturas e respostas por etapa.' },
    ],
  },
  {
    id: 'flows',
    icon: <GitBranch className="h-5 w-5" />,
    title: 'Fluxos Externos',
    description: 'Integrações com sistemas externos via webhooks e APIs.',
    features: [
      { name: 'Webhooks de entrada', description: 'Receba dados de formulários e sistemas externos.' },
      { name: 'Formulários públicos', description: 'Crie landing pages com formulários integrados.' },
      { name: 'Distribuição de leads', description: 'Distribua leads automaticamente entre atendentes.' },
      { name: 'Integrações customizadas', description: 'Conecte com qualquer sistema via API.' },
    ],
  },
  {
    id: 'departments',
    icon: <Shield className="h-5 w-5" />,
    title: 'Departamentos & Filas',
    description: 'Organização da equipe em departamentos com filas de atendimento.',
    features: [
      { name: 'Múltiplos departamentos', description: 'Organize a equipe por áreas (Vendas, Suporte, etc).' },
      { name: 'Filas de espera', description: 'Distribua conversas automaticamente entre agentes.' },
      { name: 'Horários por departamento', description: 'Configure expedientes diferentes por área.' },
      { name: 'Transferência entre filas', description: 'Mova conversas entre departamentos.' },
    ],
  },
  {
    id: 'reports',
    icon: <BarChart3 className="h-5 w-5" />,
    title: 'Relatórios & Analytics',
    description: 'Dashboards e métricas para análise de performance.',
    features: [
      { name: 'Dashboard principal', description: 'Visão geral de mensagens, conversas e atendimentos.' },
      { name: 'Relatórios de campanha', description: 'Métricas detalhadas de cada disparo.' },
      { name: 'Performance de agentes', description: 'Acompanhe produtividade da equipe.' },
      { name: 'Analytics CTWA', description: 'Métricas de Click-to-WhatsApp Ads.' },
      { name: 'Revenue Intelligence', description: 'Análise de receita e previsões de vendas.' },
    ],
  },
  {
    id: 'settings',
    icon: <Settings className="h-5 w-5" />,
    title: 'Configurações',
    description: 'Personalizações e ajustes do sistema.',
    features: [
      { name: 'Perfil do usuário', description: 'Atualize seus dados e senha.' },
      { name: 'Notificações', description: 'Configure alertas sonoros e push.' },
      { name: 'Tema claro/escuro', description: 'Escolha a aparência da interface.' },
      { name: 'Gestão de usuários', description: 'Adicione e gerencie membros da organização.' },
    ],
  },
];

export function FeaturesDocumentation({ showAll = false }: { showAll?: boolean }) {
  const { modulesEnabled } = useAuth();
  const [isSuperadmin, setIsSuperadmin] = useState(false);

  useEffect(() => {
    const check = async () => {
      try {
        const token = getAuthToken();
        if (!token) return;
        const res = await fetch(`${API_URL}/api/admin/check`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) { const data = await res.json(); setIsSuperadmin(data.isSuperadmin); }
      } catch {}
    };
    check();
  }, []);

  const shouldShowAll = showAll || isSuperadmin;

  // Filter features based on enabled modules (superadmin sees all)
  const visibleFeatures = shouldShowAll ? allFeatures : allFeatures.filter((feature) => {
    if (!feature.moduleKey) return true;
    return modulesEnabled[feature.moduleKey as keyof typeof modulesEnabled];
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Documentação de Funcionalidades
        </CardTitle>
        <CardDescription>
          Guia completo das funcionalidades disponíveis no seu plano. 
          Funcionalidades desativadas não aparecem nesta lista.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2 mb-6">
          <span className="text-sm text-muted-foreground">Módulos ativos:</span>
          {Object.entries(modulesEnabled).map(([key, enabled]) => (
            enabled && (
              <Badge key={key} variant="secondary" className="capitalize">
                {key.replace('_', ' ')}
              </Badge>
            )
          ))}
        </div>

        <Accordion type="multiple" className="w-full">
          {visibleFeatures.map((feature) => (
            <AccordionItem key={feature.id} value={feature.id}>
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    {feature.icon}
                  </div>
                  <div className="text-left">
                    <div className="font-medium">{feature.title}</div>
                    <div className="text-sm text-muted-foreground font-normal">
                      {feature.description}
                    </div>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="pl-12 space-y-3">
                  {feature.howToActivate && (
                    <div className="bg-muted/50 rounded-lg p-3 mb-2 text-sm text-muted-foreground border">
                      <strong className="text-foreground">Como ativar/desativar:</strong> {feature.howToActivate}
                    </div>
                  )}
                  {feature.features.map((item, idx) => (
                    <div key={idx} className="border-l-2 border-primary/20 pl-4 py-1">
                      <div className="font-medium text-sm">{item.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {item.description}
                      </div>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        {visibleFeatures.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            Nenhuma funcionalidade disponível no momento.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
