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
 *
 * When a facilityId can be extracted from the request (params, body, or query),
 * the check is scoped to that facility only — a user locked at Facility A should
 * still be able to book / interact at Facility B where they owe nothing.
 */
export async function requireNotPaymentLocked(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) { next(); return; }

  // Inline import to avoid circular deps at module load time
  const { query } = await import('../../src/database/connection');

  // Stripe payment callbacks — user has already paid, never block these.
  if (
    req.method === 'POST' &&
    (req.originalUrl.includes('/api/bookings/payment/confirm') ||
     req.originalUrl.includes('/api/bookings/payment/reconcile'))
  ) {
    next(); return;
  }

  // All booking reads are informational — locked users may still view the calendar
  // and their reservation history. Only write actions (create, cancel, etc.) are gated.
  if (req.method === 'GET' && req.originalUrl.startsWith('/api/bookings')) {
    next(); return;
  }

  // Cancelling a booking — locked users must be able to cancel their own reservations.
  // Ownership is enforced inside cancelBooking(); the lockout must not prevent this.
  if (req.method === 'DELETE' && /^\/api\/bookings\/[^/]+(\?|$)/.test(req.originalUrl)) {
    next(); return;
  }

  // Pay-per-court booking creation — if the court charges per booking the
  // booking service will redirect to Stripe, so the annual-fee lock must not
  // block this path.  Check the court's require_payment flag (inheriting from
  // parent court for split courts) before doing the lockout query.
  const courtId: string | undefined = (req.body as any)?.courtId;
  if (courtId && req.method === 'POST') {
    const courtResult = await query(
      `SELECT (COALESCE(c.require_payment, false) OR COALESCE(p.require_payment, false)) AS require_payment
         FROM courts c LEFT JOIN courts p ON p.id = c.parent_court_id
        WHERE c.id = $1`,
      [courtId]
    ).catch(() => ({ rows: [] as any[] }));
    if (courtResult.rows[0]?.require_payment) {
      next(); return;
    }
  }

  const facilityId: string | undefined =
    (req.params as any)?.facilityId ||
    (req.body as any)?.facilityId ||
    (req.query as any)?.facilityId;

  const sqlQuery = facilityId
    ? `SELECT fm.facility_id, fm.payment_locked_at, fm.lockout_amount_cents, fm.lockout_description,
              f.name as facility_name
         FROM facility_memberships fm
         JOIN facilities f ON f.id = fm.facility_id
        WHERE fm.user_id = $1 AND fm.facility_id = $2 AND fm.is_payment_locked = true
        LIMIT 1`
    : `SELECT fm.facility_id, fm.payment_locked_at, fm.lockout_amount_cents, fm.lockout_description,
              f.name as facility_name
         FROM facility_memberships fm
         JOIN facilities f ON f.id = fm.facility_id
        WHERE fm.user_id = $1 AND fm.is_payment_locked = true
        ORDER BY fm.payment_locked_at DESC NULLS LAST
        LIMIT 1`;

  const params = facilityId ? [req.user.userId, facilityId] : [req.user.userId];

  const result = await query(sqlQuery, params).catch(() => ({ rows: [] as any[] }));

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
        amountCents: row.lockout_amount_cents ?? null,
        description: row.lockout_description ?? null,
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
