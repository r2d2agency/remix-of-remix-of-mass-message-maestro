-- Alerts table for scheduled message notifications
-- Run this in your PostgreSQL database

CREATE TABLE IF NOT EXISTS user_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL DEFAULT 'scheduled_message_sent',
  title VARCHAR(255) NOT NULL,
  message TEXT,
  metadata JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_alerts_user_id ON user_alerts(user_id);
CREATE INDEX idx_user_alerts_unread ON user_alerts(user_id, is_read) WHERE is_read = false;
CREATE INDEX idx_user_alerts_created_at ON user_alerts(created_at);
