const DEFAULT_PRODUCTION_API_URL = 'https://www.courttimeapp.com';

function readEnv(name) {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function upsertPlugin(plugins, nextPlugin) {
  const nextName = Array.isArray(nextPlugin) ? nextPlugin[0] : nextPlugin;
  const existingIndex = plugins.findIndex((plugin) => {
    const pluginName = Array.isArray(plugin) ? plugin[0] : plugin;
    return (
      pluginName === nextName ||
      (pluginName === '@sentry/react-native' && nextName === '@sentry/react-native/expo') ||
      (pluginName === '@sentry/react-native/expo' && nextName === '@sentry/react-native')
    );
  });

  if (existingIndex === -1) {
    plugins.push(nextPlugin);
  } else {
    plugins[existingIndex] = nextPlugin;
  }
}

module.exports = ({ config }) => {
  const productionApiUrl = (
    readEnv('EXPO_PUBLIC_PRODUCTION_API_URL') || DEFAULT_PRODUCTION_API_URL
  ).replace(/\/+$/, '');

  const buildProfile = readEnv('EAS_BUILD_PROFILE');
  const appEnv =
    buildProfile === 'production'
      ? 'production'
      : buildProfile === 'preview'
        ? 'preview'
        : 'development';

  const sentryOrg = readEnv('SENTRY_ORG');
  const sentryProject = readEnv('SENTRY_PROJECT');
  const sentryUrl = readEnv('SENTRY_URL');
  const sentryPlugin =
    sentryOrg && sentryProject
      ? [
          '@sentry/react-native/expo',
          {
            organization: sentryOrg,
            project: sentryProject,
            ...(sentryUrl ? { url: sentryUrl } : {}),
          },
        ]
      : '@sentry/react-native';

  const plugins = Array.isArray(config.plugins) ? [...config.plugins] : [];
  upsertPlugin(plugins, sentryPlugin);

  const existingExtra = config.extra || {};
  const existingEas = typeof existingExtra.eas === 'object' && existingExtra.eas != null ? existingExtra.eas : {};
  const existingSentry =
    typeof existingExtra.sentry === 'object' && existingExtra.sentry != null ? existingExtra.sentry : {};
  const easProjectId = readEnv('EXPO_PUBLIC_EAS_PROJECT_ID') || existingEas.projectId || null;
  const sentryDsn = readEnv('EXPO_PUBLIC_SENTRY_DSN');

  return {
    ...config,
    plugins,
    extra: {
      ...existingExtra,
      appEnv,
      productionApiUrl,
      ...(buildProfile ? { buildProfile } : {}),
      ...(easProjectId || Object.keys(existingEas).length > 0
        ? {
            eas: {
              ...existingEas,
              ...(easProjectId ? { projectId: easProjectId } : {}),
            },
          }
        : {}),
      ...(sentryDsn || Object.keys(existingSentry).length > 0
        ? {
            sentry: {
              ...existingSentry,
              ...(sentryDsn ? { dsn: sentryDsn } : {}),
            },
          }
        : {}),
    },
  };
};
