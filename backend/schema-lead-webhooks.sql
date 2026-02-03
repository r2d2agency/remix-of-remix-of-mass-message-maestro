-- Lead Webhooks Schema
-- Sistema de webhooks genéricos para captura de leads de integrações externas

-- Webhooks configuration table
CREATE TABLE IF NOT EXISTS lead_webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    webhook_token VARCHAR(64) NOT NULL UNIQUE,
    is_active BOOLEAN DEFAULT true,
    
    -- Target CRM configuration
    funnel_id UUID REFERENCES crm_funnels(id) ON DELETE SET NULL,
    stage_id UUID REFERENCES crm_stages(id) ON DELETE SET NULL,
    owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Field mapping (JSON: { "source_field": "target_field" })
    -- target_field can be: name, email, phone, company_name, value, description, custom_fields
    field_mapping JSONB DEFAULT '{}',
    
    -- Default values if not provided
    default_value DECIMAL(15,2) DEFAULT 0,
    default_probability INTEGER DEFAULT 10,
    
    -- Stats
    total_leads INTEGER DEFAULT 0,
    last_lead_at TIMESTAMP WITH TIME ZONE,
    
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Lead webhook logs (for debugging and audit)
CREATE TABLE IF NOT EXISTS lead_webhook_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id UUID NOT NULL REFERENCES lead_webhooks(id) ON DELETE CASCADE,
    request_body JSONB,
    response_status INTEGER,
    response_message TEXT,
    deal_id UUID REFERENCES crm_deals(id) ON DELETE SET NULL,
    prospect_id UUID REFERENCES crm_prospects(id) ON DELETE SET NULL,
    source_ip VARCHAR(50),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lead_webhooks_org ON lead_webhooks(organization_id);
CREATE INDEX IF NOT EXISTS idx_lead_webhooks_token ON lead_webhooks(webhook_token);
CREATE INDEX IF NOT EXISTS idx_lead_webhook_logs_webhook ON lead_webhook_logs(webhook_id);
CREATE INDEX IF NOT EXISTS idx_lead_webhook_logs_created ON lead_webhook_logs(created_at DESC);
