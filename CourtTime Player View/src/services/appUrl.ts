/**
 * Base URL of the web app, used when the server builds links (Stripe return
 * URLs, emails). Outside production DEV_APP_URL wins so a local API can point
 * back at a local web app.
 *
 * Note: several services still compute this inline with slightly different
 * fallbacks (APP_URL only, or APP_BASE_URL/CLIENT_URL). Those were left as-is;
 * only the two identical copies were consolidated here.
 */
export function defaultAppUrl(): string {
  return process.env.NODE_ENV !== 'production'
    ? process.env.DEV_APP_URL || 'http://localhost:5173'
    : process.env.APP_URL || 'http://localhost:5173';
}
