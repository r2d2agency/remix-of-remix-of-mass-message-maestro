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
