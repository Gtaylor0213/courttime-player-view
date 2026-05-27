export function isSessionAuthError(message?: string): boolean {
  if (!message) return false;
  return (
    message === 'Invalid or expired token' ||
    message === 'Authentication required'
  );
}
