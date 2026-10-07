/**
 * User-visible copy for failed API responses (shared by alerts and tests).
 */

export type ApiErrorCategory =
  | 'offline'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'server'
  | 'timeout'
  | 'unknown';

export type ApiFailureShape = {
  success: boolean;
  error?: string;
  errorMessage?: string;
  errorCategory?: ApiErrorCategory;
};

export function userFacingApiMessage(res: ApiFailureShape): string {
  if (res.success) return '';
  const fromServer = (res.error || res.errorMessage || '').trim();
  if (fromServer) return fromServer;
  switch (res.errorCategory) {
    case 'offline':
      return 'You appear to be offline. Please check your connection.';
    case 'timeout':
      return 'Request timed out. Please try again.';
    case 'unauthorized':
      return 'Your session expired. Please sign in again.';
    case 'forbidden':
      return "You don't have permission to do that.";
    case 'not_found':
      return 'That resource was not found.';
    case 'server':
      return 'The server had a problem. Please try again shortly.';
    default:
      return 'Something went wrong. Please try again.';
  }
}
