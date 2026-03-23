-- Sales Report Module: imported data + goals
CREATE TABLE IF NOT EXISTS sales_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    record_type VARCHAR(20) NOT NULL CHECK (record_type IN ('orcamento', 'pedido', 'faturamento')),
    record_number VARCHAR(50),
    status VARCHAR(50),
    client_name VARCHAR(500),
    value NUMERIC(15,2) DEFAULT 0,
    seller_name VARCHAR(255),
    channel VARCHAR(100),
    client_group VARCHAR(255),
    municipality VARCHAR(255),
    uf VARCHAR(5),
    margin_percent NUMERIC(8,2),
    record_date DATE NOT NULL,
    invoice_date DATE,
    raw_data JSONB,
    import_batch_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_records_org ON sales_records(organization_id);
CREATE INDEX IF NOT EXISTS idx_sales_records_type ON sales_records(organization_id, record_type);
CREATE INDEX IF NOT EXISTS idx_sales_records_date ON sales_records(organization_id, record_date);
CREATE INDEX IF NOT EXISTS idx_sales_records_batch ON sales_records(import_batch_id);

CREATE TABLE IF NOT EXISTS sales_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    goal_type VARCHAR(20) NOT NULL CHECK (goal_type IN ('orcamento', 'pedido', 'faturamento')),
    period_year INT NOT NULL,
    period_month INT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('channel', 'individual')),
    target_name VARCHAR(255) NOT NULL,
    goal_value NUMERIC(15,2) NOT NULL DEFAULT 0,
    goal_count INT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, goal_type, period_year, period_month, target_type, target_name)
);

CREATE INDEX IF NOT EXISTS idx_sales_goals_org ON sales_goals(organization_id);
