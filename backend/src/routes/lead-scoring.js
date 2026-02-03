import express from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { log, logError } from '../logger.js';

const router = express.Router();
router.use(authenticate);

// Helper: Get user's organization
async function getUserOrg(userId) {
  const result = await query(
    `SELECT om.organization_id, om.role 
     FROM organization_members om 
     WHERE om.user_id = $1 
     LIMIT 1`,
    [userId]
  );
  return result.rows[0];
}

// ============================================
// SCORING CONFIGURATION
// ============================================

// Get scoring config for organization
router.get('/config', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    let result = await query(
      `SELECT * FROM lead_scoring_config WHERE organization_id = $1`,
      [org.organization_id]
    );

    // Create default config if not exists
    if (!result.rows[0]) {
      result = await query(
        `INSERT INTO lead_scoring_config (organization_id) 
         VALUES ($1) RETURNING *`,
        [org.organization_id]
      );
    }

    res.json(result.rows[0]);
  } catch (error) {
    logError('Error fetching lead scoring config:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update scoring config
router.put('/config', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    const {
      is_active,
      weight_response_time,
      weight_engagement,
      weight_profile_completeness,
      weight_deal_value,
      weight_funnel_progress,
      weight_recency,
      hot_threshold,
      warm_threshold,
      auto_update_on_message,
      auto_update_on_stage_change,
      recalculate_interval_hours
    } = req.body;

    const result = await query(
      `INSERT INTO lead_scoring_config (
        organization_id, is_active, weight_response_time, weight_engagement,
        weight_profile_completeness, weight_deal_value, weight_funnel_progress,
        weight_recency, hot_threshold, warm_threshold, auto_update_on_message,
        auto_update_on_stage_change, recalculate_interval_hours, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
      ON CONFLICT (organization_id) DO UPDATE SET
        is_active = EXCLUDED.is_active,
        weight_response_time = EXCLUDED.weight_response_time,
        weight_engagement = EXCLUDED.weight_engagement,
        weight_profile_completeness = EXCLUDED.weight_profile_completeness,
        weight_deal_value = EXCLUDED.weight_deal_value,
        weight_funnel_progress = EXCLUDED.weight_funnel_progress,
        weight_recency = EXCLUDED.weight_recency,
        hot_threshold = EXCLUDED.hot_threshold,
        warm_threshold = EXCLUDED.warm_threshold,
        auto_update_on_message = EXCLUDED.auto_update_on_message,
        auto_update_on_stage_change = EXCLUDED.auto_update_on_stage_change,
        recalculate_interval_hours = EXCLUDED.recalculate_interval_hours,
        updated_at = NOW()
      RETURNING *`,
      [
        org.organization_id, is_active, weight_response_time, weight_engagement,
        weight_profile_completeness, weight_deal_value, weight_funnel_progress,
        weight_recency, hot_threshold, warm_threshold, auto_update_on_message,
        auto_update_on_stage_change, recalculate_interval_hours
      ]
    );

    res.json(result.rows[0]);
  } catch (error) {
    logError('Error updating lead scoring config:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// SCORE CALCULATION
// ============================================

// Calculate score for a single deal
async function calculateDealScore(dealId, organizationId, config) {
  try {
    // Get deal data with all related info
    const dealResult = await query(`
      SELECT 
        d.*,
        c.name as company_name,
        c.email as company_email,
        c.phone as company_phone,
        c.cnpj,
        s.position as stage_position,
        (SELECT COUNT(*) FROM crm_stages WHERE funnel_id = d.funnel_id) as total_stages
      FROM crm_deals d
      LEFT JOIN crm_companies c ON c.id = d.company_id
      LEFT JOIN crm_stages s ON s.id = d.stage_id
      WHERE d.id = $1
    `, [dealId]);

    if (!dealResult.rows[0]) return null;
    const deal = dealResult.rows[0];

    // Get conversation stats if contact linked
    let conversationStats = { total_messages: 0, avg_response_time: null, last_response: null };
    
    const contactResult = await query(`
      SELECT cc.phone 
      FROM crm_deal_contacts dc
      JOIN crm_contacts cc ON cc.id = dc.contact_id
      WHERE dc.deal_id = $1 AND dc.is_primary = true
      LIMIT 1
    `, [dealId]);

    if (contactResult.rows[0]?.phone) {
      const phone = contactResult.rows[0].phone;
      
      // Get message stats
      const msgStats = await query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN direction = 'incoming' THEN 1 END) as incoming,
          MAX(CASE WHEN direction = 'incoming' THEN created_at END) as last_incoming
        FROM chat_messages cm
        JOIN conversations conv ON conv.id = cm.conversation_id
        WHERE conv.contact_phone LIKE '%' || $1 || '%'
          AND conv.organization_id = $2
      `, [phone.replace(/\D/g, '').slice(-9), organizationId]);

      if (msgStats.rows[0]) {
        conversationStats.total_messages = parseInt(msgStats.rows[0].total) || 0;
        conversationStats.last_response = msgStats.rows[0].last_incoming;
      }
    }

    // Calculate individual scores
    const scores = {
      response_time: 0,
      engagement: 0,
      profile: 0,
      value: 0,
      funnel: 0,
      recency: 0
    };

    // 1. Response Time Score (based on last activity)
    const hoursSinceActivity = (Date.now() - new Date(deal.last_activity_at).getTime()) / (1000 * 60 * 60);
    if (hoursSinceActivity < 1) scores.response_time = 100;
    else if (hoursSinceActivity < 4) scores.response_time = 90;
    else if (hoursSinceActivity < 12) scores.response_time = 75;
    else if (hoursSinceActivity < 24) scores.response_time = 60;
    else if (hoursSinceActivity < 48) scores.response_time = 40;
    else if (hoursSinceActivity < 72) scores.response_time = 20;
    else scores.response_time = 10;

    // 2. Engagement Score (based on messages and interactions)
    const msgCount = conversationStats.total_messages;
    if (msgCount >= 50) scores.engagement = 100;
    else if (msgCount >= 30) scores.engagement = 85;
    else if (msgCount >= 20) scores.engagement = 70;
    else if (msgCount >= 10) scores.engagement = 55;
    else if (msgCount >= 5) scores.engagement = 40;
    else if (msgCount >= 1) scores.engagement = 25;
    else scores.engagement = 10;

    // 3. Profile Completeness Score
    let filledFields = 0;
    const totalFields = 10;
    if (deal.title) filledFields++;
    if (deal.value > 0) filledFields++;
    if (deal.expected_close_date) filledFields++;
    if (deal.description) filledFields++;
    if (deal.company_name && deal.company_name !== 'Sem empresa') filledFields++;
    if (deal.company_email) filledFields++;
    if (deal.company_phone) filledFields++;
    if (deal.cnpj) filledFields++;
    if (contactResult.rows[0]) filledFields++;
    if (deal.owner_id) filledFields++;
    scores.profile = Math.round((filledFields / totalFields) * 100);

    // 4. Deal Value Score (relative to organization average)
    const avgValueResult = await query(`
      SELECT AVG(value) as avg_value, MAX(value) as max_value
      FROM crm_deals 
      WHERE organization_id = $1 AND status = 'open'
    `, [organizationId]);
    
    const avgValue = parseFloat(avgValueResult.rows[0]?.avg_value) || 1;
    const maxValue = parseFloat(avgValueResult.rows[0]?.max_value) || 1;
    const valueRatio = deal.value / maxValue;
    scores.value = Math.min(100, Math.round(valueRatio * 100));

    // 5. Funnel Progress Score
    const stagePosition = deal.stage_position || 1;
    const totalStages = parseInt(deal.total_stages) || 1;
    scores.funnel = Math.round((stagePosition / totalStages) * 100);

    // 6. Recency Score (how recently was activity)
    const daysSinceCreation = (Date.now() - new Date(deal.created_at).getTime()) / (1000 * 60 * 60 * 24);
    const daysSinceActivity = hoursSinceActivity / 24;
    
    // More recent activity = higher score
    if (daysSinceActivity < 1) scores.recency = 100;
    else if (daysSinceActivity < 3) scores.recency = 80;
    else if (daysSinceActivity < 7) scores.recency = 60;
    else if (daysSinceActivity < 14) scores.recency = 40;
    else if (daysSinceActivity < 30) scores.recency = 20;
    else scores.recency = 5;

    // Calculate weighted total score
    const totalWeight = 
      config.weight_response_time + 
      config.weight_engagement + 
      config.weight_profile_completeness + 
      config.weight_deal_value + 
      config.weight_funnel_progress + 
      config.weight_recency;

    const weightedScore = Math.round(
      (scores.response_time * config.weight_response_time +
       scores.engagement * config.weight_engagement +
       scores.profile * config.weight_profile_completeness +
       scores.value * config.weight_deal_value +
       scores.funnel * config.weight_funnel_progress +
       scores.recency * config.weight_recency) / totalWeight
    );

    // Determine label
    let scoreLabel = 'cold';
    if (weightedScore >= config.hot_threshold) scoreLabel = 'hot';
    else if (weightedScore >= config.warm_threshold) scoreLabel = 'warm';

    return {
      deal_id: dealId,
      organization_id: organizationId,
      score: weightedScore,
      score_label: scoreLabel,
      score_response_time: scores.response_time,
      score_engagement: scores.engagement,
      score_profile: scores.profile,
      score_value: scores.value,
      score_funnel: scores.funnel,
      score_recency: scores.recency,
      total_messages: conversationStats.total_messages,
      profile_fields_filled: filledFields,
      profile_fields_total: totalFields,
      funnel_stages_completed: stagePosition,
      funnel_stages_total: parseInt(deal.total_stages) || 1
    };
  } catch (error) {
    logError('Error calculating deal score:', error);
    return null;
  }
}

// Save score to database
async function saveScore(scoreData, triggerEvent = 'manual') {
  try {
    // Get previous score for trend
    const prevResult = await query(
      `SELECT score FROM lead_scores WHERE deal_id = $1`,
      [scoreData.deal_id]
    );
    const previousScore = prevResult.rows[0]?.score;

    // Determine trend
    let scoreTrend = 'stable';
    if (previousScore !== undefined) {
      if (scoreData.score > previousScore + 5) scoreTrend = 'up';
      else if (scoreData.score < previousScore - 5) scoreTrend = 'down';
    }

    // Upsert score
    await query(`
      INSERT INTO lead_scores (
        deal_id, organization_id, score, score_label,
        score_response_time, score_engagement, score_profile,
        score_value, score_funnel, score_recency,
        total_messages, profile_fields_filled, profile_fields_total,
        funnel_stages_completed, funnel_stages_total,
        previous_score, score_trend, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())
      ON CONFLICT (deal_id) DO UPDATE SET
        score = EXCLUDED.score,
        score_label = EXCLUDED.score_label,
        score_response_time = EXCLUDED.score_response_time,
        score_engagement = EXCLUDED.score_engagement,
        score_profile = EXCLUDED.score_profile,
        score_value = EXCLUDED.score_value,
        score_funnel = EXCLUDED.score_funnel,
        score_recency = EXCLUDED.score_recency,
        total_messages = EXCLUDED.total_messages,
        profile_fields_filled = EXCLUDED.profile_fields_filled,
        profile_fields_total = EXCLUDED.profile_fields_total,
        funnel_stages_completed = EXCLUDED.funnel_stages_completed,
        funnel_stages_total = EXCLUDED.funnel_stages_total,
        previous_score = lead_scores.score,
        score_trend = EXCLUDED.score_trend,
        updated_at = NOW()
    `, [
      scoreData.deal_id, scoreData.organization_id, scoreData.score, scoreData.score_label,
      scoreData.score_response_time, scoreData.score_engagement, scoreData.score_profile,
      scoreData.score_value, scoreData.score_funnel, scoreData.score_recency,
      scoreData.total_messages, scoreData.profile_fields_filled, scoreData.profile_fields_total,
      scoreData.funnel_stages_completed, scoreData.funnel_stages_total,
      previousScore, scoreTrend
    ]);

    // Update deal table for quick access
    await query(
      `UPDATE crm_deals SET lead_score = $1, lead_score_label = $2 WHERE id = $3`,
      [scoreData.score, scoreData.score_label, scoreData.deal_id]
    );

    // Record history
    await query(`
      INSERT INTO lead_score_history (deal_id, score, score_label, trigger_event)
      VALUES ($1, $2, $3, $4)
    `, [scoreData.deal_id, scoreData.score, scoreData.score_label, triggerEvent]);

    return { ...scoreData, previous_score: previousScore, score_trend: scoreTrend };
  } catch (error) {
    logError('Error saving score:', error);
    throw error;
  }
}

// ============================================
// API ENDPOINTS
// ============================================

// Get score for a deal
router.get('/deal/:dealId', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    const result = await query(
      `SELECT * FROM lead_scores WHERE deal_id = $1`,
      [req.params.dealId]
    );

    if (!result.rows[0]) {
      // Score doesn't exist, calculate it
      const config = await query(
        `SELECT * FROM lead_scoring_config WHERE organization_id = $1`,
        [org.organization_id]
      );
      
      if (!config.rows[0]) {
        return res.json({ score: 0, score_label: 'cold', message: 'Scoring not configured' });
      }

      const scoreData = await calculateDealScore(req.params.dealId, org.organization_id, config.rows[0]);
      if (scoreData) {
        const saved = await saveScore(scoreData, 'first_calculation');
        return res.json(saved);
      }
      return res.json({ score: 0, score_label: 'cold' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logError('Error fetching deal score:', error);
    res.status(500).json({ error: error.message });
  }
});

// Recalculate score for a deal
router.post('/deal/:dealId/recalculate', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    const configResult = await query(
      `SELECT * FROM lead_scoring_config WHERE organization_id = $1`,
      [org.organization_id]
    );

    if (!configResult.rows[0]) {
      return res.status(400).json({ error: 'Scoring not configured' });
    }

    const scoreData = await calculateDealScore(req.params.dealId, org.organization_id, configResult.rows[0]);
    if (!scoreData) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    const saved = await saveScore(scoreData, req.body.trigger || 'manual');
    res.json(saved);
  } catch (error) {
    logError('Error recalculating score:', error);
    res.status(500).json({ error: error.message });
  }
});

// Bulk recalculate all deals in organization
router.post('/recalculate-all', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    const configResult = await query(
      `SELECT * FROM lead_scoring_config WHERE organization_id = $1`,
      [org.organization_id]
    );

    if (!configResult.rows[0]) {
      return res.status(400).json({ error: 'Scoring not configured' });
    }

    // Get all open deals
    const dealsResult = await query(`
      SELECT d.id 
      FROM crm_deals d
      JOIN crm_stages s ON s.id = d.stage_id
      JOIN crm_funnels f ON f.id = s.funnel_id
      WHERE f.organization_id = $1 AND d.status = 'open'
    `, [org.organization_id]);

    let updated = 0;
    for (const deal of dealsResult.rows) {
      const scoreData = await calculateDealScore(deal.id, org.organization_id, configResult.rows[0]);
      if (scoreData) {
        await saveScore(scoreData, 'bulk_recalculate');
        updated++;
      }
    }

    res.json({ success: true, updated });
  } catch (error) {
    logError('Error bulk recalculating:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get score history for a deal
router.get('/deal/:dealId/history', async (req, res) => {
  try {
    const result = await query(`
      SELECT * FROM lead_score_history 
      WHERE deal_id = $1 
      ORDER BY created_at DESC 
      LIMIT 50
    `, [req.params.dealId]);

    res.json(result.rows);
  } catch (error) {
    logError('Error fetching score history:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get leaderboard (top scored leads)
router.get('/leaderboard', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    const { limit = 10, label } = req.query;
    
    let labelFilter = '';
    const params = [org.organization_id, parseInt(limit)];
    
    if (label && ['hot', 'warm', 'cold'].includes(label)) {
      labelFilter = ' AND ls.score_label = $3';
      params.push(label);
    }

    const result = await query(`
      SELECT 
        ls.*,
        d.title as deal_title,
        d.value as deal_value,
        d.status as deal_status,
        c.name as company_name,
        u.name as owner_name
      FROM lead_scores ls
      JOIN crm_deals d ON d.id = ls.deal_id
      LEFT JOIN crm_companies c ON c.id = d.company_id
      LEFT JOIN users u ON u.id = d.owner_id
      WHERE ls.organization_id = $1 AND d.status = 'open'${labelFilter}
      ORDER BY ls.score DESC
      LIMIT $2
    `, params);

    res.json(result.rows);
  } catch (error) {
    logError('Error fetching leaderboard:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get score distribution stats
router.get('/stats', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    const result = await query(`
      SELECT 
        COUNT(*) FILTER (WHERE score_label = 'hot') as hot_count,
        COUNT(*) FILTER (WHERE score_label = 'warm') as warm_count,
        COUNT(*) FILTER (WHERE score_label = 'cold') as cold_count,
        AVG(score)::INTEGER as avg_score,
        MAX(score) as max_score,
        MIN(score) as min_score,
        COUNT(*) FILTER (WHERE score_trend = 'up') as trending_up,
        COUNT(*) FILTER (WHERE score_trend = 'down') as trending_down
      FROM lead_scores
      WHERE organization_id = $1
    `, [org.organization_id]);

    res.json(result.rows[0] || {
      hot_count: 0, warm_count: 0, cold_count: 0,
      avg_score: 0, max_score: 0, min_score: 0,
      trending_up: 0, trending_down: 0
    });
  } catch (error) {
    logError('Error fetching stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// Export functions for use in other modules (e.g., webhook handlers)
export { calculateDealScore, saveScore };

export default router;
