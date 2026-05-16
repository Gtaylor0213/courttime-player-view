/**
 * CourtTime API Server
 * Express server for handling database operations
 */

import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { testConnection, closePool } from '../src/database/connection';
import { processBulletinMinParticipantCancellations } from '../src/services/bulletinBoardService';

/** Load `.env`, then fill gaps from `.env.development`, then override with `.env.local`. */
function loadProjectEnv() {
  const root = path.resolve(process.cwd());
  const load = (name: string, override: boolean) => {
    const full = path.join(root, name);
    if (!fs.existsSync(full)) return;
    dotenv.config({ path: full, override });
  };
  load('.env', false);
  load('.env.development', false);
  load('.env.local', true);
}

loadProjectEnv();

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
import userPreferencesRoutes from './routes/userPreferences';
import supportRoutes from './routes/support';
// Rules engine routes
import strikesRoutes from './routes/strikes';
import courtConfigRoutes from './routes/courtConfig';
import rulesRoutes from './routes/rules';
import householdsRoutes from './routes/households';
import paymentRoutes from './routes/payments';
import webhookRoutes from './routes/webhook';
import facilityLocationsRoutes from './routes/facilityLocations';
import stripeConnectRoutes from './routes/stripeConnect';
import paymentItemsRoutes from './routes/paymentItems';
import connectPaymentsRoutes from './routes/connectPayments';
import connectWebhookRoutes from './routes/connectWebhook';
import { requireAuth, requireNotPaymentLocked } from './middleware/auth';

const app = express();
const PORT = Number(process.env.PORT) || 3001;
/** Bind all interfaces so phones / Expo Go on the same Wi‑Fi can reach the API */
const HOST = process.env.HOST || '0.0.0.0';

function logLanApiUrls(port: number) {
  if (process.env.NODE_ENV === 'production') return;
  try {
    const urls: string[] = [];
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] ?? []) {
        const fam = net.family as string | number;
        const v4 = fam === 'IPv4' || String(fam) === '4';
        if (v4 && !net.internal) {
          urls.push(`http://${net.address}:${port}`);
        }
      }
    }
    if (urls.length === 0) return;
    console.log(`\n📱 Expo Go / physical device: API is reachable at (same Wi‑Fi):`);
    for (const u of urls.slice(0, 6)) {
      console.log(`   ${u}`);
    }
    console.log('   Or rely on auto-detection: mobile app uses Metro hostUri in __DEV__.\n');
  } catch {
    console.warn(
      '\n⚠️  Could not list LAN addresses (os.networkInterfaces). Server is still running; use http://localhost:' +
        port +
        '/health on this machine, or your machine IP for Expo Go on the same Wi‑Fi.\n'
    );
  }
}

// Trust the first proxy (Render runs behind a reverse proxy)
app.set('trust proxy', 1);

// Stripe webhooks must be mounted BEFORE express.json() — they need the raw body for signature verification.
//  - webhookRoutes mounts POST /api/webhooks/stripe (platform subscription billing — existing, untouched).
//  - connectWebhookRoutes mounts POST /api/webhooks/stripe-connect (member→club Connect payments).
app.use('/api/webhooks', webhookRoutes);
app.use('/api/webhooks', connectWebhookRoutes);

// Middleware
app.use(cors({
  origin: function (origin, callback) {
    const allowed = [
      process.env.APP_URL,
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:8081',
    ].filter(Boolean);
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin || allowed.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true); // Allow all in dev; production is same-origin anyway
    }
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting middleware
const isProduction = process.env.NODE_ENV === 'production';
const skipRateLimitInDev = () => !isProduction;

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
  skip: skipRateLimitInDev,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later.' },
  skip: skipRateLimitInDev,
});

const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
  skip: skipRateLimitInDev,
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

/** Identifies the running server build (set by many hosts in CI; compare to `git rev-parse HEAD`). */
function deployFingerprint(): { commit?: string; deployId?: string } {
  const commit =
    process.env.RENDER_GIT_COMMIT ||
    process.env.GITHUB_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.CF_PAGES_COMMIT_SHA ||
    process.env.SOURCE_VERSION ||
    process.env.KOYEB_GIT_SHA ||
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    undefined;
  const deployId = process.env.RENDER_DEPLOY_ID || process.env.RAILWAY_DEPLOYMENT_ID || undefined;
  return { commit, deployId };
}

// Health check (public — use to verify production picked up the latest deploy)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    ...deployFingerprint(),
  });
});

// API Routes — public (no auth required)
app.use('/api/auth', authRoutes);
app.use('/api/facilities', facilityRoutes);
app.use('/api/developer', supportRoutes);
app.use('/api/payments', paymentRoutes);

