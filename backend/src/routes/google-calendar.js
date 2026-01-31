import express from 'express';
import crypto from 'crypto';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { logInfo, logError } from '../logger.js';

const router = express.Router();

// Google OAuth configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/google-calendar/callback';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
].join(' ');

// Store state tokens temporarily (in production, use Redis or DB)
const stateTokens = new Map();

// ============================================
// OAUTH FLOW
// ============================================

// Get auth URL - initiate OAuth flow
router.get('/auth-url', authenticate, async (req, res) => {
  try {
    if (!GOOGLE_CLIENT_ID) {
      return res.status(500).json({ error: 'Google OAuth not configured' });
    }

    // Generate state token to prevent CSRF
    const state = crypto.randomBytes(32).toString('hex');
    stateTokens.set(state, { userId: req.userId, expires: Date.now() + 600000 }); // 10 min

    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: GOOGLE_REDIRECT_URI,
      response_type: 'code',
      scope: SCOPES,
      access_type: 'offline', // Get refresh token
      prompt: 'consent', // Always show consent screen to get refresh token
      state,
    });

    const authUrl = `${GOOGLE_AUTH_URL}?${params.toString()}`;
    res.json({ url: authUrl });
  } catch (error) {
    logError('Error generating auth URL:', error);
    res.status(500).json({ error: error.message });
  }
});

// OAuth callback - exchange code for tokens
router.get('/callback', async (req, res) => {
  try {
    const { code, state, error: oauthError } = req.query;

    if (oauthError) {
      return res.redirect(`${FRONTEND_URL}/crm/configuracoes?google_error=${encodeURIComponent(oauthError)}`);
    }

    if (!code || !state) {
      return res.redirect(`${FRONTEND_URL}/crm/configuracoes?google_error=missing_params`);
    }

    // Validate state token
    const stateData = stateTokens.get(state);
    if (!stateData || stateData.expires < Date.now()) {
      stateTokens.delete(state);
      return res.redirect(`${FRONTEND_URL}/crm/configuracoes?google_error=invalid_state`);
    }

    const userId = stateData.userId;
    stateTokens.delete(state);

    // Exchange code for tokens
    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      logError('Token exchange failed:', tokenData);
      return res.redirect(`${FRONTEND_URL}/crm/configuracoes?google_error=${encodeURIComponent(tokenData.error || 'token_exchange_failed')}`);
    }

    // Get user info
    const userInfoResponse = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userInfo = await userInfoResponse.json();

    // Calculate expiration
    const expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000));

    // Save tokens
    await query(
      `INSERT INTO google_oauth_tokens 
       (user_id, access_token, refresh_token, token_type, expires_at, scope, google_email, google_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id) DO UPDATE SET
         access_token = EXCLUDED.access_token,
         refresh_token = COALESCE(EXCLUDED.refresh_token, google_oauth_tokens.refresh_token),
         expires_at = EXCLUDED.expires_at,
         scope = EXCLUDED.scope,
         google_email = EXCLUDED.google_email,
         google_name = EXCLUDED.google_name,
         is_active = true,
         last_error = NULL,
         updated_at = NOW()`,
      [userId, tokenData.access_token, tokenData.refresh_token, tokenData.token_type,
       expiresAt, tokenData.scope, userInfo.email, userInfo.name]
    );

    logInfo(`Google Calendar connected for user ${userId}: ${userInfo.email}`);
    res.redirect(`${FRONTEND_URL}/crm/configuracoes?google_success=true`);
  } catch (error) {
    logError('OAuth callback error:', error);
    res.redirect(`${FRONTEND_URL}/crm/configuracoes?google_error=${encodeURIComponent(error.message)}`);
  }
});

// ============================================
// AUTHENTICATED ROUTES
// ============================================
router.use(authenticate);

