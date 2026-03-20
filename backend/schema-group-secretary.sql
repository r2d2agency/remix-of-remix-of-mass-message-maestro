-- ==========================================
-- GROUP SECRETARY (AI Secretary for Groups)
-- ==========================================

-- Configuration per organization for which groups to monitor
CREATE TABLE IF NOT EXISTS group_secretary_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    -- Which connections/groups to monitor (null = all groups)
    connection_ids UUID[] DEFAULT NULL,
    group_jids TEXT[] DEFAULT NULL,
    -- AI config override (null = use org defaults)
    ai_provider VARCHAR(20),
    ai_model VARCHAR(100),
    ai_api_key TEXT,
    -- Behavior settings
    create_crm_task BOOLEAN DEFAULT true,
    show_popup_alert BOOLEAN DEFAULT true,
    min_confidence DECIMAL(3,2) DEFAULT 0.6,
    -- Task board config: which column to create cards in
    task_board_column_id UUID DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(organization_id)
);

-- Member aliases and role mapping for identification
CREATE TABLE IF NOT EXISTS group_secretary_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    -- Aliases: names/nicknames people may use to refer to this person
    aliases TEXT[] DEFAULT '{}',
    -- Role/department description for context-based identification
    role_description TEXT,
    -- Departments/areas this person handles
    departments TEXT[] DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(organization_id, user_id)
);

-- Log of AI secretary detections
CREATE TABLE IF NOT EXISTS group_secretary_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    message_content TEXT,
    sender_name TEXT,
    detected_request TEXT,
    matched_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    matched_user_name TEXT,
    confidence DECIMAL(3,2),
    crm_task_id UUID REFERENCES crm_tasks(id) ON DELETE SET NULL,
    alert_id UUID REFERENCES user_alerts(id) ON DELETE SET NULL,
    ai_provider VARCHAR(20),
    ai_model VARCHAR(50),
    processing_time_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_group_secretary_config_org ON group_secretary_config(organization_id);
CREATE INDEX IF NOT EXISTS idx_group_secretary_members_org ON group_secretary_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_group_secretary_members_user ON group_secretary_members(user_id);
CREATE INDEX IF NOT EXISTS idx_group_secretary_logs_org ON group_secretary_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_group_secretary_logs_conv ON group_secretary_logs(conversation_id);
CREATE INDEX IF NOT EXISTS idx_group_secretary_logs_matched ON group_secretary_logs(matched_user_id);
CREATE INDEX IF NOT EXISTS idx_group_secretary_logs_created ON group_secretary_logs(created_at);
