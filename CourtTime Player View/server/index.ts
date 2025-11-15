/**
 * CourtTime API Server
 * Express server for handling database operations
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { testConnection } from '../src/database/connection';

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

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
async function startServer() {
  try {
    // Test database connection
    console.log('🔌 Testing database connection...');
    const connected = await testConnection();

    if (!connected) {
      console.error('❌ Failed to connect to database');
      process.exit(1);
    }

    app.listen(PORT, () => {
      console.log(`\n🚀 CourtTime API Server running on port ${PORT}`);
      console.log(`📍 Health check: http://localhost:${PORT}/health`);
      console.log(`🔐 Auth API: http://localhost:${PORT}/api/auth`);
      console.log(`🏢 Facilities API: http://localhost:${PORT}/api/facilities`);
      console.log(`👥 Members API: http://localhost:${PORT}/api/members`);
      console.log(`\n✅ Server ready!\n`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