// Get connection status
router.get('/status', async (req, res) => {
  try {
    const result = await query(
      `SELECT google_email, google_name, is_active, last_sync_at, last_error, expires_at
       FROM google_oauth_tokens WHERE user_id = $1`,
      [req.userId]
    );

    if (!result.rows[0]) {
      return res.json({ connected: false });
    }

    const token = result.rows[0];
    res.json({
      connected: token.is_active,
      email: token.google_email,
      name: token.google_name,
      lastSync: token.last_sync_at,
      lastError: token.last_error,
      tokenExpired: new Date(token.expires_at) < new Date(),
    });
  } catch (error) {
    logError('Error fetching Google status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Disconnect Google account
router.delete('/disconnect', async (req, res) => {
  try {
    await query(
      `UPDATE google_oauth_tokens SET is_active = false WHERE user_id = $1`,
      [req.userId]
    );

    res.json({ success: true });
  } catch (error) {
    logError('Error disconnecting Google:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// HELPER: Get valid access token
// ============================================
async function getValidAccessToken(userId) {
  const result = await query(
    `SELECT * FROM google_oauth_tokens WHERE user_id = $1 AND is_active = true`,
    [userId]
  );

  if (!result.rows[0]) {
    throw new Error('Google Calendar não conectado');
  }

  let token = result.rows[0];

  // Check if token is expired or about to expire (5 min buffer)
  if (new Date(token.expires_at) <= new Date(Date.now() + 300000)) {
    // Refresh the token
    const refreshResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: token.refresh_token,
        grant_type: 'refresh_token',
      }),
    });

    const refreshData = await refreshResponse.json();

    if (!refreshResponse.ok) {
      // Mark token as inactive
      await query(
        `UPDATE google_oauth_tokens SET is_active = false, last_error = $1 WHERE user_id = $2`,
        [refreshData.error || 'refresh_failed', userId]
      );
      throw new Error('Falha ao renovar token. Reconecte sua conta Google.');
    }

    const newExpiresAt = new Date(Date.now() + (refreshData.expires_in * 1000));

    await query(
      `UPDATE google_oauth_tokens SET 
         access_token = $1, expires_at = $2, last_error = NULL, updated_at = NOW()
       WHERE user_id = $3`,
      [refreshData.access_token, newExpiresAt, userId]
    );

    token.access_token = refreshData.access_token;
  }

  return token.access_token;
}

// ============================================
// CALENDAR OPERATIONS
// ============================================

// Create event in Google Calendar
router.post('/events', async (req, res) => {
  try {
    const { title, description, startDateTime, endDateTime, location, taskId, dealId } = req.body;

    if (!title || !startDateTime || !endDateTime) {
      return res.status(400).json({ error: 'Título, data de início e fim são obrigatórios' });
    }

    const accessToken = await getValidAccessToken(req.userId);

    const event = {
      summary: title,
      description: description || '',
      location: location || '',
      start: {
        dateTime: startDateTime,
        timeZone: 'America/Sao_Paulo',
      },
      end: {
        dateTime: endDateTime,
        timeZone: 'America/Sao_Paulo',
      },
      reminders: {
        useDefault: true,
      },
    };

    const response = await fetch(`${GOOGLE_CALENDAR_API}/calendars/primary/events`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    });

    const eventData = await response.json();

    if (!response.ok) {
      logError('Google Calendar API error:', eventData);
      throw new Error(eventData.error?.message || 'Erro ao criar evento');
    }

    // Save mapping if task or deal provided
    if (taskId) {
      await query(
        `INSERT INTO google_calendar_events 
         (user_id, crm_task_id, crm_deal_id, google_event_id, google_calendar_id)
         VALUES ($1, $2, $3, $4, 'primary')
         ON CONFLICT (user_id, crm_task_id) DO UPDATE SET
           google_event_id = EXCLUDED.google_event_id,
           sync_status = 'synced',
           last_synced_at = NOW()`,
        [req.userId, taskId, dealId || null, eventData.id]
      );
    }

    // Update last sync
    await query(
      `UPDATE google_oauth_tokens SET last_sync_at = NOW() WHERE user_id = $1`,
      [req.userId]
    );

    res.json({ success: true, eventId: eventData.id, htmlLink: eventData.htmlLink });
  } catch (error) {
    logError('Error creating Google Calendar event:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update event in Google Calendar
router.put('/events/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    const { title, description, startDateTime, endDateTime, location } = req.body;

    const accessToken = await getValidAccessToken(req.userId);

    const event = {
      summary: title,
      description: description || '',
      location: location || '',
      start: {
        dateTime: startDateTime,
        timeZone: 'America/Sao_Paulo',
      },
      end: {
        dateTime: endDateTime,
        timeZone: 'America/Sao_Paulo',
      },
    };

    const response = await fetch(`${GOOGLE_CALENDAR_API}/calendars/primary/events/${eventId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    });

    const eventData = await response.json();

    if (!response.ok) {
      throw new Error(eventData.error?.message || 'Erro ao atualizar evento');
    }

    res.json({ success: true, eventId: eventData.id });
  } catch (error) {
    logError('Error updating Google Calendar event:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete event from Google Calendar
router.delete('/events/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;

    const accessToken = await getValidAccessToken(req.userId);

    const response = await fetch(`${GOOGLE_CALENDAR_API}/calendars/primary/events/${eventId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok && response.status !== 404) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Erro ao deletar evento');
    }

    // Remove mapping
    await query(
      `DELETE FROM google_calendar_events WHERE user_id = $1 AND google_event_id = $2`,
      [req.userId, eventId]
    );

    res.json({ success: true });
  } catch (error) {
    logError('Error deleting Google Calendar event:', error);
    res.status(500).json({ error: error.message });
  }
});

// Sync task to Google Calendar
router.post('/sync-task/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;

    // Get task details
    const taskResult = await query(
      `SELECT t.*, d.title as deal_title, d.id as deal_id
       FROM crm_tasks t
       LEFT JOIN crm_deals d ON d.id = t.deal_id
       WHERE t.id = $1`,
      [taskId]
    );

    if (!taskResult.rows[0]) {
      return res.status(404).json({ error: 'Tarefa não encontrada' });
    }

    const task = taskResult.rows[0];
    const accessToken = await getValidAccessToken(req.userId);

    // Check if already synced
    const existingSync = await query(
      `SELECT google_event_id FROM google_calendar_events WHERE user_id = $1 AND crm_task_id = $2`,
      [req.userId, taskId]
    );

    const startDate = new Date(task.due_date);
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // 1 hour duration

    const event = {
      summary: task.title,
      description: task.description || (task.deal_title ? `Negociação: ${task.deal_title}` : ''),
      start: {
        dateTime: startDate.toISOString(),
        timeZone: 'America/Sao_Paulo',
      },
      end: {
        dateTime: endDate.toISOString(),
        timeZone: 'America/Sao_Paulo',
      },
    };

    let response;
    let method = 'POST';
    let url = `${GOOGLE_CALENDAR_API}/calendars/primary/events`;

    if (existingSync.rows[0]) {
      // Update existing event
      method = 'PUT';
      url = `${url}/${existingSync.rows[0].google_event_id}`;
    }

    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    });

    const eventData = await response.json();

    if (!response.ok) {
      throw new Error(eventData.error?.message || 'Erro ao sincronizar');
    }

    // Save/update mapping
    await query(
      `INSERT INTO google_calendar_events 
       (user_id, crm_task_id, crm_deal_id, google_event_id, google_calendar_id, sync_status, last_synced_at)
       VALUES ($1, $2, $3, $4, 'primary', 'synced', NOW())
       ON CONFLICT (user_id, crm_task_id) DO UPDATE SET
         google_event_id = EXCLUDED.google_event_id,
         sync_status = 'synced',
         last_synced_at = NOW()`,
      [req.userId, taskId, task.deal_id, eventData.id]
    );

    await query(
      `UPDATE google_oauth_tokens SET last_sync_at = NOW() WHERE user_id = $1`,
      [req.userId]
    );

    res.json({ success: true, eventId: eventData.id, htmlLink: eventData.htmlLink });
  } catch (error) {
    logError('Error syncing task to Google Calendar:', error);
    res.status(500).json({ error: error.message });
  }
});

// List user's calendar events
router.get('/events', async (req, res) => {
  try {
    const { timeMin, timeMax, maxResults = 50 } = req.query;

    const accessToken = await getValidAccessToken(req.userId);

    const params = new URLSearchParams({
      maxResults: String(maxResults),
      singleEvents: 'true',
      orderBy: 'startTime',
    });

    if (timeMin) params.append('timeMin', timeMin);
    if (timeMax) params.append('timeMax', timeMax);

    const response = await fetch(`${GOOGLE_CALENDAR_API}/calendars/primary/events?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || 'Erro ao buscar eventos');
    }

    res.json(data.items || []);
  } catch (error) {
    logError('Error fetching Google Calendar events:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
