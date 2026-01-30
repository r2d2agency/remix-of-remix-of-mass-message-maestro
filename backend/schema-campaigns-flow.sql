-- Add flow_id column to campaigns table to support flow-based campaigns
-- Run this migration on your database

-- Add flow_id column
ALTER TABLE campaigns
ADD COLUMN IF NOT EXISTS flow_id UUID REFERENCES flows(id) ON DELETE SET NULL;

-- Add index for flow-based campaign queries
CREATE INDEX IF NOT EXISTS idx_campaigns_flow_id ON campaigns(flow_id);

-- Comment for documentation
COMMENT ON COLUMN campaigns.flow_id IS 'Reference to flow for flow-based campaigns. Either message_id or flow_id should be set, not both.';
