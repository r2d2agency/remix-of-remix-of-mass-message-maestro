import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import cron from 'node-cron';
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
import chatRoutes from './routes/chat.js';
import { initDatabase } from './init-db.js';
import { executeNotifications } from './scheduler.js';
import { executeCampaignMessages } from './campaign-scheduler.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Handle preflight requests explicitly
app.options('*', cors());

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

app.use(express.json());

// Serve uploaded files statically with CORS headers
const uploadsDir = path.join(process.cwd(), 'uploads');
app.use('/uploads', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range');
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
    } else if (ext === '.mp4') {
      res.setHeader('Content-Type', 'video/mp4');
    } else if (ext === '.webm') {
      res.setHeader('Content-Type', 'video/webm');
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
app.use('/api/chat', chatRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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

    console.log('⏰ Notification scheduler started - checks every hour (timezone: America/Sao_Paulo)');
    console.log('📤 Campaign scheduler started - checks every 30 seconds');
  });
});
