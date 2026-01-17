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
import { initDatabase } from './init-db.js';
import { executeNotifications } from './scheduler.js';

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

// Serve uploaded files statically
const uploadsDir = path.join(process.cwd(), 'uploads');
app.use('/uploads', express.static(uploadsDir));

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

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Initialize database and start server
initDatabase().then(() => {
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
    
    console.log('⏰ Notification scheduler started - checks every hour (timezone: America/Sao_Paulo)');
  });
});