// Stripe Connect (member→club payments). Mounted after the existing
// /api/payments routes so the legacy subscription routes always win on
// any path overlap. New paths: POST /api/payments/checkout,
// GET /api/payments/history?clubId=..., GET /api/payments/my-history.
app.use('/api/payments', connectPaymentsRoutes);
app.use('/api/stripe', stripeConnectRoutes);
app.use('/api/payment-items', paymentItemsRoutes);

// API Routes — protected (require valid JWT)
// Admin routes are NOT subject to payment lockout so admins can manage locked accounts.
app.use('/api/admin', requireAuth, adminRoutes);
app.use('/api/members', requireAuth, memberRoutes);
app.use('/api/users', requireAuth, userRoutes);
app.use('/api/player-profile', requireAuth, playerProfileRoutes);
app.use('/api/notifications', requireAuth, notificationRoutes);
app.use('/api/user-preferences', requireAuth, userPreferencesRoutes);
app.use('/api/facility-locations', requireAuth, facilityLocationsRoutes);

// Player-action routes — blocked when account has a payment lockout
app.use('/api/hitting-partner', requireAuth, requireNotPaymentLocked, hittingPartnerRoutes);
app.use('/api/bulletin-board', requireAuth, requireNotPaymentLocked, bulletinBoardRoutes);
app.use('/api/bookings', requireAuth, requireNotPaymentLocked, bookingRoutes);
app.use('/api/address-whitelist', requireAuth, requireNotPaymentLocked, addressWhitelistRoutes);
app.use('/api/messages', requireAuth, requireNotPaymentLocked, messagesRoutes);
app.use('/api/strikes', requireAuth, requireNotPaymentLocked, strikesRoutes);
app.use('/api/court-config', requireAuth, requireNotPaymentLocked, courtConfigRoutes);
app.use('/api/rules', requireAuth, requireNotPaymentLocked, rulesRoutes);
app.use('/api/households', requireAuth, requireNotPaymentLocked, householdsRoutes);

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

  // Handle React routing - return index.html for unknown routes (not static assets)
  // Express 5 requires {*path} syntax instead of *
  app.get('/{*path}', (req, res) => {
    if (/\.(?:png|jpe?g|gif|ico|svg|webp|webmanifest|json|txt|woff2?)$/i.test(req.path)) {
      res.status(404).end();
      return;
    }
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

    if (!process.env.JWT_SECRET?.trim()) {
      console.error('\n❌ FATAL: JWT_SECRET is not set.');
      console.error('   Copy .env.example to .env (or add JWT_SECRET to .env.local) and try again.\n');
      process.exit(1);
    }

    // Test database connection with retries
    const connected = await testConnection();

    if (!connected) {
      console.error('\n❌ FATAL: Unable to establish database connection after multiple attempts');
      console.error('⚠️  Server cannot start without database connection\n');
      process.exit(1);
    }

    // Start HTTP server
    const server = app.listen(PORT, HOST, () => {
      console.log(`\n${'='.repeat(60)}`);
      console.log('✅ CourtTime API Server Successfully Started!');
      console.log(`${'='.repeat(60)}`);
      console.log(`\n🌐 Listening on http://${HOST === '0.0.0.0' ? '0.0.0.0 (all interfaces)' : HOST}:${PORT}`);
      console.log(`📍 Health check (this machine): http://localhost:${PORT}/health`);
      logLanApiUrls(PORT);
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
      console.log(`   ⚠️  Strikes: /api/strikes`);
      console.log(`   ⏰ Court Config: /api/court-config`);
      console.log(`   📜 Booking Rules: /api/rules`);
      console.log(`   🏠 Households: /api/households`);
      console.log(`   💳 Stripe Connect: /api/stripe, /api/payment-items, /api/payments/checkout`);
      console.log(`\n${'='.repeat(60)}\n`);
    });

    let bulletinCancellationSweepRunning = false;
    const runBulletinCancellationSweep = async () => {
      if (bulletinCancellationSweepRunning) return;
      bulletinCancellationSweepRunning = true;
      try {
        const cancelledCount = await processBulletinMinParticipantCancellations();
        if (cancelledCount > 0) {
          console.log(`📧 Bulletin events cancelled for min participants: ${cancelledCount}`);
        }
      } catch (error) {
        console.error('Bulletin min participant cancellation sweep failed:', error);
      } finally {
        bulletinCancellationSweepRunning = false;
      }
    };
    await runBulletinCancellationSweep();
    const bulletinCancellationInterval = setInterval(runBulletinCancellationSweep, 60 * 1000);

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
        clearInterval(bulletinCancellationInterval);

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

