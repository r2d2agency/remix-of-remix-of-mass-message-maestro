import express from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { logInfo, logError } from '../logger.js';

const router = express.Router();
router.use(authenticate);

async function getUserOrg(userId) {
  const r = await query(`SELECT om.organization_id, om.role FROM organization_members om WHERE om.user_id = $1 LIMIT 1`, [userId]);
  return r.rows[0];
}

// Import sales records (bulk)
router.post('/import', async (req, res) => {
  try {
    const org = await getUserOrg(req.user.id);
    if (!org) return res.status(403).json({ error: 'Sem organização' });
    if (!['owner', 'admin', 'manager'].includes(org.role)) return res.status(403).json({ error: 'Sem permissão' });

    const { records, record_type } = req.body;
    if (!records?.length || !record_type) return res.status(400).json({ error: 'Dados inválidos' });

    const batchId = require('crypto').randomUUID();

    // Delete old records of same type for this org before importing
    await query(`DELETE FROM sales_records WHERE organization_id = $1 AND record_type = $2`, [org.organization_id, record_type]);

    let imported = 0;
    for (const r of records) {
      await query(
        `INSERT INTO sales_records (organization_id, record_type, record_number, status, client_name, value, seller_name, channel, client_group, municipality, uf, margin_percent, record_date, invoice_date, raw_data, import_batch_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [
          org.organization_id, record_type,
          r.record_number || null, r.status || null, r.client_name || null,
          r.value || 0, r.seller_name || null, r.channel || null,
          r.client_group || null, r.municipality || null, r.uf || null,
          r.margin_percent || null, r.record_date || new Date().toISOString().slice(0,10),
          r.invoice_date || null, r.raw_data ? JSON.stringify(r.raw_data) : null,
          batchId
        ]
      );
      imported++;
    }

    res.json({ imported, batch_id: batchId });
  } catch (err) {
    logError('sales-report import error', err);
    res.status(500).json({ error: err.message });
  }
});

// Get report summary
router.get('/summary', async (req, res) => {
  try {
    const org = await getUserOrg(req.user.id);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const { start_date, end_date, record_type } = req.query;
    let dateFilter = '';
    const params = [org.organization_id];
    let pi = 2;

    if (start_date) { dateFilter += ` AND record_date >= $${pi}`; params.push(start_date); pi++; }
    if (end_date) { dateFilter += ` AND record_date <= $${pi}`; params.push(end_date); pi++; }
    if (record_type) { dateFilter += ` AND record_type = $${pi}`; params.push(record_type); pi++; }

    // Total by type
    const totals = await query(
      `SELECT record_type, COUNT(*) as count, COALESCE(SUM(value),0) as total_value
       FROM sales_records WHERE organization_id = $1 ${dateFilter}
       GROUP BY record_type ORDER BY record_type`,
      params
    );

    // By channel
    const byChannel = await query(
      `SELECT record_type, COALESCE(NULLIF(channel,''), 'Sem Canal') as channel, COUNT(*) as count, COALESCE(SUM(value),0) as total_value
       FROM sales_records WHERE organization_id = $1 ${dateFilter}
       GROUP BY record_type, channel ORDER BY record_type, total_value DESC`,
      params
    );

    // By seller (individual)
    const bySeller = await query(
      `SELECT record_type, COALESCE(seller_name, 'Sem Vendedor') as seller_name, COUNT(*) as count, COALESCE(SUM(value),0) as total_value
       FROM sales_records WHERE organization_id = $1 ${dateFilter}
       GROUP BY record_type, seller_name ORDER BY record_type, total_value DESC`,
      params
    );

    res.json({
      totals: totals.rows,
      byChannel: byChannel.rows,
      bySeller: bySeller.rows,
    });
  } catch (err) {
    logError('sales-report summary error', err);
    res.status(500).json({ error: err.message });
  }
});

// Get distinct channels and sellers for autocomplete
router.get('/dimensions', async (req, res) => {
  try {
    const org = await getUserOrg(req.user.id);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const channels = await query(
      `SELECT DISTINCT COALESCE(NULLIF(channel,''), 'Sem Canal') as name FROM sales_records WHERE organization_id = $1 ORDER BY name`,
      [org.organization_id]
    );
    const sellers = await query(
      `SELECT DISTINCT COALESCE(seller_name, 'Sem Vendedor') as name FROM sales_records WHERE organization_id = $1 ORDER BY name`,
      [org.organization_id]
    );

    res.json({ channels: channels.rows.map(r => r.name), sellers: sellers.rows.map(r => r.name) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GOALS CRUD
router.get('/goals', async (req, res) => {
  try {
    const org = await getUserOrg(req.user.id);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const { year, month, goal_type } = req.query;
    let filter = '';
    const params = [org.organization_id];
    let pi = 2;

    if (year) { filter += ` AND period_year = $${pi}`; params.push(year); pi++; }
    if (month) { filter += ` AND period_month = $${pi}`; params.push(month); pi++; }
    if (goal_type) { filter += ` AND goal_type = $${pi}`; params.push(goal_type); pi++; }

    const result = await query(
      `SELECT * FROM sales_goals WHERE organization_id = $1 ${filter} ORDER BY goal_type, target_type, target_name`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/goals', async (req, res) => {
  try {
    const org = await getUserOrg(req.user.id);
    if (!org || !['owner', 'admin', 'manager'].includes(org.role)) return res.status(403).json({ error: 'Sem permissão' });

    const { goal_type, period_year, period_month, target_type, target_name, goal_value, goal_count } = req.body;

    const result = await query(
      `INSERT INTO sales_goals (organization_id, goal_type, period_year, period_month, target_type, target_name, goal_value, goal_count, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (organization_id, goal_type, period_year, period_month, target_type, target_name)
       DO UPDATE SET goal_value = EXCLUDED.goal_value, goal_count = EXCLUDED.goal_count, updated_at = NOW()
       RETURNING *`,
      [org.organization_id, goal_type, period_year, period_month, target_type, target_name, goal_value, goal_count || null, req.user.id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    logError('sales-goal create error', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/goals/:id', async (req, res) => {
  try {
    const org = await getUserOrg(req.user.id);
    if (!org || !['owner', 'admin', 'manager'].includes(org.role)) return res.status(403).json({ error: 'Sem permissão' });

    await query(`DELETE FROM sales_goals WHERE id = $1 AND organization_id = $2`, [req.params.id, org.organization_id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Combined report: goals vs realized
router.get('/goals-vs-realized', async (req, res) => {
  try {
    const org = await getUserOrg(req.user.id);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ error: 'year e month obrigatórios' });

    const startDate = `${year}-${String(month).padStart(2,'0')}-01`;
    const endDate = `${year}-${String(month).padStart(2,'0')}-31`;

    // Goals
    const goals = await query(
      `SELECT * FROM sales_goals WHERE organization_id = $1 AND period_year = $2 AND period_month = $3`,
      [org.organization_id, year, month]
    );

    // Realized by channel
    const realizedByChannel = await query(
      `SELECT record_type, COALESCE(NULLIF(channel,''), 'Sem Canal') as name, COUNT(*) as count, COALESCE(SUM(value),0) as total_value
       FROM sales_records WHERE organization_id = $1 AND record_date >= $2 AND record_date <= $3
       GROUP BY record_type, channel`,
      [org.organization_id, startDate, endDate]
    );

    // Realized by seller
    const realizedBySeller = await query(
      `SELECT record_type, COALESCE(seller_name, 'Sem Vendedor') as name, COUNT(*) as count, COALESCE(SUM(value),0) as total_value
       FROM sales_records WHERE organization_id = $1 AND record_date >= $2 AND record_date <= $3
       GROUP BY record_type, seller_name`,
      [org.organization_id, startDate, endDate]
    );

    res.json({
      goals: goals.rows,
      realizedByChannel: realizedByChannel.rows,
      realizedBySeller: realizedBySeller.rows,
    });
  } catch (err) {
    logError('goals-vs-realized error', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
