import { Router } from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

// Get Lead Gleego config for current organization
router.get('/config', async (req, res) => {
  try {
    const orgResult = await query(
      `SELECT o.lead_gleego_api_key
       FROM organizations o
       JOIN organization_members om ON om.organization_id = o.id
       WHERE om.user_id = $1
       LIMIT 1`,
      [req.userId]
    );

    if (orgResult.rows.length === 0) {
      return res.status(404).json({ error: 'Organização não encontrada' });
    }

    res.json({
      api_key: orgResult.rows[0].lead_gleego_api_key || '',
      configured: !!orgResult.rows[0].lead_gleego_api_key
    });
  } catch (error) {
    console.error('Get lead gleego config error:', error);
    res.status(500).json({ error: 'Erro ao buscar configuração' });
  }
});

// Update Lead Gleego API key (admin only)
router.put('/config', async (req, res) => {
  try {
    const { api_key } = req.body;

    // Check if user is admin/owner
    const memberResult = await query(
      `SELECT om.organization_id, om.role
       FROM organization_members om
       WHERE om.user_id = $1`,
      [req.userId]
    );

    if (memberResult.rows.length === 0) {
      return res.status(403).json({ error: 'Sem acesso' });
    }

    const { organization_id, role } = memberResult.rows[0];
    if (!['owner', 'admin', 'manager'].includes(role)) {
      // Also check superadmin
      const superCheck = await query(`SELECT is_superadmin FROM users WHERE id = $1`, [req.userId]);
      if (!superCheck.rows[0]?.is_superadmin) {
        return res.status(403).json({ error: 'Permissão insuficiente' });
      }
    }

    await query(
      `UPDATE organizations SET lead_gleego_api_key = $1, updated_at = NOW() WHERE id = $2`,
      [api_key || null, organization_id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Update lead gleego config error:', error);
    res.status(500).json({ error: 'Erro ao salvar configuração' });
  }
});

// SSO - Generate token and return redirect URL
router.post('/sso', async (req, res) => {
  try {
    // Get user email
    const userResult = await query(`SELECT email FROM users WHERE id = $1`, [req.userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const email = userResult.rows[0].email;

    // Get organization's API key
    const orgResult = await query(
      `SELECT o.lead_gleego_api_key
       FROM organizations o
       JOIN organization_members om ON om.organization_id = o.id
       WHERE om.user_id = $1
       LIMIT 1`,
      [req.userId]
    );

    if (orgResult.rows.length === 0 || !orgResult.rows[0].lead_gleego_api_key) {
      return res.status(400).json({ error: 'Lead Gleego não configurado. Configure a chave API nas configurações.' });
    }

    const apiKey = orgResult.rows[0].lead_gleego_api_key;

    // Request token from Lead Extractor backend
    const response = await fetch('https://backlead.gleego.com.br/api/auth/token-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, apiKey })
    });

    const data = await response.json();

    if (data.token) {
      res.json({ 
        redirect_url: `https://lead.gleego.com.br/login?token=${data.token}` 
      });
    } else {
      res.status(400).json({ 
        error: data.error || 'Usuário não encontrado no Lead Extractor. Verifique se o email está cadastrado.' 
      });
    }
  } catch (error) {
    console.error('Lead Gleego SSO error:', error);
    res.status(500).json({ error: 'Erro ao autenticar no Lead Gleego' });
  }
});

export default router;
