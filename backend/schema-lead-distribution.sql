-- Schema para Distribuição Automática de Leads por Conexão
-- Permite configurar round-robin de leads novos para usuários específicos

-- Adicionar colunas na tabela connections para controlar distribuição
DO $$ BEGIN
    ALTER TABLE connections ADD COLUMN IF NOT EXISTS lead_distribution_enabled BOOLEAN DEFAULT false;
EXCEPTION WHEN duplicate_column THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE connections ADD COLUMN IF NOT EXISTS lead_distribution_last_user_index INTEGER DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN null; END $$;

-- Tabela de usuários elegíveis para distribuição de leads em cada conexão
CREATE TABLE IF NOT EXISTS connection_lead_distribution (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID REFERENCES connections(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 0, -- Maior prioridade = recebe mais leads
    max_leads_per_day INTEGER, -- Limite diário (NULL = sem limite)
    leads_today INTEGER DEFAULT 0,
    last_lead_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (connection_id, user_id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_connection_lead_dist_conn ON connection_lead_distribution(connection_id);
CREATE INDEX IF NOT EXISTS idx_connection_lead_dist_user ON connection_lead_distribution(user_id);
CREATE INDEX IF NOT EXISTS idx_connection_lead_dist_active ON connection_lead_distribution(is_active);

-- Tabela de log de distribuição (para auditoria e relatórios)
CREATE TABLE IF NOT EXISTS lead_distribution_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID REFERENCES connections(id) ON DELETE CASCADE NOT NULL,
    conversation_id UUID,
    contact_phone VARCHAR(50),
    contact_name VARCHAR(255),
    assigned_to_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    distribution_method VARCHAR(20) DEFAULT 'round_robin', -- round_robin, priority, manual
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_dist_log_conn ON lead_distribution_log(connection_id);
CREATE INDEX IF NOT EXISTS idx_lead_dist_log_user ON lead_distribution_log(assigned_to_user_id);
CREATE INDEX IF NOT EXISTS idx_lead_dist_log_date ON lead_distribution_log(created_at);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_lead_distribution_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_lead_distribution_updated_at ON connection_lead_distribution;
CREATE TRIGGER trigger_lead_distribution_updated_at
  BEFORE UPDATE ON connection_lead_distribution
  FOR EACH ROW
  EXECUTE FUNCTION update_lead_distribution_updated_at();

-- Reset diário dos contadores de leads
CREATE OR REPLACE FUNCTION reset_daily_lead_counts()
RETURNS void AS $$
BEGIN
  UPDATE connection_lead_distribution 
  SET leads_today = 0 
  WHERE leads_today > 0;
END;
$$ LANGUAGE plpgsql;
