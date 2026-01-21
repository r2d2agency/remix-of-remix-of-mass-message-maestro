import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import cron from 'node-cron';
import crypto from 'crypto';
import authRoutes from './routes/auth.js';
import connectionsRoutes from './routes/connections.js';
import messagesRoutes from './routes/messages.js';
import contactsRoutes from './routes/contacts.js';
import campaignsRoutes from './routes/campaigns.js';
import organizationsRoutes from './routes/organizations.js';
import asaasRoutes from './routes/asaas.js';
import adminRoutes from './routes/admin.js';
import uploadsRoutes from './routes/uploads.js';
import notificationsRoutes from './routes/notifications.js';
import evolutionRoutes from './routes/evolution.js';
import wapiRoutes from './routes/wapi.js';
import chatRoutes from './routes/chat.js';
import quickRepliesRoutes from './routes/quick-replies.js';
import { initDatabase } from './init-db.js';
import { executeNotifications } from './scheduler.js';
import { executeCampaignMessages } from './campaign-scheduler.js';
import { executeScheduledMessages } from './scheduled-messages.js';
import { requestContext } from './request-context.js';
import { log, logError } from './logger.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Add CORS headers to EVERY response (must be absolute first)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  res.header('Access-Control-Max-Age', '86400');
  
  // Handle preflight immediately
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// CORS configuration - belt and suspenders
const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  credentials: false,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));


app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request-scoped context + correlation id for structured logs
app.use((req, res, next) => {
  const startedAt = Date.now();
  const rawHeader = req.headers['x-request-id'];
  const incomingRequestId = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  const requestId = (incomingRequestId && String(incomingRequestId).trim()) || crypto.randomUUID();

  requestContext.run(
    {
      request_id: requestId,
      http_method: req.method,
      http_path: req.originalUrl,
    },
    () => {
      req.requestId = requestId;
      res.setHeader('X-Request-Id', requestId);

      log('info', 'http.request', {
        http_method: req.method,
        http_path: req.originalUrl,
      });

      res.on('finish', () => {
        log('info', 'http.response', {
          http_method: req.method,
          http_path: req.originalUrl,
          status_code: res.statusCode,
          duration_ms: Date.now() - startedAt,
        });
      });

      next();
    }
  );
});

// Serve uploaded files statically with CORS headers
const uploadsDir = path.join(process.cwd(), 'uploads');
app.use('/uploads', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(uploadsDir, {
  setHeaders: (res, filePath) => {
    // Set correct MIME types for audio/video
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.ogg') {
      res.setHeader('Content-Type', 'audio/ogg');
    } else if (ext === '.mp3') {
      res.setHeader('Content-Type', 'audio/mpeg');
    } else if (ext === '.m4a') {
      res.setHeader('Content-Type', 'audio/mp4');
    } else if (ext === '.wav') {
      res.setHeader('Content-Type', 'audio/wav');
    } else if (ext === '.aac') {
      res.setHeader('Content-Type', 'audio/aac');
    } else if (ext === '.mp4') {
      res.setHeader('Content-Type', 'video/mp4');
    } else if (ext === '.webm') {
      // Many voice notes are stored as .webm; prefer audio/webm for broad compatibility
      res.setHeader('Content-Type', 'audio/webm');
    }
  }
}));


// Routes
app.use('/api/auth', authRoutes);
app.use('/api/connections', connectionsRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/contacts', contactsRoutes);
app.use('/api/campaigns', campaignsRoutes);
app.use('/api/organizations', organizationsRoutes);
app.use('/api/asaas', asaasRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/uploads', uploadsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/evolution', evolutionRoutes);
app.use('/api/wapi', wapiRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/quick-replies', quickRepliesRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Global error handler with CORS headers
app.use((err, req, res, next) => {
  logError('http.unhandled_error', err, {
    status_code: err?.status || 500,
  });
  
  // Ensure CORS headers are set even on errors
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    requestId: req.requestId || null,
  });
});

// Initialize database and start server
initDatabase().then((ok) => {
  if (!ok) {
    console.error('🛑 Server not started because database initialization failed (critical step).');
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`🚀 Whatsale API running on port ${PORT}`);

    // Schedule billing notifications - runs every hour to check rules with matching send_time
    // Each rule has its own send_time, the scheduler only executes rules matching current hour
    cron.schedule('0 * * * *', async () => {
      console.log('⏰ [CRON] Hourly notification check triggered at', new Date().toISOString());
      try {
        await executeNotifications();
      } catch (error) {
        console.error('⏰ [CRON] Error executing notifications:', error);
      }
    }, {
      timezone: 'America/Sao_Paulo'
    });

    // Schedule campaign messages - runs every 30 seconds to check for pending messages
    cron.schedule('*/30 * * * * *', async () => {
      try {
        await executeCampaignMessages();
      } catch (error) {
        console.error('📤 [CRON] Error executing campaign messages:', error);
      }
    }, {
      timezone: 'America/Sao_Paulo'
    });

    // Schedule message sender - runs every minute to check for due scheduled messages
    cron.schedule('* * * * *', async () => {
      try {
        await executeScheduledMessages();
      } catch (error) {
        console.error('📅 [CRON] Error executing scheduled messages:', error);
      }
    }, {
      timezone: 'America/Sao_Paulo'
    });

    console.log('⏰ Notification scheduler started - checks every hour (timezone: America/Sao_Paulo)');
    console.log('📤 Campaign scheduler started - checks every 30 seconds');
    console.log('📅 Scheduled messages started - checks every minute');
  });
});
