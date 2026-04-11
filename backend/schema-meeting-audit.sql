-- Meeting Audit Logs & Audio Retention Schema

-- Audit log for tracking all meeting processing steps
CREATE TABLE meeting_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE NOT NULL,
  action VARCHAR(100) NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_meeting_audit_meeting ON meeting_audit_logs(meeting_id);
CREATE INDEX idx_meeting_audit_action ON meeting_audit_logs(action);
CREATE INDEX idx_meeting_audit_created ON meeting_audit_logs(created_at);

-- Add audio columns to meetings
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS audio_url VARCHAR(1000);
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS audio_expires_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS recording_duration_seconds INTEGER;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS speakers JSONB DEFAULT '[]';
