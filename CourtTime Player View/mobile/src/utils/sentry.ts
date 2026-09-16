import * as Sentry from '@sentry/react-native';
import { SENTRY_DSN } from '../config/runtime';

const enableEventsInThisRuntime =
  Boolean(SENTRY_DSN) && (!__DEV__ || process.env.EXPO_PUBLIC_SENTRY_ENABLE_IN_DEV === '1');

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    enabled: enableEventsInThisRuntime,
    // Keep production noise low, but allow an explicit opt-in for development verification.
    debug: __DEV__ && enableEventsInThisRuntime,
    // Off deliberately. With this on, Sentry attaches IP addresses and request
    // context to every event, which contradicts the privacy policy's statement
    // that Sentry receives an anonymized user identifier — the kind of mismatch
    // App Store review rejects. Nothing calls Sentry.setUser, so no diagnostic
    // value is lost.
    sendDefaultPii: false,
  });
}

export { Sentry };
export const hasSentryDsn = Boolean(SENTRY_DSN);
