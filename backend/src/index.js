import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import connectionsRoutes from './routes/connections.js';
import messagesRoutes from './routes/messages.js';
import contactsRoutes from './routes/contacts.js';
import campaignsRoutes from './routes/campaigns.js';
import organizationsRoutes from './routes/organizations.js';
import asaasRoutes from './routes/asaas.js';

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

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/connections', connectionsRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/contacts', contactsRoutes);
app.use('/api/campaigns', campaignsRoutes);
app.use('/api/organizations', organizationsRoutes);
app.use('/api/asaas', asaasRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 Blaster API running on port ${PORT}`);
});
