-- CRM Database Schema
-- Sistema de CRM com Kanban, Empresas, Contatos e Negociações

-- ============================================
-- GRUPOS DE USUÁRIOS (para permissões CRM)
-- ============================================

CREATE TABLE IF NOT EXISTS crm_user_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(organization_id, name)
);

CREATE TABLE IF NOT EXISTS crm_user_group_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID REFERENCES crm_user_groups(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    is_supervisor BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(group_id, user_id)
);

-- ============================================
-- FUNIS E ETAPAS
-- ============================================

CREATE TABLE IF NOT EXISTS crm_funnels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    color VARCHAR(20) DEFAULT '#6366f1',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(organization_id, name)
);

CREATE TABLE IF NOT EXISTS crm_stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    funnel_id UUID REFERENCES crm_funnels(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(20) DEFAULT '#6366f1',
    position INTEGER NOT NULL DEFAULT 0,
    -- Regra de inatividade por etapa
    inactivity_hours INTEGER DEFAULT 24,
    inactivity_color VARCHAR(20) DEFAULT '#ef4444',
    is_final BOOLEAN DEFAULT false, -- Etapa final (ganhou/perdeu)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- EMPRESAS
-- ============================================

CREATE TABLE IF NOT EXISTS crm_companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(255) NOT NULL,
    cnpj VARCHAR(20),
    email VARCHAR(255),
    phone VARCHAR(50),
    website VARCHAR(500),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(50),
    zip_code VARCHAR(20),
    notes TEXT,
    custom_fields JSONB DEFAULT '{}',
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- NEGOCIAÇÕES (DEALS)
-- ============================================

CREATE TABLE IF NOT EXISTS crm_deals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    funnel_id UUID REFERENCES crm_funnels(id) ON DELETE CASCADE NOT NULL,
    stage_id UUID REFERENCES crm_stages(id) ON DELETE SET NULL,
    company_id UUID REFERENCES crm_companies(id) ON DELETE CASCADE NOT NULL,
    
    -- Responsável
    owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
    group_id UUID REFERENCES crm_user_groups(id) ON DELETE SET NULL,
    
    -- Dados da negociação
    title VARCHAR(255) NOT NULL,
    value DECIMAL(15, 2) DEFAULT 0,
    probability INTEGER DEFAULT 50, -- % de fechamento
    expected_close_date DATE,
    
    -- Status
    status VARCHAR(20) DEFAULT 'open', -- open, won, lost
    won_at TIMESTAMP WITH TIME ZONE,
    lost_at TIMESTAMP WITH TIME ZONE,
    lost_reason TEXT,
    
    -- Tracking de atividade
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_opened_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Dados extras
    description TEXT,
    tags TEXT[],
    custom_fields JSONB DEFAULT '{}',
    
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Contatos vinculados à negociação
CREATE TABLE IF NOT EXISTS crm_deal_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id UUID REFERENCES crm_deals(id) ON DELETE CASCADE NOT NULL,
    contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE NOT NULL,
    is_primary BOOLEAN DEFAULT false,
    role VARCHAR(100), -- Ex: "Decisor", "Influenciador"
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(deal_id, contact_id)
);

-- Histórico de movimentação da negociação
CREATE TABLE IF NOT EXISTS crm_deal_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id UUID REFERENCES crm_deals(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL, -- created, stage_changed, value_changed, etc
    from_value TEXT,
    to_value TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- TAREFAS
-- ============================================

CREATE TABLE IF NOT EXISTS crm_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    
    -- Vínculo opcional com negociação
    deal_id UUID REFERENCES crm_deals(id) ON DELETE CASCADE,
    company_id UUID REFERENCES crm_companies(id) ON DELETE CASCADE,
    
    -- Responsável
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Dados da tarefa
    title VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(50) DEFAULT 'task', -- task, call, email, meeting, follow_up
    priority VARCHAR(20) DEFAULT 'medium', -- low, medium, high, urgent
    
    -- Agendamento
    due_date TIMESTAMP WITH TIME ZONE,
    reminder_at TIMESTAMP WITH TIME ZONE,
    
    -- Status
    status VARCHAR(20) DEFAULT 'pending', -- pending, in_progress, completed, cancelled
    completed_at TIMESTAMP WITH TIME ZONE,
    completed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_crm_user_groups_org ON crm_user_groups(organization_id);
CREATE INDEX IF NOT EXISTS idx_crm_user_group_members_group ON crm_user_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_crm_user_group_members_user ON crm_user_group_members(user_id);

CREATE INDEX IF NOT EXISTS idx_crm_funnels_org ON crm_funnels(organization_id);
CREATE INDEX IF NOT EXISTS idx_crm_stages_funnel ON crm_stages(funnel_id);
CREATE INDEX IF NOT EXISTS idx_crm_stages_position ON crm_stages(funnel_id, position);

CREATE INDEX IF NOT EXISTS idx_crm_companies_org ON crm_companies(organization_id);
CREATE INDEX IF NOT EXISTS idx_crm_companies_name ON crm_companies(organization_id, name);

CREATE INDEX IF NOT EXISTS idx_crm_deals_org ON crm_deals(organization_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_funnel ON crm_deals(funnel_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_stage ON crm_deals(stage_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_company ON crm_deals(company_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_owner ON crm_deals(owner_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_group ON crm_deals(group_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_status ON crm_deals(status);
CREATE INDEX IF NOT EXISTS idx_crm_deals_activity ON crm_deals(last_activity_at);

CREATE INDEX IF NOT EXISTS idx_crm_deal_contacts_deal ON crm_deal_contacts(deal_id);
CREATE INDEX IF NOT EXISTS idx_crm_deal_contacts_contact ON crm_deal_contacts(contact_id);

CREATE INDEX IF NOT EXISTS idx_crm_deal_history_deal ON crm_deal_history(deal_id);

CREATE INDEX IF NOT EXISTS idx_crm_tasks_org ON crm_tasks(organization_id);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_deal ON crm_tasks(deal_id);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_assigned ON crm_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_due ON crm_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_status ON crm_tasks(status);
