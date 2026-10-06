/**
 * The runtime version is a fingerprint of everything native in the app. The
 * `extra` section of the app config is JS-only and app.config.js fills it in
 * per build profile (appEnv, buildProfile), so it must not count: otherwise
 * the fingerprint EAS computes on its builder never matches the one computed
 * on the machine that started the build, and the build fails.
 *
 * package.json scripts are skipped for the same reason: prebuild on the
 * builder rewrites the `ios` / `android` scripts to `expo run:*`.
 */
/** @type {import('@expo/fingerprint').Config} */
module.exports = {
  sourceSkips: ['ExpoConfigExtraSection', 'PackageJsonScriptsAll'],
};
