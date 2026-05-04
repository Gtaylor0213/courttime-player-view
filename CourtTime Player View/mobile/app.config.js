const productionApiUrl =
  process.env.EXPO_PUBLIC_PRODUCTION_API_URL?.trim() ||
  'https://www.courttimeapp.com';

module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...(config.extra || {}),
    productionApiUrl: productionApiUrl.replace(/\/+$/, ''),
  },
});
