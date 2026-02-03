-- ============================================
-- NURTURING SEQUENCES MODULE
-- Cadências multi-canal com pausa automática
-- ============================================

-- Nurturing sequences (cadências)
CREATE TABLE IF NOT EXISTS nurturing_sequences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Basic info
    name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Trigger configuration
    trigger_type VARCHAR(50) NOT NULL DEFAULT 'manual',  -- 'manual', 'deal_stage', 'tag_added', 'form_submitted', 'webhook'
    trigger_config JSONB DEFAULT '{}',                   -- Stage ID, Tag ID, etc.
    
    -- Settings
    is_active BOOLEAN DEFAULT true,
    pause_on_reply BOOLEAN DEFAULT true,                 -- Pause when contact replies
    pause_on_deal_won BOOLEAN DEFAULT true,              -- Pause when deal is won
    exit_on_reply BOOLEAN DEFAULT false,                 -- Exit sequence entirely on reply
    
    -- Stats
    contacts_enrolled INTEGER DEFAULT 0,
    contacts_completed INTEGER DEFAULT 0,
    contacts_converted INTEGER DEFAULT 0,
    
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sequence steps (passos da cadência)
CREATE TABLE IF NOT EXISTS nurturing_sequence_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sequence_id UUID NOT NULL REFERENCES nurturing_sequences(id) ON DELETE CASCADE,
    
    -- Step config
    step_order INTEGER NOT NULL DEFAULT 1,
    delay_value INTEGER NOT NULL DEFAULT 1,              -- Delay amount
    delay_unit VARCHAR(20) NOT NULL DEFAULT 'days',      -- 'minutes', 'hours', 'days'
    
    -- Channel
    channel VARCHAR(20) NOT NULL,                        -- 'whatsapp', 'email'
    
    -- Content (WhatsApp)
    whatsapp_content TEXT,
    whatsapp_media_url TEXT,
    whatsapp_media_type VARCHAR(50),
    
    -- Content (Email)
    email_subject VARCHAR(500),
    email_body TEXT,
    email_template_id UUID,
    
    -- Conditions
    conditions JSONB DEFAULT '{}',                       -- Send only if conditions met
    skip_if_replied BOOLEAN DEFAULT true,               -- Skip this step if replied
    
    -- Stats
    sent_count INTEGER DEFAULT 0,
    opened_count INTEGER DEFAULT 0,
    clicked_count INTEGER DEFAULT 0,
    replied_count INTEGER DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(sequence_id, step_order)
);

-- Contacts enrolled in sequences
CREATE TABLE IF NOT EXISTS nurturing_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sequence_id UUID NOT NULL REFERENCES nurturing_sequences(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Contact info
    contact_phone VARCHAR(50),
    contact_email VARCHAR(255),
    contact_name VARCHAR(255),
    
    -- Related entities
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    deal_id UUID,                                        -- References crm_deals if exists
    
    -- Progress
    current_step INTEGER DEFAULT 0,
    status VARCHAR(30) NOT NULL DEFAULT 'active',        -- 'active', 'paused', 'completed', 'exited', 'converted'
    pause_reason VARCHAR(100),                           -- 'replied', 'deal_won', 'manual', etc.
    
    -- Timing
    next_step_at TIMESTAMP WITH TIME ZONE,
    enrolled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    paused_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Variables for personalization
    variables JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- One enrollment per contact per sequence
    UNIQUE(sequence_id, contact_phone)
);

-- Enrollment step history (log de execução)
CREATE TABLE IF NOT EXISTS nurturing_step_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id UUID NOT NULL REFERENCES nurturing_enrollments(id) ON DELETE CASCADE,
    step_id UUID NOT NULL REFERENCES nurturing_sequence_steps(id) ON DELETE CASCADE,
    
    -- Execution info
    channel VARCHAR(20) NOT NULL,
    status VARCHAR(30) NOT NULL,                         -- 'sent', 'failed', 'skipped', 'scheduled'
    error_message TEXT,
    
    -- Tracking
    sent_at TIMESTAMP WITH TIME ZONE,
    opened_at TIMESTAMP WITH TIME ZONE,
    clicked_at TIMESTAMP WITH TIME ZONE,
    replied_at TIMESTAMP WITH TIME ZONE,
    
    -- Message reference
    message_id VARCHAR(255),                             -- WhatsApp message ID
    email_id VARCHAR(255),                               -- Email ID
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sequences_org ON nurturing_sequences(organization_id);
CREATE INDEX IF NOT EXISTS idx_sequences_active ON nurturing_sequences(is_active);
CREATE INDEX IF NOT EXISTS idx_steps_sequence ON nurturing_sequence_steps(sequence_id, step_order);
CREATE INDEX IF NOT EXISTS idx_enrollments_sequence ON nurturing_enrollments(sequence_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_status ON nurturing_enrollments(status);
CREATE INDEX IF NOT EXISTS idx_enrollments_next ON nurturing_enrollments(next_step_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_enrollments_phone ON nurturing_enrollments(contact_phone);
CREATE INDEX IF NOT EXISTS idx_enrollments_conversation ON nurturing_enrollments(conversation_id);
CREATE INDEX IF NOT EXISTS idx_step_logs_enrollment ON nurturing_step_logs(enrollment_id);

-- Comments
COMMENT ON TABLE nurturing_sequences IS 'Multi-channel nurturing sequences with automatic pause';
COMMENT ON TABLE nurturing_sequence_steps IS 'Steps in a nurturing sequence with WhatsApp and Email support';
COMMENT ON TABLE nurturing_enrollments IS 'Contacts currently enrolled in nurturing sequences';
COMMENT ON TABLE nurturing_step_logs IS 'Execution history for each step sent';
