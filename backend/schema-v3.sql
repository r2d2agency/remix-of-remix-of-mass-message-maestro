-- Blaster SaaS Database Schema v3
-- Novas funcionalidades: Blacklist, Limite mensagens, Alertas, Pausar cobranças

-- ============================================
-- PARTE 1: BLACKLIST DE CLIENTES
-- ============================================

-- Adicionar coluna blacklist na tabela de clientes Asaas
ALTER TABLE asaas_customers ADD COLUMN IF NOT EXISTS is_blacklisted BOOLEAN DEFAULT false;
ALTER TABLE asaas_customers ADD COLUMN IF NOT EXISTS blacklist_reason TEXT;
ALTER TABLE asaas_customers ADD COLUMN IF NOT EXISTS blacklisted_at TIMESTAMP WITH TIME ZONE;

-- ============================================
-- PARTE 2: PAUSAR COBRANÇAS TEMPORARIAMENTE
-- ============================================

-- Adicionar coluna para pausar cobranças por cliente
ALTER TABLE asaas_customers ADD COLUMN IF NOT EXISTS billing_paused BOOLEAN DEFAULT false;
ALTER TABLE asaas_customers ADD COLUMN IF NOT EXISTS billing_paused_until DATE;
ALTER TABLE asaas_customers ADD COLUMN IF NOT EXISTS billing_paused_reason TEXT;

-- Adicionar coluna para pausar cobranças globalmente na integração
ALTER TABLE asaas_integrations ADD COLUMN IF NOT EXISTS billing_paused BOOLEAN DEFAULT false;
ALTER TABLE asaas_integrations ADD COLUMN IF NOT EXISTS billing_paused_until DATE;
ALTER TABLE asaas_integrations ADD COLUMN IF NOT EXISTS billing_paused_reason TEXT;

-- ============================================
-- PARTE 3: LIMITE DE MENSAGENS POR CLIENTE/DIA
-- ============================================

-- Configuração de limite na integração
ALTER TABLE asaas_integrations ADD COLUMN IF NOT EXISTS daily_message_limit_per_customer INTEGER DEFAULT 3;

-- Tabela para rastrear mensagens enviadas por dia/cliente
CREATE TABLE IF NOT EXISTS billing_daily_message_count (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    customer_id UUID REFERENCES asaas_customers(id) ON DELETE CASCADE NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    message_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (organization_id, customer_id, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_msg_count_org_date ON billing_daily_message_count(organization_id, date);
CREATE INDEX IF NOT EXISTS idx_daily_msg_count_customer ON billing_daily_message_count(customer_id);

-- ============================================
-- PARTE 4: ALERTAS DE INADIMPLÊNCIA CRÍTICA
-- ============================================

-- Configuração de alertas na integração
ALTER TABLE asaas_integrations ADD COLUMN IF NOT EXISTS critical_alert_threshold DECIMAL(10,2) DEFAULT 1000.00;
ALTER TABLE asaas_integrations ADD COLUMN IF NOT EXISTS critical_alert_days INTEGER DEFAULT 30;
ALTER TABLE asaas_integrations ADD COLUMN IF NOT EXISTS alert_email VARCHAR(255);
ALTER TABLE asaas_integrations ADD COLUMN IF NOT EXISTS alert_whatsapp VARCHAR(50);
ALTER TABLE asaas_integrations ADD COLUMN IF NOT EXISTS alert_connection_id UUID REFERENCES connections(id) ON DELETE SET NULL;

-- Tabela de alertas gerados
CREATE TABLE IF NOT EXISTS billing_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    customer_id UUID REFERENCES asaas_customers(id) ON DELETE CASCADE,
    alert_type VARCHAR(50) NOT NULL, -- 'critical_customer', 'threshold_exceeded', 'long_overdue'
    title VARCHAR(255) NOT NULL,
    description TEXT,
    total_overdue DECIMAL(10,2),
    days_overdue INTEGER,
    is_read BOOLEAN DEFAULT false,
    is_resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_alerts_org ON billing_alerts(organization_id);
CREATE INDEX IF NOT EXISTS idx_billing_alerts_unread ON billing_alerts(organization_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_billing_alerts_customer ON billing_alerts(customer_id);
