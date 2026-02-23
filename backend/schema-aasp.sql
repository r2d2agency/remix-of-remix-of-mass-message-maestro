-- AASP Intimações Integration

-- Add has_aasp column to plans table
ALTER TABLE plans ADD COLUMN IF NOT EXISTS has_aasp BOOLEAN DEFAULT false;

-- Stores API tokens and intimações fetched from AASP API
-- Stores API tokens and intimações fetched from AASP API

CREATE TABLE IF NOT EXISTS aasp_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  api_token TEXT NOT NULL,
  notify_phone TEXT, -- WhatsApp number to send notifications
  connection_id UUID REFERENCES connections(id) ON DELETE SET NULL, -- Connection to use for WhatsApp notifications
  is_active BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id)
);

CREATE TABLE IF NOT EXISTS aasp_intimacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  external_id TEXT, -- ID from AASP API
  jornal TEXT,
  data_publicacao DATE,
  data_disponibilizacao DATE,
  caderno TEXT,
  pagina TEXT,
  comarca TEXT,
  vara TEXT,
  processo TEXT,
  tipo TEXT,
  conteudo TEXT,
  partes TEXT,
  advogados TEXT,
  raw_data JSONB,
  notified BOOLEAN DEFAULT false,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_aasp_intimacoes_org ON aasp_intimacoes(organization_id);
CREATE INDEX IF NOT EXISTS idx_aasp_intimacoes_date ON aasp_intimacoes(data_publicacao DESC);
CREATE INDEX IF NOT EXISTS idx_aasp_intimacoes_read ON aasp_intimacoes(organization_id, read);
