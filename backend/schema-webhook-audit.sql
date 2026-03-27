-- Webhook audit table: logs every inbound webhook event BEFORE processing
-- Allows comparing what the provider sent vs what the system actually processed

CREATE TABLE IF NOT EXISTS inbound_webhook_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(20) NOT NULL,           -- 'wapi' or 'evolution'
  event_id VARCHAR(255),                   -- message ID from provider
  event_type VARCHAR(100),                 -- e.g. 'message', 'ack', 'status'
  remote_jid VARCHAR(255),                 -- chat/group JID
  instance_id VARCHAR(255),                -- instance identifier
  connection_id UUID,                      -- matched connection (null if not found)
  from_me BOOLEAN,
  processed BOOLEAN DEFAULT false,         -- true if it was actually saved to chat_messages
  process_result VARCHAR(50),              -- 'saved', 'skipped', 'error', 'duplicate'
  process_error TEXT,                      -- error message if failed
  payload JSONB,                           -- full raw payload (truncated if too large)
  received_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint to avoid duplicate audit entries
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_audit_provider_event 
  ON inbound_webhook_audit(provider, event_id) WHERE event_id IS NOT NULL;

-- Index for querying by connection and time
CREATE INDEX IF NOT EXISTS idx_webhook_audit_connection_time 
  ON inbound_webhook_audit(connection_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_audit_received 
  ON inbound_webhook_audit(received_at DESC);

-- Auto-cleanup: keep only last 7 days
-- (run periodically via cron or on insert trigger)
