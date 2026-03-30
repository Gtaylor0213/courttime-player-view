/**
 * JWT Authentication Middleware
 * Verifies Bearer tokens and attaches user info to the request
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'courttime-dev-secret-change-in-production';
const JWT_EXPIRES_IN = '7d';

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
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Verify and decode a JWT token
 */
export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
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
