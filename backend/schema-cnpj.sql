-- CNPJ Lookup Config (Gleego API)
CREATE TABLE IF NOT EXISTS cnpj_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  api_token TEXT NOT NULL DEFAULT '',
  base_url TEXT NOT NULL DEFAULT 'https://cnpj.gleego.com.br',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id)
);
