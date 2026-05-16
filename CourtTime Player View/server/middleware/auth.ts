/**
 * JWT Authentication Middleware
 * Verifies Bearer tokens and attaches user info to the request
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_EXPIRES_IN = '7d';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required. Server cannot start without it.');
  }
  return secret;
}

export interface JwtPayload {
  userId: string;
  email: string;
  userType: 'player' | 'admin';
}

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * Generate a JWT token for a user
 */
export function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Verify and decode a JWT token
 */
export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as JwtPayload;
  } catch {
    return null;
  }
}

/**
 * Middleware: Require authentication
 * Returns 401 if no valid token is provided
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }

  const token = authHeader.slice(7);
  const payload = verifyToken(token);

  if (!payload) {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
    return;
  }

  req.user = payload;
  next();
}

/**
 * Middleware: Block payment-locked members from using the app.
 * Returns 402 with lockout info so the frontend can redirect to a payment wall.
 * Admin routes are expected to bypass this via route ordering in index.ts.
 */
export async function requireNotPaymentLocked(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) { next(); return; }

  // Inline import to avoid circular deps at module load time
  const { query } = await import('../../src/database/connection');
  const result = await query(
    `SELECT fm.facility_id, fm.payment_locked_at, f.name as facility_name
     FROM facility_memberships fm
     JOIN facilities f ON f.id = fm.facility_id
     WHERE fm.user_id = $1 AND fm.is_payment_locked = true
     LIMIT 1`,
    [req.user.userId]
  ).catch(() => ({ rows: [] as any[] }));

  if (result.rows.length > 0) {
    const row = result.rows[0];
    res.status(402).json({
      success: false,
      error: 'payment_locked',
      message: 'Your account has been locked pending payment. Please contact your facility administrator.',
      lockout: {
        facilityId: row.facility_id,
        facilityName: row.facility_name,
        lockedAt: row.payment_locked_at,
      },
    });
    return;
  }

  next();
}

/**
 * Middleware: Optional authentication
 * Attaches user if token is valid, but doesn't block if missing
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const payload = verifyToken(token);
    if (payload) {
      req.user = payload;
    }
  }

  next();
}
