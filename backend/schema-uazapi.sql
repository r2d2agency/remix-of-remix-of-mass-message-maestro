-- Schema for UAZAPI support (https://docs.uazapi.com/)
-- Adds 'uazapi' as a valid provider for the connections table
-- and creates a global UAZAPI server configuration table (super-admin scope)

-- =====================================================
-- 1. Extend connections.provider to allow 'uazapi'
-- =====================================================

-- Add new uazapi-specific columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='connections' AND column_name='uazapi_token'
  ) THEN
    ALTER TABLE connections ADD COLUMN uazapi_token TEXT;
    COMMENT ON COLUMN connections.uazapi_token IS 'UAZAPI per-instance token (header "token")';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='connections' AND column_name='uazapi_instance_name'
  ) THEN
    ALTER TABLE connections ADD COLUMN uazapi_instance_name VARCHAR(255);
    COMMENT ON COLUMN connections.uazapi_instance_name IS 'UAZAPI instance name (used to identify the instance on the server)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='connections' AND column_name='uazapi_server_url'
  ) THEN
    ALTER TABLE connections ADD COLUMN uazapi_server_url VARCHAR(500);
    COMMENT ON COLUMN connections.uazapi_server_url IS 'UAZAPI server URL (e.g. https://my.uazapi.com) — copied from global config at creation time';
  END IF;
END $$;

-- Drop and recreate provider check constraint to include 'uazapi'
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'connections_provider_chk'
  ) THEN
    ALTER TABLE connections DROP CONSTRAINT connections_provider_chk;
  END IF;

  ALTER TABLE connections
    ADD CONSTRAINT connections_provider_chk
    CHECK (provider IN ('evolution', 'wapi', 'uazapi'));
END $$;

-- Drop and recreate per-provider required-fields constraint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'connections_provider_required_fields_chk'
  ) THEN
    ALTER TABLE connections DROP CONSTRAINT connections_provider_required_fields_chk;
  END IF;

  ALTER TABLE connections
    ADD CONSTRAINT connections_provider_required_fields_chk
    CHECK (
      (provider = 'wapi'      AND instance_id IS NOT NULL AND wapi_token IS NOT NULL)
      OR
      (provider = 'evolution' AND api_url IS NOT NULL AND api_key IS NOT NULL AND instance_name IS NOT NULL)
      OR
      (provider = 'uazapi'    AND uazapi_token IS NOT NULL AND uazapi_server_url IS NOT NULL)
    );
END $$;

-- =====================================================
-- 2. Global UAZAPI server config (super-admin)
-- =====================================================
-- One row per registered server. For now we use a single global server
-- (super-admin chooses which one is active via is_default = true).

CREATE TABLE IF NOT EXISTS uazapi_servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  server_url VARCHAR(500) NOT NULL,
  admin_token TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_uazapi_servers_default
  ON uazapi_servers(is_default) WHERE is_default = TRUE;

-- Only one default server at a time
CREATE UNIQUE INDEX IF NOT EXISTS uniq_uazapi_default_server
  ON uazapi_servers((is_default)) WHERE is_default = TRUE;

-- =====================================================
-- 3. Webhook audit table specifically for UAZAPI
-- =====================================================
CREATE TABLE IF NOT EXISTS uazapi_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID REFERENCES connections(id) ON DELETE CASCADE,
  event_type VARCHAR(100),
  payload JSONB NOT NULL,
  status VARCHAR(50) DEFAULT 'received',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_uazapi_webhook_conn ON uazapi_webhook_events(connection_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_uazapi_webhook_type ON uazapi_webhook_events(event_type);

-- =====================================================
-- 4. Auto-update updated_at on uazapi_servers
-- =====================================================
CREATE OR REPLACE FUNCTION uazapi_servers_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_uazapi_servers_touch ON uazapi_servers;
CREATE TRIGGER trg_uazapi_servers_touch
  BEFORE UPDATE ON uazapi_servers
  FOR EACH ROW EXECUTE FUNCTION uazapi_servers_touch_updated_at();
