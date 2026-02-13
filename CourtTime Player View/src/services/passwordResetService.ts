import crypto from 'crypto';
import { query } from '../database/connection';
import * as bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;
const TOKEN_EXPIRY_HOURS = 1;
const RESEND_API_URL = 'https://api.resend.com/emails';

/**
 * Generate a secure random token
 */
function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Send password reset email via Resend
 */
async function sendResetEmail(email: string, token: string, fullName: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY is not set');
    return false;
  }

  const appUrl = process.env.APP_URL || 'http://localhost:5173';
  const resetLink = `${appUrl}/reset-password?token=${token}`;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'CourtTime <onboarding@resend.dev>';

  try {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [email],
        subject: 'Reset your CourtTime password',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #2563eb;">CourtTime Password Reset</h2>
            <p>Hi ${fullName},</p>
            <p>We received a request to reset your password. Click the button below to set a new password:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetLink}"
                 style="background-color: #2563eb; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                Reset Password
              </a>
            </div>
            <p style="color: #666; font-size: 14px;">This link will expire in ${TOKEN_EXPIRY_HOURS} hour.</p>
            <p style="color: #666; font-size: 14px;">If you didn't request this, you can safely ignore this email.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
            <p style="color: #999; font-size: 12px;">CourtTime - Court Booking Made Simple</p>
          </div>
        `,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Resend API error:', errorData);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Failed to send reset email:', error);
    return false;
  }
}

/**
 * Request a password reset - generates token and sends email
 */
export async function requestPasswordReset(email: string): Promise<{ success: boolean; message: string }> {
  try {
    // Look up user by email
    const userResult = await query(
      'SELECT id, full_name as "fullName" FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    // Always return success to prevent email enumeration
    if (userResult.rows.length === 0) {
      return { success: true, message: 'If an account exists with that email, a reset link has been sent.' };
    }

    const user = userResult.rows[0];

    // Invalidate any existing unused tokens for this user
    await query(
      'UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL',
      [user.id]
    );

    // Generate new token
    const token = generateToken();
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

    // Store token in database
    await query(
      'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, token, expiresAt.toISOString()]
    );

    // Send email
    const emailSent = await sendResetEmail(email.toLowerCase(), token, user.fullName);

    if (!emailSent) {
      return { success: false, message: 'Failed to send reset email. Please try again.' };
    }

    return { success: true, message: 'If an account exists with that email, a reset link has been sent.' };
  } catch (error) {
    console.error('Password reset request error:', error);
    return { success: false, message: 'An error occurred. Please try again.' };
  }
}

/**
 * Validate a password reset token
 */
export async function validateResetToken(token: string): Promise<{ valid: boolean; message?: string }> {
  try {
    const result = await query(
      `SELECT id, expires_at as "expiresAt", used_at as "usedAt"
       FROM password_reset_tokens
       WHERE token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return { valid: false, message: 'Invalid reset token' };
    }

    const tokenRow = result.rows[0];

    if (tokenRow.usedAt) {
      return { valid: false, message: 'This reset link has already been used' };
    }

    if (new Date(tokenRow.expiresAt) < new Date()) {
      return { valid: false, message: 'This reset link has expired' };
    }

    return { valid: true };
  } catch (error) {
    console.error('Token validation error:', error);
    return { valid: false, message: 'Failed to validate token' };
  }
}

/**
 * Reset password using a valid token
 */
export async function resetPassword(token: string, newPassword: string): Promise<{ success: boolean; message: string }> {
  try {
    // Find the token and associated user
    const tokenResult = await query(
      `SELECT prt.id as "tokenId", prt.user_id as "userId", prt.expires_at as "expiresAt", prt.used_at as "usedAt"
       FROM password_reset_tokens prt
       WHERE prt.token = $1`,
      [token]
    );

    if (tokenResult.rows.length === 0) {
      return { success: false, message: 'Invalid reset token' };
    }

    const tokenRow = tokenResult.rows[0];

    if (tokenRow.usedAt) {
      return { success: false, message: 'This reset link has already been used' };
    }

    if (new Date(tokenRow.expiresAt) < new Date()) {
      return { success: false, message: 'This reset link has expired' };
    }

    // Hash the new password
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    // Update user's password
    await query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [passwordHash, tokenRow.userId]
    );

    // Mark token as used
    await query(
      'UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1',
      [tokenRow.tokenId]
    );

    return { success: true, message: 'Password reset successfully' };
  } catch (error) {
    console.error('Password reset error:', error);
    return { success: false, message: 'Failed to reset password. Please try again.' };
  }
}
