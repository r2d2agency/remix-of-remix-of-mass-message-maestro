-- Migration to improve Google Calendar integration

-- 1. Ensure google_oauth_tokens has all needed columns
ALTER TABLE google_oauth_tokens 
ADD COLUMN IF NOT EXISTS selected_calendars JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS default_calendar_id TEXT,
ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_error TEXT,
ADD COLUMN IF NOT EXISTS sync_tokens JSONB DEFAULT '{}'; -- Maps calendar_id -> syncToken

-- 2. Enhance google_calendar_events table
ALTER TABLE google_calendar_events
ADD COLUMN IF NOT EXISTS tenant_id INTEGER,
ADD COLUMN IF NOT EXISTS google_calendar_id TEXT,
ADD COLUMN IF NOT EXISTS meeting_id INTEGER,
ADD COLUMN IF NOT EXISTS client_id INTEGER,
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS location TEXT,
ADD COLUMN IF NOT EXISTS start_datetime TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS end_datetime TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS timezone TEXT,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'confirmed',
ADD COLUMN IF NOT EXISTS html_link TEXT,
ADD COLUMN IF NOT EXISTS meet_link TEXT,
ADD COLUMN IF NOT EXISTS attendees_json JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS reminders_json JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'google', -- google, crm_task, meeting, ai_scheduling
ADD COLUMN IF NOT EXISTS created_by_legal_gleego BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS google_created_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS google_updated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS last_error TEXT,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_gce_user_id ON google_calendar_events(user_id);
CREATE INDEX IF NOT EXISTS idx_gce_google_event_id ON google_calendar_events(google_event_id);
CREATE INDEX IF NOT EXISTS idx_gce_crm_task_id ON google_calendar_events(crm_task_id);
CREATE INDEX IF NOT EXISTS idx_gce_crm_deal_id ON google_calendar_events(crm_deal_id);

-- 3. Create sync logs table
CREATE TABLE IF NOT EXISTS google_calendar_sync_logs (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER,
    user_id INTEGER NOT NULL,
    google_calendar_id TEXT,
    sync_type TEXT, -- manual, automatic, full_sync, incremental_sync
    status TEXT, -- success, failed
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    finished_at TIMESTAMP WITH TIME ZONE,
    events_created INTEGER DEFAULT 0,
    events_updated INTEGER DEFAULT 0,
    events_cancelled INTEGER DEFAULT 0,
    events_failed INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure we have unique constraint for better upserting
-- Depending on existing data, this might fail, but it's important for the new logic
-- We'll try to add it, but if it fails we'll handle it in code
-- ALTER TABLE google_calendar_events ADD CONSTRAINT unique_google_event UNIQUE (user_id, google_event_id);
