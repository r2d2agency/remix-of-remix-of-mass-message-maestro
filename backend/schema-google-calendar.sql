-- Google Calendar Integration Schema
-- Armazena tokens OAuth por usuário para integração com Google Calendar

-- ============================================
-- GOOGLE OAUTH TOKENS
-- ============================================

CREATE TABLE IF NOT EXISTS google_oauth_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    
    -- Token data
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    token_type VARCHAR(50) DEFAULT 'Bearer',
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    scope TEXT,
    
    -- Google account info
    google_email VARCHAR(255),
    google_name VARCHAR(255),
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    last_sync_at TIMESTAMP WITH TIME ZONE,
    last_error TEXT,
    
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
    
    -- CRM reference (task or deal)
    crm_task_id UUID REFERENCES crm_tasks(id) ON DELETE CASCADE,
    crm_deal_id UUID REFERENCES crm_deals(id) ON DELETE SET NULL,
    
    -- Google Calendar event ID
    google_event_id VARCHAR(255) NOT NULL,
    google_calendar_id VARCHAR(255) DEFAULT 'primary',
    
    -- Event details (cached for display)
    event_summary VARCHAR(500),
    event_start TIMESTAMP WITH TIME ZONE,
    event_end TIMESTAMP WITH TIME ZONE,
    meet_link VARCHAR(500),
    
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
CREATE INDEX IF NOT EXISTS idx_google_oauth_active ON google_oauth_tokens(is_active);
CREATE INDEX IF NOT EXISTS idx_google_calendar_events_user ON google_calendar_events(user_id);
CREATE INDEX IF NOT EXISTS idx_google_calendar_events_task ON google_calendar_events(crm_task_id);
CREATE INDEX IF NOT EXISTS idx_google_calendar_events_deal ON google_calendar_events(crm_deal_id);
CREATE INDEX IF NOT EXISTS idx_google_calendar_events_google_id ON google_calendar_events(google_event_id);
CREATE INDEX IF NOT EXISTS idx_google_calendar_events_start ON google_calendar_events(event_start);

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
