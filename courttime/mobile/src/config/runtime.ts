import Constants from 'expo-constants';

export type AppEnvironment = 'development' | 'preview' | 'production';

type PublicRuntimeConfig = {
  appEnv?: AppEnvironment;
  buildProfile?: string | null;
  productionApiUrl?: string | null;
  eas?: {
    projectId?: string | null;
  };
  sentry?: {
    dsn?: string | null;
  };
};

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function stripTrailingSlashes(url: string): string {
  return url.replace(/\/+$/, '');
}

const extra = ((Constants.expoConfig?.extra ?? {}) as PublicRuntimeConfig) || {};

const extraEas = typeof extra.eas === 'object' && extra.eas != null ? extra.eas : {};
const extraSentry = typeof extra.sentry === 'object' && extra.sentry != null ? extra.sentry : {};

const appEnv = extra.appEnv;

export const APP_ENV: AppEnvironment =
  appEnv === 'preview' || appEnv === 'production' ? appEnv : 'development';

export const BUILD_PROFILE = readNonEmptyString(extra.buildProfile);

// Always keep a public HTTPS default baked into the bundle so EAS preview/production
// builds never need to guess and never fall back to localhost-style URLs.
export const PRODUCTION_API_URL = stripTrailingSlashes(
  readNonEmptyString(extra.productionApiUrl) ?? 'https://www.courttimeapp.com'
);

export const EAS_PROJECT_ID = readNonEmptyString(extraEas.projectId);

export const SENTRY_DSN = readNonEmptyString(extraSentry.dsn);
