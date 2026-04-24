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
    // Use SELECT * to avoid errors if columns don't exist yet
    const result = await query(
      `SELECT * FROM google_oauth_tokens WHERE user_id = $1`,
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
      defaultCalendarId: token.default_calendar_id || null,
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
// HELPER: Get default calendar ID for creating events
// ============================================
async function getDefaultCalendarId(userId) {
  try {
    const result = await query(
      `SELECT default_calendar_id FROM google_oauth_tokens WHERE user_id = $1`,
      [userId]
    );
    return result.rows[0]?.default_calendar_id || 'primary';
  } catch (err) {
    logError('default_calendar_id column may not exist yet:', err);
    return 'primary';
  }
}

// ============================================
// CALENDAR OPERATIONS
// ============================================

// Create event in Google Calendar
router.post('/events', async (req, res) => {
  try {
    const { title, description, startDateTime, endDateTime, location, taskId, dealId, calendarId: requestCalendarId } = req.body;

    if (!title || !startDateTime || !endDateTime) {
      return res.status(400).json({ error: 'Título, data de início e fim são obrigatórios' });
    }

    const accessToken = await getValidAccessToken(req.userId);
    const calendarId = requestCalendarId || await getDefaultCalendarId(req.userId);

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

    const response = await fetch(`${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`, {
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
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, crm_task_id) DO UPDATE SET
           google_event_id = EXCLUDED.google_event_id,
           sync_status = 'synced',
           last_synced_at = NOW()`,
        [req.userId, taskId, dealId || null, eventData.id, calendarId]
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

    const defaultCalId = await getDefaultCalendarId(req.userId);
    const response = await fetch(`${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(defaultCalId)}/events/${eventId}`, {
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

    const defaultCalId = await getDefaultCalendarId(req.userId);
    const response = await fetch(`${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(defaultCalId)}/events/${eventId}`, {
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
    const defaultCalId = await getDefaultCalendarId(req.userId);
    let url = `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(defaultCalId)}/events`;

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
       (user_id, crm_task_id, crm_deal_id, google_event_id, google_calendar_id, event_summary, event_start, event_end, sync_status, last_synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'synced', NOW())
       ON CONFLICT (user_id, crm_task_id) DO UPDATE SET
         google_event_id = EXCLUDED.google_event_id,
         google_calendar_id = EXCLUDED.google_calendar_id,
         event_summary = EXCLUDED.event_summary,
         event_start = EXCLUDED.event_start,
         event_end = EXCLUDED.event_end,
         sync_status = 'synced',
         last_synced_at = NOW()`,
      [req.userId, taskId, task.deal_id, eventData.id, defaultCalId, task.title, startDate.toISOString(), endDate.toISOString()]
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

// Debug endpoint - check Google Calendar configuration
router.get('/debug', async (req, res) => {
  try {
    const checks = {
      clientIdSet: !!GOOGLE_CLIENT_ID,
      clientSecretSet: !!GOOGLE_CLIENT_SECRET,
      redirectUri: GOOGLE_REDIRECT_URI,
    };

    // Check if user has token in DB
    try {
      const tokenResult = await query(
        `SELECT user_id, google_email, is_active, expires_at, last_error,
                (refresh_token IS NOT NULL) as has_refresh_token
         FROM google_oauth_tokens WHERE user_id = $1`,
        [req.userId]
      );
      if (tokenResult.rows[0]) {
        const t = tokenResult.rows[0];
        checks.token = {
          email: t.google_email,
          isActive: t.is_active,
          expiresAt: t.expires_at,
          expired: new Date(t.expires_at) < new Date(),
          hasRefreshToken: t.has_refresh_token,
          lastError: t.last_error,
        };
      } else {
        checks.token = null;
      }
    } catch (dbErr) {
      checks.tokenError = dbErr.message;
    }

    // Try to get a valid access token
    try {
      const accessToken = await getValidAccessToken(req.userId);
      checks.accessTokenValid = true;
      checks.accessTokenLength = accessToken?.length || 0;

      // Try to call Google Calendar API
      const response = await fetch(`${GOOGLE_CALENDAR_API}/users/me/calendarList`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await response.json();
      checks.googleApiStatus = response.status;
      checks.googleApiOk = response.ok;
      if (!response.ok) {
        checks.googleApiError = data.error;
      } else {
        checks.calendarsCount = (data.items || []).length;
        checks.calendarNames = (data.items || []).map(c => c.summary);
      }
    } catch (tokenErr) {
      checks.accessTokenValid = false;
      checks.accessTokenError = tokenErr.message;
    }

    res.json(checks);
  } catch (error) {
    res.json({ error: error.message, stack: error.stack });
  }
});

// List user's calendars
router.get('/calendars', async (req, res) => {
  try {
    let accessToken;
    try {
      accessToken = await getValidAccessToken(req.userId);
    } catch (tokenErr) {
      logInfo('google.calendars.no_token', { userId: req.userId, error: tokenErr.message });
      return res.json([]);
    }

    logInfo('google.calendars.fetching', { userId: req.userId });

    let response;
    try {
      response = await fetch(`${GOOGLE_CALENDAR_API}/users/me/calendarList`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch (fetchErr) {
      logError('google.calendars.fetch_failed', fetchErr);
      return res.json([]);
    }

    let data;
    try {
      data = await response.json();
    } catch (parseErr) {
      logError('google.calendars.parse_failed', parseErr);
      return res.json([]);
    }

    if (!response.ok) {
      logError('google.calendars.api_error', null, { status: response.status, error: data.error });
      if (response.status === 401) {
        await query(
          `UPDATE google_oauth_tokens SET is_active = false, last_error = 'token_revoked' WHERE user_id = $1`,
          [req.userId]
        ).catch(() => {});
      }
      return res.json([]);
    }

    // Get user's selected calendars preference
    let selectedCalendars = null;
    try {
      const prefResult = await query(
        `SELECT selected_calendars FROM google_oauth_tokens WHERE user_id = $1`,
        [req.userId]
      );
      selectedCalendars = prefResult.rows[0]?.selected_calendars || null;
    } catch (_e) {
      // Column may not exist yet
    }

    const calendars = (data.items || []).map(cal => ({
      id: cal.id,
      summary: cal.summary,
      description: cal.description,
      primary: cal.primary || false,
      backgroundColor: cal.backgroundColor,
      foregroundColor: cal.foregroundColor,
      accessRole: cal.accessRole,
      selected: selectedCalendars === null ? true : (Array.isArray(selectedCalendars) ? selectedCalendars.includes(cal.id) : true),
    }));

    logInfo('google.calendars.success', { userId: req.userId, count: calendars.length });
    res.json(calendars);
  } catch (error) {
    logError('google.calendars.unexpected', error);
    res.json([]);
  }
});

// Save selected calendars preference
router.put('/calendars/selected', async (req, res) => {
  try {
    const { calendarIds } = req.body; // array of calendar IDs or null for all

    await query(
      `UPDATE google_oauth_tokens SET selected_calendars = $1, updated_at = NOW() WHERE user_id = $2`,
      [calendarIds ? JSON.stringify(calendarIds) : null, req.userId]
    );

    res.json({ success: true });
  } catch (error) {
    logError('Error saving calendar preferences:', error);
    res.status(500).json({ error: error.message });
  }
});

// Save default calendar for creating events
router.put('/calendars/default', async (req, res) => {
  try {
    const { calendarId } = req.body; // calendar ID or null for primary

    await query(
      `UPDATE google_oauth_tokens SET default_calendar_id = $1, updated_at = NOW() WHERE user_id = $2`,
      [calendarId || null, req.userId]
    );

    res.json({ success: true });
  } catch (error) {
    logError('Error saving default calendar:', error);
    res.status(500).json({ error: error.message });
  }
});

// List user's calendar events (from selected calendars)
router.get('/events', async (req, res) => {
  try {
    const { timeMin, timeMax, maxResults = 50 } = req.query;

    let accessToken;
    try {
      accessToken = await getValidAccessToken(req.userId);
    } catch {
      return res.json([]); // Not connected – return empty list
    }

    // Get user's selected calendars preference (defensive)
    let selectedCalendars = null;
    try {
      const prefResult = await query(
        `SELECT selected_calendars FROM google_oauth_tokens WHERE user_id = $1`,
        [req.userId]
      );
      selectedCalendars = prefResult.rows[0]?.selected_calendars || null;
    } catch (prefErr) {
      logError('selected_calendars column may not exist yet:', prefErr);
    }

    // Get user's calendar list
    const calListResponse = await fetch(`${GOOGLE_CALENDAR_API}/users/me/calendarList`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const calListData = await calListResponse.json();
    if (!calListResponse.ok) {
      logError('Google calendarList API error in /events:', { status: calListResponse.status, error: calListData.error });
      return res.json([]);
    }

    // Filter calendars based on user preference
    let calendars = (calListData.items || []).filter(cal => 
      cal.accessRole !== 'freeBusyReader'
    );

    if (Array.isArray(selectedCalendars) && selectedCalendars.length > 0) {
      calendars = calendars.filter(cal => selectedCalendars.includes(cal.id));
    }

    // Fetch events from selected calendars in parallel
    const allEventsPromises = calendars.map(async (cal) => {
      const params = new URLSearchParams({
        maxResults: String(maxResults),
        singleEvents: 'true',
        orderBy: 'startTime',
      });

      if (timeMin) params.append('timeMin', timeMin);
      if (timeMax) params.append('timeMax', timeMax);

      try {
        const response = await fetch(
          `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(cal.id)}/events?${params.toString()}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        const data = await response.json();
        if (!response.ok) {
          logError(`Error fetching events from calendar ${cal.id}:`, data);
          return [];
        }

        return (data.items || []).map(event => ({
          ...event,
          calendarId: cal.id,
          calendarName: cal.summary,
          calendarColor: cal.backgroundColor,
        }));
      } catch (err) {
        logError(`Failed to fetch calendar ${cal.id}:`, err);
        return [];
      }
    });

    const allEventsArrays = await Promise.all(allEventsPromises);
    const allEvents = allEventsArrays.flat();

    allEvents.sort((a, b) => {
      const aTime = a.start?.dateTime || a.start?.date || '';
      const bTime = b.start?.dateTime || b.start?.date || '';
      return aTime.localeCompare(bTime);
    });

    res.json(allEvents);
  } catch (error) {
    logError('Error fetching Google Calendar events:', error);
    res.json([]); // Never return 500 – return empty list as fallback
  }
});

// ============================================
// CREATE EVENT WITH GOOGLE MEET AND ATTENDEES
// ============================================
router.post('/events-with-meet', async (req, res) => {
  try {
    const { title, description, startDateTime, endDateTime, addMeet, attendees = [], dealId } = req.body;

    if (!title || !startDateTime || !endDateTime) {
      return res.status(400).json({ error: 'Título, data de início e fim são obrigatórios' });
    }

    const accessToken = await getValidAccessToken(req.userId);

    // Build enhanced description with deal context if provided
    let enhancedDescription = description || '';
    let dealInfo = null;
    
    if (dealId) {
      // Fetch deal details with company and contacts
      const dealResult = await query(
        `SELECT d.id, d.title, d.value, c.name as company_name, c.phone as company_phone,
          (SELECT string_agg(ct.name || COALESCE(' (' || dc.role || ')', ''), ', ')
           FROM crm_deal_contacts dc
           JOIN contacts ct ON ct.id = dc.contact_id
           WHERE dc.deal_id = d.id) as contact_names
         FROM crm_deals d
         LEFT JOIN crm_companies c ON c.id = d.company_id
         WHERE d.id = $1`,
        [dealId]
      );
      
      if (dealResult.rows[0]) {
        dealInfo = dealResult.rows[0];
        
        // Build context section for the description
        const contextParts = [];
        contextParts.push('📋 Negociação: ' + dealInfo.title);
        if (dealInfo.company_name && dealInfo.company_name !== 'Sem empresa') {
          contextParts.push('🏢 Empresa: ' + dealInfo.company_name);
        }
        if (dealInfo.contact_names) {
          contextParts.push('👤 Contatos: ' + dealInfo.contact_names);
        }
        if (dealInfo.value) {
          const formattedValue = new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
            minimumFractionDigits: 0,
          }).format(Number(dealInfo.value) || 0);
          contextParts.push('💰 Valor: ' + formattedValue);
        }
        
        const contextBlock = '─────────────────\n' + contextParts.join('\n') + '\n─────────────────';
        
        // Prepend context to description
        enhancedDescription = contextBlock + (enhancedDescription ? '\n\n' + enhancedDescription : '');
      }
    }

    const event = {
      summary: title,
      description: enhancedDescription,
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

    // Add Google Meet conference
    if (addMeet) {
      event.conferenceData = {
        createRequest: {
          requestId: crypto.randomUUID(),
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      };
    }

    // Add attendees
    if (attendees.length > 0) {
      event.attendees = attendees.map(email => ({
        email,
        responseStatus: 'needsAction',
      }));
      event.guestsCanModify = false;
      event.guestsCanInviteOthers = false;
      event.guestsCanSeeOtherGuests = true;
    }

    // Build URL with conferenceDataVersion if adding Meet
    const defaultCalId = await getDefaultCalendarId(req.userId);
    let url = `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(defaultCalId)}/events`;
    if (addMeet) {
      url += '?conferenceDataVersion=1&sendUpdates=all';
    } else if (attendees.length > 0) {
      url += '?sendUpdates=all';
    }

    const response = await fetch(url, {
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

    // Extract Meet link if created
    const meetLink = eventData.conferenceData?.entryPoints?.find(
      ep => ep.entryPointType === 'video'
    )?.uri;

    // Save mapping if deal provided
    if (dealId) {
      await query(
        `INSERT INTO google_calendar_events 
         (user_id, crm_deal_id, google_event_id, google_calendar_id, event_summary, event_start, event_end, meet_link)
         VALUES ($1, $2, $3, 'primary', $4, $5, $6, $7)
         ON CONFLICT (user_id, google_event_id) DO UPDATE SET
           crm_deal_id = EXCLUDED.crm_deal_id,
           event_summary = EXCLUDED.event_summary,
           event_start = EXCLUDED.event_start,
           event_end = EXCLUDED.event_end,
           meet_link = EXCLUDED.meet_link,
           sync_status = 'synced',
           last_synced_at = NOW()`,
        [req.userId, dealId, eventData.id, title, startDateTime, endDateTime, meetLink]
      );
      
      // Update deal's last_activity_at
      await query(
        `UPDATE crm_deals SET last_activity_at = NOW() WHERE id = $1`,
        [dealId]
      );
    }

    // Update last sync
    await query(
      `UPDATE google_oauth_tokens SET last_sync_at = NOW() WHERE user_id = $1`,
      [req.userId]
    );

    logInfo(`Meeting created with Meet=${!!meetLink} for user ${req.userId}${dealId ? ` linked to deal ${dealId}` : ''}`);

    res.json({ 
      success: true, 
      eventId: eventData.id, 
      htmlLink: eventData.htmlLink,
      meetLink: meetLink || null,
    });
  } catch (error) {
    logError('Error creating meeting with Meet:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get scheduled meetings for a deal
router.get('/deal-meetings/:dealId', async (req, res) => {
  try {
    const { dealId } = req.params;
    
    // Get all upcoming meetings linked to this deal
    const result = await query(
      `SELECT gce.*, u.name as created_by_name
       FROM google_calendar_events gce
       LEFT JOIN users u ON u.id = gce.user_id
       WHERE gce.crm_deal_id = $1 
         AND gce.event_start > NOW()
         AND gce.sync_status = 'synced'
       ORDER BY gce.event_start ASC`,
      [dealId]
    );
    
    res.json(result.rows);
  } catch (error) {
    logError('Error fetching deal meetings:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
