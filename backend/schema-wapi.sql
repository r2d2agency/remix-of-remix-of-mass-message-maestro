-- Schema for W-API support
-- Adds provider field to connections table to support multiple WhatsApp API providers

-- Add provider column to connections if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'connections' 
        AND column_name = 'provider'
    ) THEN
        ALTER TABLE connections 
        ADD COLUMN provider VARCHAR(20) DEFAULT 'evolution';
        
        COMMENT ON COLUMN connections.provider IS 'WhatsApp API provider: evolution, wapi';
    END IF;
END $$;

-- Add instance_id column for W-API (they call it instanceId)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'connections' 
        AND column_name = 'instance_id'
    ) THEN
        ALTER TABLE connections 
        ADD COLUMN instance_id VARCHAR(255);
        
        COMMENT ON COLUMN connections.instance_id IS 'W-API instance ID (different from instance_name used by Evolution)';
    END IF;
END $$;

-- Add token column for W-API (they use Bearer token instead of apikey)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'connections' 
        AND column_name = 'wapi_token'
    ) THEN
        ALTER TABLE connections 
        ADD COLUMN wapi_token TEXT;
        
        COMMENT ON COLUMN connections.wapi_token IS 'W-API Bearer token for authentication';
    END IF;
END $$;

-- Update provider for existing connections
UPDATE connections 
SET provider = 'evolution' 
WHERE provider IS NULL;

-- IMPORTANT: allow W-API rows by making Evolution-only fields nullable
-- (application layer already validates required fields per provider)
DO $$ BEGIN
    ALTER TABLE connections ALTER COLUMN api_url DROP NOT NULL;
EXCEPTION WHEN others THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE connections ALTER COLUMN api_key DROP NOT NULL;
EXCEPTION WHEN others THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE connections ALTER COLUMN instance_name DROP NOT NULL;
EXCEPTION WHEN others THEN null; END $$;

-- Enforce provider + required fields at DB level
DO $$
BEGIN
    -- Ensure provider is not null
    BEGIN
        ALTER TABLE connections ALTER COLUMN provider SET DEFAULT 'evolution';
        UPDATE connections SET provider = 'evolution' WHERE provider IS NULL;
        ALTER TABLE connections ALTER COLUMN provider SET NOT NULL;
    EXCEPTION WHEN others THEN null; END;

    -- Provider must be one of the supported values
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'connections_provider_chk'
    ) THEN
        ALTER TABLE connections
        ADD CONSTRAINT connections_provider_chk
        CHECK (provider IN ('evolution', 'wapi'));
    END IF;

    -- Required fields per provider
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'connections_provider_required_fields_chk'
    ) THEN
        ALTER TABLE connections
        ADD CONSTRAINT connections_provider_required_fields_chk
        CHECK (
            (provider = 'wapi' AND instance_id IS NOT NULL AND wapi_token IS NOT NULL)
            OR
            (provider = 'evolution' AND api_url IS NOT NULL AND api_key IS NOT NULL AND instance_name IS NOT NULL)
        );
    END IF;
END $$;

