-- Schema para sistema de Chatbots
-- Suporta chatbots híbridos (IA + Fluxos de decisão)

-- Enum para provedor de IA
DO $$ BEGIN
  CREATE TYPE ai_provider AS ENUM ('gemini', 'openai', 'none');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Enum para modo de operação do chatbot
DO $$ BEGIN
  CREATE TYPE chatbot_mode AS ENUM ('always', 'business_hours', 'outside_hours', 'pre_service');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Enum para tipo de nó do fluxo
DO $$ BEGIN
  CREATE TYPE flow_node_type AS ENUM ('start', 'message', 'menu', 'input', 'condition', 'action', 'transfer', 'ai_response', 'end');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Tabela principal de chatbots
CREATE TABLE IF NOT EXISTS chatbots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES connections(id) ON DELETE SET NULL,
  
  -- Informações básicas
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT false,
  
  -- Configuração de modo
  mode chatbot_mode DEFAULT 'always',
  business_hours_start TIME DEFAULT '08:00',
  business_hours_end TIME DEFAULT '18:00',
  business_days INTEGER[] DEFAULT ARRAY[1,2,3,4,5], -- 0=Dom, 1=Seg...6=Sab
  timezone VARCHAR(50) DEFAULT 'America/Sao_Paulo',
  
  -- Configuração de IA
  ai_provider ai_provider DEFAULT 'none',
  ai_model VARCHAR(100),
  ai_api_key TEXT, -- Criptografado
  ai_system_prompt TEXT,
  ai_temperature DECIMAL(2,1) DEFAULT 0.7,
  ai_max_tokens INTEGER DEFAULT 500,
  
  -- Configurações gerais
  welcome_message TEXT,
  fallback_message TEXT DEFAULT 'Desculpe, não entendi. Vou transferir você para um atendente.',
  transfer_after_failures INTEGER DEFAULT 3,
  typing_delay_ms INTEGER DEFAULT 1500,
  
  -- Metadata
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para chatbots
CREATE INDEX IF NOT EXISTS idx_chatbots_organization ON chatbots(organization_id);
CREATE INDEX IF NOT EXISTS idx_chatbots_connection ON chatbots(connection_id);
CREATE INDEX IF NOT EXISTS idx_chatbots_active ON chatbots(is_active);

-- Tabela de fluxos do chatbot (nós do fluxo)
CREATE TABLE IF NOT EXISTS chatbot_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chatbot_id UUID NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
  
  -- Identificação do nó
  node_id VARCHAR(50) NOT NULL,
  node_type flow_node_type NOT NULL,
  name VARCHAR(255),
  
  -- Posição no editor visual
  position_x INTEGER DEFAULT 0,
  position_y INTEGER DEFAULT 0,
  
  -- Conteúdo do nó
  content JSONB DEFAULT '{}',
  -- Para message: { "text": "...", "media_url": "...", "media_type": "..." }
  -- Para menu: { "text": "...", "options": [{ "id": "1", "label": "Opção 1", "next_node": "node_x" }] }
  -- Para input: { "text": "...", "variable": "user_name", "validation": "text|phone|email" }
  -- Para condition: { "variable": "...", "operator": "equals|contains|gt|lt", "value": "...", "true_node": "...", "false_node": "..." }
  -- Para action: { "type": "set_variable|add_tag|notify", "params": {...} }
  -- Para transfer: { "to_user_id": "..." ou "to_department": "..." }
  -- Para ai_response: { "context": "...", "save_to_variable": "..." }
  
  -- Próximo nó (para nós lineares)
  next_node_id VARCHAR(50),
  
  -- Ordem para organização
  order_index INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(chatbot_id, node_id)
);

-- Índices para flows
CREATE INDEX IF NOT EXISTS idx_chatbot_flows_chatbot ON chatbot_flows(chatbot_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_flows_node_type ON chatbot_flows(node_type);

-- Tabela de sessões/conversas do chatbot
CREATE TABLE IF NOT EXISTS chatbot_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chatbot_id UUID NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  contact_phone VARCHAR(50) NOT NULL,
  
  -- Estado atual
  current_node_id VARCHAR(50),
  variables JSONB DEFAULT '{}', -- Variáveis coletadas durante o fluxo
  
  -- Controle
  is_active BOOLEAN DEFAULT true,
  failure_count INTEGER DEFAULT 0,
  transferred_at TIMESTAMP WITH TIME ZONE,
  transferred_to UUID REFERENCES users(id),
  
  -- Timestamps
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_interaction_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ended_at TIMESTAMP WITH TIME ZONE
);

-- Índices para sessions
CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_chatbot ON chatbot_sessions(chatbot_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_conversation ON chatbot_sessions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_phone ON chatbot_sessions(contact_phone);
CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_active ON chatbot_sessions(is_active);

-- Tabela de mensagens trocadas com o chatbot
CREATE TABLE IF NOT EXISTS chatbot_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chatbot_sessions(id) ON DELETE CASCADE,
  
  -- Direção
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
  
  -- Conteúdo
  content TEXT,
  message_type VARCHAR(20) DEFAULT 'text',
  media_url TEXT,
  
  -- Contexto
  node_id VARCHAR(50),
  ai_generated BOOLEAN DEFAULT false,
  ai_tokens_used INTEGER,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para messages
CREATE INDEX IF NOT EXISTS idx_chatbot_messages_session ON chatbot_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_messages_created ON chatbot_messages(created_at);

-- Tabela de estatísticas agregadas
CREATE TABLE IF NOT EXISTS chatbot_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chatbot_id UUID NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  
  -- Contadores
  total_sessions INTEGER DEFAULT 0,
  completed_sessions INTEGER DEFAULT 0,
  transferred_sessions INTEGER DEFAULT 0,
  
  total_messages_in INTEGER DEFAULT 0,
  total_messages_out INTEGER DEFAULT 0,
  
  ai_requests INTEGER DEFAULT 0,
  ai_tokens_used INTEGER DEFAULT 0,
  
  -- Métricas
  avg_session_duration_seconds INTEGER,
  avg_messages_per_session DECIMAL(5,2),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(chatbot_id, date)
);

-- Índices para stats
CREATE INDEX IF NOT EXISTS idx_chatbot_stats_chatbot_date ON chatbot_stats(chatbot_id, date);

-- Triggers para updated_at
CREATE OR REPLACE FUNCTION update_chatbot_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_chatbots_updated_at ON chatbots;
CREATE TRIGGER trigger_chatbots_updated_at
  BEFORE UPDATE ON chatbots
  FOR EACH ROW
  EXECUTE FUNCTION update_chatbot_updated_at();

DROP TRIGGER IF EXISTS trigger_chatbot_flows_updated_at ON chatbot_flows;
CREATE TRIGGER trigger_chatbot_flows_updated_at
  BEFORE UPDATE ON chatbot_flows
  FOR EACH ROW
  EXECUTE FUNCTION update_chatbot_updated_at();

DROP TRIGGER IF EXISTS trigger_chatbot_stats_updated_at ON chatbot_stats;
CREATE TRIGGER trigger_chatbot_stats_updated_at
  BEFORE UPDATE ON chatbot_stats
  FOR EACH ROW
  EXECUTE FUNCTION update_chatbot_updated_at();
