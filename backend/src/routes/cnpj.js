import { Router } from 'express';
import { query } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// Get CNPJ config
router.get('/config', authenticateToken, async (req, res) => {
  try {
    const org = await query('SELECT organization_id FROM organization_members WHERE user_id = $1 LIMIT 1', [req.userId]);
    if (!org.rows[0]) return res.status(403).json({ error: 'No organization' });

    const result = await query(
      `SELECT id, organization_id, base_url,
              CASE WHEN api_token IS NOT NULL AND api_token != '' THEN '••••••••' || RIGHT(api_token, 4) ELSE NULL END as api_token_masked
       FROM cnpj_config WHERE organization_id = $1`,
      [org.rows[0].organization_id]
    );

    res.json(result.rows[0] || null);
  } catch (err) {
    console.error('Error loading CNPJ config:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Save CNPJ config
router.post('/config', authenticateToken, async (req, res) => {
  try {
    const org = await query('SELECT organization_id FROM organization_members WHERE user_id = $1 LIMIT 1', [req.userId]);
    if (!org.rows[0]) return res.status(403).json({ error: 'No organization' });

    const { api_token, base_url } = req.body;
    const normalizedToken = typeof api_token === 'string' ? api_token.trim() : undefined;
    const normalizedUrl = (base_url || 'https://cnpj.gleego.com.br').replace(/\/+$/, '');

    // Check if config exists
    const existing = await query('SELECT id FROM cnpj_config WHERE organization_id = $1', [org.rows[0].organization_id]);

    if (existing.rows[0]) {
      const setClauses = ['base_url = $2', 'updated_at = NOW()'];
      const params = [org.rows[0].organization_id, normalizedUrl];

      if (normalizedToken) {
        setClauses.push(`api_token = $${params.length + 1}`);
        params.push(normalizedToken);
      }

      await query(
        `UPDATE cnpj_config SET ${setClauses.join(', ')} WHERE organization_id = $1`,
        params
      );
    } else {
      await query(
        `INSERT INTO cnpj_config (organization_id, api_token, base_url) VALUES ($1, $2, $3)`,
        [org.rows[0].organization_id, normalizedToken || '', normalizedUrl]
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error saving CNPJ config:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Lookup CNPJ
router.get('/lookup/:cnpj', authenticateToken, async (req, res) => {
  try {
    const org = await query('SELECT organization_id FROM organization_members WHERE user_id = $1 LIMIT 1', [req.userId]);
    if (!org.rows[0]) return res.status(403).json({ error: 'No organization' });

    const config = await query(
      'SELECT api_token, base_url FROM cnpj_config WHERE organization_id = $1',
      [org.rows[0].organization_id]
    );

    if (!config.rows[0] || !config.rows[0].api_token) {
      return res.status(400).json({ error: 'CNPJ API não configurada. Vá em Configurações > Integrações.' });
    }

    const { api_token, base_url } = config.rows[0];
    const cnpj = req.params.cnpj.replace(/\D/g, '');

    if (cnpj.length !== 14) {
      return res.status(400).json({ error: 'CNPJ deve ter 14 dígitos' });
    }

    const apiUrl = `${base_url || 'https://cnpj.gleego.com.br'}/api/v1/cnpj/${cnpj}`;
    
    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${api_token.trim()}`,
        'Accept': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('CNPJ API error:', response.status, data);
      return res.status(response.status).json({ error: data.message || data.error || 'Erro na consulta CNPJ' });
    }

    res.json(data);
  } catch (err) {
    console.error('Error looking up CNPJ:', err);
    res.status(500).json({ error: 'Erro ao consultar CNPJ' });
  }
});

export default router;
