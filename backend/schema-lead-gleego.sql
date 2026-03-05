-- Add Lead Gleego module to plans
ALTER TABLE plans ADD COLUMN IF NOT EXISTS has_lead_gleego BOOLEAN DEFAULT false;

-- Add Lead Gleego API key to organizations
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS lead_gleego_api_key TEXT;
