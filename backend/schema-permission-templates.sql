-- ============================================
-- PERMISSION TEMPLATES MODULE
-- Templates de permissão granular por módulo/ferramenta
-- ============================================

-- Permission templates
CREATE TABLE IF NOT EXISTS permission_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Permissions map: { "chat": true, "crm": true, "crm_deals": false, ... }
    permissions JSONB NOT NULL DEFAULT '{}',
    
    is_default BOOLEAN DEFAULT false,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add permission_template_id to organization_members
ALTER TABLE organization_members 
ADD COLUMN IF NOT EXISTS permission_template_id UUID REFERENCES permission_templates(id) ON DELETE SET NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_perm_templates_org ON permission_templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_perm_template ON organization_members(permission_template_id);

COMMENT ON TABLE permission_templates IS 'Permission templates defining granular access to modules and features';
