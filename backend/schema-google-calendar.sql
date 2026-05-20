-- Google Calendar Integration Schema
-- Armazena tokens OAuth por usuário para integração com Google Calendar

-- ============================================
-- GOOGLE OAUTH TOKENS
-- ============================================

CREATE TABLE IF NOT EXISTS google_oauth_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Token data
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    token_type VARCHAR(50) DEFAULT 'Bearer',
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    scope TEXT,
    
    -- Google account info
    google_email VARCHAR(255),
    google_name VARCHAR(255),
    
    -- Selected calendars (JSON array of calendar IDs to show in CRM, null = all)
    selected_calendars JSONB DEFAULT NULL,
    -- Default calendar ID for creating events (null = primary)
    default_calendar_id VARCHAR(255) DEFAULT NULL,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    last_sync_at TIMESTAMP WITH TIME ZONE,
    last_error TEXT,
    sync_tokens JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- SYNCED CALENDAR EVENTS
-- ============================================

-- Mapeamento entre eventos do CRM e eventos do Google Calendar
CREATE TABLE IF NOT EXISTS google_calendar_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- CRM reference (task or deal)
    crm_task_id UUID REFERENCES crm_tasks(id) ON DELETE CASCADE,
    crm_deal_id UUID REFERENCES crm_deals(id) ON DELETE SET NULL,
    
    -- Google Calendar event ID
    google_event_id VARCHAR(255) NOT NULL,
    google_calendar_id VARCHAR(255) DEFAULT 'primary',
    
    -- Event details (cached for display)
    event_summary VARCHAR(500),
    description TEXT,
    location TEXT,
    event_start TIMESTAMP WITH TIME ZONE,
    event_end TIMESTAMP WITH TIME ZONE,
    timezone VARCHAR(100) DEFAULT 'America/Sao_Paulo',
    status VARCHAR(50) DEFAULT 'confirmed',
    html_link TEXT,
    meet_link VARCHAR(500),
    attendees_json JSONB DEFAULT '[]'::jsonb,
    reminders_json JSONB DEFAULT '{}'::jsonb,
    google_created_at TIMESTAMP WITH TIME ZONE,
    google_updated_at TIMESTAMP WITH TIME ZONE,
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_by_legal_gleego BOOLEAN DEFAULT false,
    source VARCHAR(50) DEFAULT 'google',
    
    -- Sync status
    sync_status VARCHAR(20) DEFAULT 'synced', -- synced, pending_update, pending_delete, error
    last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(user_id, crm_task_id),
    UNIQUE(user_id, google_event_id)
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_google_oauth_user ON google_oauth_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_google_oauth_org ON google_oauth_tokens(organization_id);
CREATE INDEX IF NOT EXISTS idx_google_oauth_active ON google_oauth_tokens(is_active);
CREATE INDEX IF NOT EXISTS idx_google_calendar_events_user ON google_calendar_events(user_id);
CREATE INDEX IF NOT EXISTS idx_google_calendar_events_org ON google_calendar_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_google_calendar_events_task ON google_calendar_events(crm_task_id);
CREATE INDEX IF NOT EXISTS idx_google_calendar_events_deal ON google_calendar_events(crm_deal_id);
CREATE INDEX IF NOT EXISTS idx_google_calendar_events_google_id ON google_calendar_events(google_event_id);
CREATE INDEX IF NOT EXISTS idx_google_calendar_events_start ON google_calendar_events(event_start);

CREATE TABLE IF NOT EXISTS google_calendar_sync_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    sync_type VARCHAR(50) DEFAULT 'manual',
    status VARCHAR(30) NOT NULL DEFAULT 'running',
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    finished_at TIMESTAMP WITH TIME ZONE,
    events_created INTEGER DEFAULT 0,
    events_updated INTEGER DEFAULT 0,
    events_cancelled INTEGER DEFAULT 0,
    events_failed INTEGER DEFAULT 0,
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_google_calendar_sync_logs_user ON google_calendar_sync_logs(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_google_calendar_sync_logs_org ON google_calendar_sync_logs(organization_id, started_at DESC);

-- ============================================
-- TRIGGERS
-- ============================================

CREATE OR REPLACE FUNCTION update_google_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_google_oauth_updated ON google_oauth_tokens;
CREATE TRIGGER trigger_google_oauth_updated
    BEFORE UPDATE ON google_oauth_tokens
    FOR EACH ROW
    EXECUTE FUNCTION update_google_updated_at();

DROP TRIGGER IF EXISTS trigger_google_calendar_updated ON google_calendar_events;
CREATE TRIGGER trigger_google_calendar_updated
    BEFORE UPDATE ON google_calendar_events
    FOR EACH ROW
    EXECUTE FUNCTION update_google_updated_at();
