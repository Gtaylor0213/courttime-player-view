/**
 * CourtTime API Server
 * Express server for handling database operations
 */

import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import { testConnection, closePool } from '../src/database/connection';

// Load environment variables
dotenv.config();

// Import routes
import authRoutes from './routes/auth';
import facilityRoutes from './routes/facilities';
import userRoutes from './routes/users';
import memberRoutes from './routes/members';
import playerProfileRoutes from './routes/playerProfile';
import hittingPartnerRoutes from './routes/hittingPartner';
import bulletinBoardRoutes from './routes/bulletinBoard';
import bookingRoutes from './routes/bookings';
import adminRoutes from './routes/admin';
import addressWhitelistRoutes from './routes/addressWhitelist';
import messagesRoutes from './routes/messages';
import notificationRoutes from './routes/notifications';
import developerRoutes from './routes/developer';
// Rules engine routes
import tiersRoutes from './routes/tiers';
import strikesRoutes from './routes/strikes';
import courtConfigRoutes from './routes/courtConfig';
import rulesRoutes from './routes/rules';
import householdsRoutes from './routes/households';

const app = express();
const PORT = process.env.PORT || 3001;

// Trust the first proxy (Render runs behind a reverse proxy)
app.set('trust proxy', 1);

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting middleware
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later.' },
});

const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// Apply global rate limit to all API routes
app.use('/api', globalLimiter);

// Apply stricter limits to auth endpoints
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);

// Apply moderate limits to sensitive actions
app.use('/api/auth/reset-password', sensitiveLimiter);
app.use('/api/strikes', sensitiveLimiter);

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/facilities', facilityRoutes);
app.use('/api/users', userRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/player-profile', playerProfileRoutes);
app.use('/api/hitting-partner', hittingPartnerRoutes);
app.use('/api/bulletin-board', bulletinBoardRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/address-whitelist', addressWhitelistRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/developer', developerRoutes);
// Rules engine routes
app.use('/api/tiers', tiersRoutes);
app.use('/api/strikes', strikesRoutes);
app.use('/api/court-config', courtConfigRoutes);
app.use('/api/rules', rulesRoutes);
app.use('/api/households', householdsRoutes);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Serve static files from the React app in production
if (process.env.NODE_ENV === 'production') {
  const buildPath = path.join(__dirname, '../build');
  app.use(express.static(buildPath));

  // Handle React routing - return index.html for any unknown routes
  // Express 5 requires {*path} syntax instead of *
  app.get('/{*path}', (_req, res) => {
    res.sendFile(path.join(buildPath, 'index.html'));
  });
} else {
  // 404 handler for development (API routes only)
  app.use((_req, res) => {
    res.status(404).json({ error: 'Route not found' });
  });
}

// Start server with graceful error handling
async function startServer() {
  try {
    console.log('🚀 Starting CourtTime API Server...\n');

    // Test database connection with retries
    const connected = await testConnection();

    if (!connected) {
      console.error('\n❌ FATAL: Unable to establish database connection after multiple attempts');
      console.error('⚠️  Server cannot start without database connection\n');
      process.exit(1);
    }

    // Start HTTP server
    const server = app.listen(PORT, () => {
      console.log(`\n${'='.repeat(60)}`);
      console.log('✅ CourtTime API Server Successfully Started!');
      console.log(`${'='.repeat(60)}`);
      console.log(`\n🌐 Server URL: http://localhost:${PORT}`);
      console.log(`📍 Health Check: http://localhost:${PORT}/health`);
      console.log(`\n🔗 Available API Endpoints:`);
      console.log(`   🔐 Authentication: /api/auth`);
      console.log(`   🏢 Facilities: /api/facilities`);
      console.log(`   👥 Members: /api/members`);
      console.log(`   👤 Player Profiles: /api/player-profile`);
      console.log(`   🎾 Hitting Partner: /api/hitting-partner`);
      console.log(`   📋 Bulletin Board: /api/bulletin-board`);
      console.log(`   📅 Bookings: /api/bookings`);
      console.log(`   🔧 Admin: /api/admin`);
      console.log(`   📍 Address Whitelist: /api/address-whitelist`);
      console.log(`   🔔 Notifications: /api/notifications`);
      console.log(`   💻 Developer Console: /api/developer`);
      console.log(`   🏆 Membership Tiers: /api/tiers`);
      console.log(`   ⚠️  Strikes: /api/strikes`);
      console.log(`   ⏰ Court Config: /api/court-config`);
      console.log(`   📜 Booking Rules: /api/rules`);
      console.log(`   🏠 Households: /api/households`);
      console.log(`\n${'='.repeat(60)}\n`);
    });

    // Handle server errors
    server.on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`\n❌ ERROR: Port ${PORT} is already in use`);
        console.error('💡 Try one of these solutions:');
        console.error('   1. Stop the other process using this port');
        console.error(`   2. Set a different port: PORT=3002 npm run server`);
        console.error('   3. On Windows, find and kill the process:');
        console.error(`      netstat -ano | findstr :${PORT}`);
        console.error('      taskkill /PID <PID> /F\n');
      } else {
        console.error('❌ Server error:', error);
      }
      process.exit(1);
    });

    // Graceful shutdown handling
    const gracefulShutdown = async (signal: string) => {
      console.log(`\n⚠️  ${signal} received, starting graceful shutdown...`);

      server.close(async () => {
        console.log('🔌 HTTP server closed');

        try {
          await closePool();
          console.log('✅ Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          console.error('❌ Error during shutdown:', error);
          process.exit(1);
        }
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        console.error('⚠️  Forcing shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    console.error('\n❌ FATAL ERROR: Failed to start server');
    console.error('Error details:', error);
    process.exit(1);
  }
}

startServer();

