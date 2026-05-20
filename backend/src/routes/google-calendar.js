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

// Store state tokens temporarily
const stateTokens = new Map();

// ============================================
// OAUTH FLOW
// ============================================

router.get('/auth-url', authenticate, async (req, res) => {
  try {
    if (!GOOGLE_CLIENT_ID) {
      return res.status(500).json({ error: 'Google OAuth not configured' });
    }
    const state = crypto.randomBytes(32).toString('hex');
    stateTokens.set(state, { userId: req.userId, expires: Date.now() + 600000 });
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: GOOGLE_REDIRECT_URI,
      response_type: 'code',
      scope: SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      state,
    });
    res.json({ url: `${GOOGLE_AUTH_URL}?${params.toString()}` });
  } catch (error) {
    logError('Error generating auth URL:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/callback', async (req, res) => {
  try {
    const { code, state, error: oauthError } = req.query;
    if (oauthError) return res.redirect(`${FRONTEND_URL}/crm/configuracoes?google_error=${encodeURIComponent(oauthError)}`);
    if (!code || !state) return res.redirect(`${FRONTEND_URL}/crm/configuracoes?google_error=missing_params`);

    const stateData = stateTokens.get(state);
    if (!stateData || stateData.expires < Date.now()) {
      stateTokens.delete(state);
      return res.redirect(`${FRONTEND_URL}/crm/configuracoes?google_error=invalid_state`);
    }

    const userId = stateData.userId;
    stateTokens.delete(state);

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
    if (!tokenResponse.ok) return res.redirect(`${FRONTEND_URL}/crm/configuracoes?google_error=${encodeURIComponent(tokenData.error || 'token_exchange_failed')}`);

    const userInfoResponse = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userInfo = await userInfoResponse.json();
    const expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000));

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

router.use(authenticate);

// ============================================
// HELPERS
// ============================================

async function getValidAccessToken(userId) {
  const result = await query(`SELECT * FROM google_oauth_tokens WHERE user_id = $1 AND is_active = true`, [userId]);
  if (!result.rows[0]) throw new Error('Google Calendar não conectado');
  let token = result.rows[0];

  if (new Date(token.expires_at) <= new Date(Date.now() + 300000)) {
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
      await query(`UPDATE google_oauth_tokens SET is_active = false, last_error = $1 WHERE user_id = $2`, [refreshData.error || 'refresh_failed', userId]);
      throw new Error('Falha ao renovar token. Reconecte sua conta Google.');
    }
    const newExpiresAt = new Date(Date.now() + (refreshData.expires_in * 1000));
    await query(`UPDATE google_oauth_tokens SET access_token = $1, expires_at = $2, last_error = NULL, updated_at = NOW() WHERE user_id = $3`, [refreshData.access_token, newExpiresAt, userId]);
    token.access_token = refreshData.access_token;
  }
  return token.access_token;
}

async function getDefaultCalendarId(userId) {
  const result = await query(`SELECT default_calendar_id FROM google_oauth_tokens WHERE user_id = $1`, [userId]);
  return result.rows[0]?.default_calendar_id || 'primary';
}

function normalizeEvent(event, userId, calendarId) {
  const start = event.start?.dateTime || event.start?.date;
  const end = event.end?.dateTime || event.end?.date;
  
  return {
    user_id: userId,
    google_calendar_id: calendarId,
    google_event_id: event.id,
    summary: event.summary || '',
    description: event.description || '',
    location: event.location || '',
    start_datetime: start,
    end_datetime: end,
    timezone: event.start?.timeZone || 'America/Sao_Paulo',
    status: event.status || 'confirmed',
    html_link: event.htmlLink,
    meet_link: event.conferenceData?.entryPoints?.find(ep => ep.entryPointType === 'video')?.uri || null,
    attendees_json: JSON.stringify(event.attendees || []),
    reminders_json: JSON.stringify(event.reminders || {}),
    google_created_at: event.created,
    google_updated_at: event.updated,
    synced_at: new Date().toISOString()
  };
}

// ============================================
// SYNC LOGIC
// ============================================

async function syncUserCalendars(userId, syncType = 'manual') {
  const logIdResult = await query(
    `INSERT INTO google_calendar_sync_logs (user_id, sync_type, status, started_at) VALUES ($1, $2, 'running', NOW()) RETURNING id`,
    [userId, syncType]
  );
  const logId = logIdResult.rows[0].id;

  try {
    const accessToken = await getValidAccessToken(userId);
    const tokenResult = await query(`SELECT selected_calendars, sync_tokens, tenant_id FROM google_oauth_tokens WHERE user_id = $1`, [userId]);
    const { selected_calendars: selected, sync_tokens: tokens = {}, tenant_id } = tokenResult.rows[0];
    
    // Get actual list from Google to ensure valid IDs
    const listRes = await fetch(`${GOOGLE_CALENDAR_API}/users/me/calendarList`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const listData = await listRes.json();
    if (!listRes.ok) throw new Error(listData.error?.message || 'Failed to fetch calendar list');

    let calendarsToSync = listData.items.filter(c => c.accessRole !== 'freeBusyReader');
    if (Array.isArray(selected) && selected.length > 0) {
      calendarsToSync = calendarsToSync.filter(c => selected.includes(c.id));
    }

    let created = 0, updated = 0, cancelled = 0, failed = 0;
    const nextSyncTokens = { ...tokens };

    for (const cal of calendarsToSync) {
      const params = new URLSearchParams({ singleEvents: 'true' });
      if (tokens[cal.id]) params.append('syncToken', tokens[cal.id]);
      else params.append('timeMin', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

      try {
        const eventsRes = await fetch(`${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(cal.id)}/events?${params.toString()}`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        const eventsData = await eventsRes.json();
        
        if (eventsRes.status === 410) { // Token invalid, full sync needed
          delete nextSyncTokens[cal.id];
          continue; // Will retry on next pass or we could recursive call
        }
        if (!eventsRes.ok) { failed++; continue; }

        for (const item of (eventsData.items || [])) {
          if (item.status === 'cancelled') {
            await query(`UPDATE google_calendar_events SET status = 'cancelled', deleted_at = NOW() WHERE user_id = $1 AND google_event_id = $2`, [userId, item.id]);
            cancelled++;
          } else {
            const n = normalizeEvent(item, userId, cal.id);
            const res = await query(
              `INSERT INTO google_calendar_events 
               (user_id, google_calendar_id, google_event_id, event_summary, description, location, event_start, event_end, timezone, status, html_link, meet_link, attendees_json, reminders_json, google_created_at, google_updated_at, synced_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
               ON CONFLICT (user_id, google_event_id) DO UPDATE SET
                 event_summary = EXCLUDED.event_summary,
                 description = EXCLUDED.description,
                 location = EXCLUDED.location,
                 event_start = EXCLUDED.event_start,
                 event_end = EXCLUDED.event_end,
                 status = EXCLUDED.status,
                 meet_link = EXCLUDED.meet_link,
                 google_updated_at = EXCLUDED.google_updated_at,
                 synced_at = NOW()
               RETURNING (xmax = 0) as inserted`,
              [n.user_id, n.google_calendar_id, n.google_event_id, n.summary, n.description, n.location, n.start_datetime, n.end_datetime, n.timezone, n.status, n.html_link, n.meet_link, n.attendees_json, n.reminders_json, n.google_created_at, n.google_updated_at, n.synced_at]
            );
            if (res.rows[0].inserted) created++; else updated++;
          }
        }
        if (eventsData.nextSyncToken) nextSyncTokens[cal.id] = eventsData.nextSyncToken;
      } catch (err) {
        logError(`Sync failed for calendar ${cal.id}`, err);
        failed++;
      }
    }

    await query(
      `UPDATE google_oauth_tokens SET sync_tokens = $1, last_sync_at = NOW(), last_error = NULL WHERE user_id = $2`,
      [JSON.stringify(nextSyncTokens), userId]
    );

    await query(
      `UPDATE google_calendar_sync_logs SET status = 'success', finished_at = NOW(), events_created = $1, events_updated = $2, events_cancelled = $3, events_failed = $4 WHERE id = $5`,
      [created, updated, cancelled, failed, logId]
    );

    return { created, updated, cancelled, failed };
  } catch (error) {
    logError('Sync process failed:', error);
    await query(`UPDATE google_calendar_sync_logs SET status = 'failed', finished_at = NOW(), error_message = $1 WHERE id = $2`, [error.message, logId]);
    throw error;
  }
}

// ============================================
// ROUTES
// ============================================

router.get('/status', async (req, res) => {
  try {
    const result = await query(`SELECT * FROM google_oauth_tokens WHERE user_id = $1`, [req.userId]);
    if (!result.rows[0]) return res.json({ connected: false });
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
    res.status(500).json({ error: error.message });
  }
});

router.post('/sync', async (req, res) => {
  try {
    logInfo(`Manual sync requested for user ${req.userId}`);
    const result = await syncUserCalendars(req.userId, 'manual');
    res.json({ success: true, ...result });
  } catch (error) {
    logError(`Manual sync failed for user ${req.userId}:`, error);
    res.status(500).json({ error: error.message || 'Erro interno na sincronização' });
  }
});

router.get('/calendars', async (req, res) => {
  try {
    const accessToken = await getValidAccessToken(req.userId);
    const response = await fetch(`${GOOGLE_CALENDAR_API}/users/me/calendarList`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message);

    const prefResult = await query(`SELECT selected_calendars FROM google_oauth_tokens WHERE user_id = $1`, [req.userId]);
    const selected = prefResult.rows[0]?.selected_calendars || null;

    const calendars = (data.items || []).map(cal => ({
      id: cal.id,
      summary: cal.summary,
      description: cal.description,
      primary: cal.primary || false,
      backgroundColor: cal.backgroundColor,
      foregroundColor: cal.foregroundColor,
      accessRole: cal.accessRole,
      selected: selected === null ? true : (Array.isArray(selected) ? selected.includes(cal.id) : true),
    }));
    res.json(calendars);
  } catch (error) {
    res.json([]);
  }
});

router.put('/calendars/selected', async (req, res) => {
  try {
    await query(`UPDATE google_oauth_tokens SET selected_calendars = $1, updated_at = NOW() WHERE user_id = $2`, [JSON.stringify(req.body.calendarIds || []), req.userId]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/calendars/default', async (req, res) => {
  try {
    await query(`UPDATE google_oauth_tokens SET default_calendar_id = $1, updated_at = NOW() WHERE user_id = $2`, [req.body.calendarId || null, req.userId]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/events', async (req, res) => {
  try {
    const { timeMin, timeMax } = req.query;
    let sql = `SELECT * FROM google_calendar_events WHERE user_id = $1 AND status != 'cancelled' AND deleted_at IS NULL`;
    const params = [req.userId];

    if (timeMin) {
      params.push(timeMin);
      sql += ` AND event_start >= $${params.length}`;
    }
    if (timeMax) {
      params.push(timeMax);
      sql += ` AND event_start <= $${params.length}`;
    }
    sql += ` ORDER BY event_start ASC`;

    const result = await query(sql, params);
    res.json(result.rows.map(r => ({
      id: r.google_event_id,
      summary: r.event_summary,
      description: r.description,
      location: r.location,
      start: { dateTime: r.event_start, timeZone: r.timezone },
      end: { dateTime: r.event_end, timeZone: r.timezone },
      htmlLink: r.html_link,
      meetLink: r.meet_link,
      calendarId: r.google_calendar_id
    })));
  } catch (error) {
    res.json([]);
  }
});

router.post('/events', async (req, res) => {
  try {
    const { title, description, startDateTime, endDateTime, location, taskId, dealId, calendarId: reqCalId } = req.body;
    const accessToken = await getValidAccessToken(req.userId);
    const calendarId = reqCalId || await getDefaultCalendarId(req.userId);

    const event = {
      summary: title,
      description: description || '',
      location: location || '',
      start: { dateTime: startDateTime, timeZone: 'America/Sao_Paulo' },
      end: { dateTime: endDateTime, timeZone: 'America/Sao_Paulo' },
    };

    const response = await fetch(`${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });
    const eventData = await response.json();
    if (!response.ok) throw new Error(eventData.error?.message || 'Erro ao criar evento');

    const n = normalizeEvent(eventData, req.userId, calendarId);
    await query(
      `INSERT INTO google_calendar_events 
       (user_id, google_calendar_id, google_event_id, crm_task_id, crm_deal_id, event_summary, description, location, event_start, event_end, timezone, status, html_link, meet_link, created_by_legal_gleego, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, true, 'crm')`,
      [req.userId, calendarId, eventData.id, taskId || null, dealId || null, n.summary, n.description, n.location, n.start_datetime, n.end_datetime, n.timezone, n.status, n.html_link, n.meet_link]
    );

    res.json({ success: true, eventId: eventData.id, htmlLink: eventData.htmlLink });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/events/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    const { title, description, startDateTime, endDateTime, location } = req.body;
    const accessToken = await getValidAccessToken(req.userId);
    const calResult = await query(`SELECT google_calendar_id FROM google_calendar_events WHERE user_id = $1 AND google_event_id = $2`, [req.userId, eventId]);
    const calendarId = calResult.rows[0]?.google_calendar_id || 'primary';

    const event = {
      summary: title,
      description: description || '',
      location: location || '',
      start: { dateTime: startDateTime, timeZone: 'America/Sao_Paulo' },
      end: { dateTime: endDateTime, timeZone: 'America/Sao_Paulo' },
    };

    const response = await fetch(`${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });
    const eventData = await response.json();
    if (!response.ok) throw new Error(eventData.error?.message || 'Erro ao atualizar');

    await query(
      `UPDATE google_calendar_events SET event_summary = $1, description = $2, location = $3, event_start = $4, event_end = $5, synced_at = NOW() WHERE user_id = $6 AND google_event_id = $7`,
      [title, description, location, startDateTime, endDateTime, req.userId, eventId]
    );

    res.json({ success: true, eventId: eventData.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/events/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    const accessToken = await getValidAccessToken(req.userId);
    const calResult = await query(`SELECT google_calendar_id FROM google_calendar_events WHERE user_id = $1 AND google_event_id = $2`, [req.userId, eventId]);
    const calendarId = calResult.rows[0]?.google_calendar_id || 'primary';

    const response = await fetch(`${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok && response.status !== 404) throw new Error('Erro ao deletar');

    await query(`UPDATE google_calendar_events SET status = 'cancelled', deleted_at = NOW() WHERE user_id = $1 AND google_event_id = $2`, [req.userId, eventId]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/sync-task/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { calendarId: reqCalId } = req.body;
    const taskResult = await query(`SELECT t.*, d.id as deal_id FROM crm_tasks t LEFT JOIN crm_deals d ON d.id = t.deal_id WHERE t.id = $1`, [taskId]);
    if (!taskResult.rows[0]) return res.status(404).json({ error: 'Tarefa não encontrada' });
    const task = taskResult.rows[0];
 
    const accessToken = await getValidAccessToken(req.userId);
    const calendarId = reqCalId || await getDefaultCalendarId(req.userId);

    const existingSync = await query(`SELECT google_event_id FROM google_calendar_events WHERE user_id = $1 AND crm_task_id = $2`, [req.userId, taskId]);

    const startDate = new Date(task.due_date);
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
    const event = {
      summary: task.title,
      description: task.description || '',
      start: { dateTime: startDate.toISOString(), timeZone: 'America/Sao_Paulo' },
      end: { dateTime: endDate.toISOString(), timeZone: 'America/Sao_Paulo' },
    };

    let method = 'POST', url = `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`;
    if (existingSync.rows[0]) {
      method = 'PUT';
      url += `/${existingSync.rows[0].google_event_id}`;
    }

    const response = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });
    const eventData = await response.json();
    if (!response.ok) throw new Error(eventData.error?.message || 'Erro ao sincronizar');

    await query(
      `INSERT INTO google_calendar_events 
       (user_id, crm_task_id, crm_deal_id, google_event_id, google_calendar_id, event_summary, event_start, event_end, status, created_by_legal_gleego)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'confirmed', true)
       ON CONFLICT (user_id, google_event_id) DO UPDATE SET
         event_summary = EXCLUDED.event_summary,
         event_start = EXCLUDED.event_start,
         event_end = EXCLUDED.event_end,
         synced_at = NOW()`,
      [req.userId, taskId, task.deal_id, eventData.id, calendarId, task.title, startDate.toISOString(), endDate.toISOString()]
    );

    res.json({ success: true, eventId: eventData.id, htmlLink: eventData.htmlLink });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/events-with-meet', async (req, res) => {
  try {
    const { title, description, startDateTime, endDateTime, addMeet, attendees = [], dealId, calendarId: reqCalId } = req.body;
    const accessToken = await getValidAccessToken(req.userId);
    const calendarId = reqCalId || await getDefaultCalendarId(req.userId);


    const event = {
      summary: title,
      description: description || '',
      start: { dateTime: startDateTime, timeZone: 'America/Sao_Paulo' },
      end: { dateTime: endDateTime, timeZone: 'America/Sao_Paulo' },
      reminders: { useDefault: true },
    };

    if (addMeet) {
      event.conferenceData = { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } } };
    }
    if (attendees.length > 0) {
      event.attendees = attendees.map(email => ({ email, responseStatus: 'needsAction' }));
    }

    let url = `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1&sendUpdates=all`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });
    const eventData = await response.json();
    if (!response.ok) throw new Error(eventData.error?.message || 'Erro ao criar');

    const meetLink = eventData.conferenceData?.entryPoints?.find(ep => ep.entryPointType === 'video')?.uri || null;
    await query(
      `INSERT INTO google_calendar_events 
       (user_id, crm_deal_id, google_event_id, google_calendar_id, event_summary, event_start, event_end, meet_link, created_by_legal_gleego)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)`,
      [req.userId, dealId || null, eventData.id, calendarId, title, startDateTime, endDateTime, meetLink]
    );

    res.json({ success: true, eventId: eventData.id, htmlLink: eventData.htmlLink, meetLink });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/disconnect', async (req, res) => {
  try {
    await query(`UPDATE google_oauth_tokens SET is_active = false WHERE user_id = $1`, [req.userId]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
