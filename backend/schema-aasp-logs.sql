-- AASP Sync Logs table
CREATE TABLE IF NOT EXISTS aasp_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  level TEXT NOT NULL DEFAULT 'info', -- info, warn, error
  event TEXT NOT NULL,
  payload JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aasp_sync_logs_org ON aasp_sync_logs(organization_id, created_at DESC);
