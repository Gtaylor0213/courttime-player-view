/**
 * Dynamic Expo config — keeps app.json as the source of truth and adds `extra`
 * so the JS client can read a stable production API origin (Expo Go + tunnel).
 */
const appJson = require('./app.json');

const productionApiUrl =
  process.env.EXPO_PUBLIC_PRODUCTION_API_URL?.trim() ||
  'https://www.courttimeapp.com';

module.exports = {
  expo: {
    ...appJson.expo,
    extra: {
      ...(appJson.expo.extra || {}),
      productionApiUrl: productionApiUrl.replace(/\/+$/, ''),
    },
  },
};
