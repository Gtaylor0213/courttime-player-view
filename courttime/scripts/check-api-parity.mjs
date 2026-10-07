#!/usr/bin/env node
/**
 * Web ↔ mobile API parity check (plan item D1).
 *
 * Extracts every `/api/...` path literal used by the web client (src/) and the
 * mobile client (mobile/app, mobile/src), plus shared/ (counted for both),
 * normalises dynamic segments, and diffs them. A path the web calls that
 * mobile never calls must be listed under "## Web-only API paths" in
 * docs/mobile-web-sync.md, otherwise the script exits 1.
 *
 *   npm run parity:check          # fail on unlisted web-only paths
 *   npm run parity:check -- --list  # print both sets and the diff
 *
 * Allowlist entries may end in `*` to cover a prefix (e.g. `/api/super-admin/*`).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WEB_DIRS = ['src'];
const MOBILE_DIRS = ['mobile/app', 'mobile/src'];
const SHARED_DIRS = ['shared'];
const SYNC_DOC = join(ROOT, 'docs/mobile-web-sync.md');
const EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs']);
const SKIP_DIRS = new Set(['node_modules', '__tests__', '__mocks__', 'dist', 'build', '.expo']);

function* walk(dir) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) yield* walk(p);
    else if (EXTS.has(extname(name)) && !/\.(test|spec)\.[tj]sx?$/.test(name)) yield p;
  }
}

/** `/api/bookings/${id}/participants?x=1` → `/api/bookings/:id/participants` */
export function normalizePath(raw) {
  let p = raw.split('?')[0].split('#')[0];
  const M = '\u0000';
  p = p.replace(/\$\{[^}]*\}/g, M);
  // A template expression glued to the previous segment (`/x${qs}`, `/${id}${qs}`)
  // is a query string or suffix, not a path segment: drop it.
  p = p.replace(new RegExp(`([^/])${M}`, 'g'), '$1');
  p = p.replaceAll(M, ':id');
  p = p.replace(/\/:[A-Za-z_]+/g, '/:id');         // express-style params
  p = p.replace(/\/[0-9a-f]{8}-[0-9a-f-]{27}/gi, '/:id'); // literal uuids
  p = p.replace(/\/+$/, '');
  return p;
}

/** Same segment count and every segment equal, or a `:id` wildcard on either side. */
export function pathsMatch(a, b) {
  const x = a.split('/');
  const y = b.split('/');
  if (x.length !== y.length) return false;
  return x.every((seg, i) => seg === y[i] || seg === ':id' || y[i] === ':id');
}

const PATH_RE = /['"`](\/api\/[^'"`\s]*)['"`]/g;
export function extractPaths(source) {
  const out = new Set();
  for (const m of source.matchAll(PATH_RE)) {
    const raw = m[1];
    const norm = normalizePath(raw);
    if (norm === '/api' || norm === '/api/:id' || norm.endsWith('/:id/:id/:id')) continue;
    out.add(norm);
  }
  return out;
}

function collect(dirs) {
  const set = new Set();
  for (const d of dirs) for (const f of walk(join(ROOT, d))) for (const p of extractPaths(readFileSync(f, 'utf8'))) set.add(p);
  return set;
}

/** Backticked paths in the FIRST column of the table under "## Web-only API paths". */
export function readAllowlist(markdown) {
  const section = markdown.split(/^## Web-only API paths\s*$/m)[1];
  if (!section) return [];
  const body = section.split(/^## /m)[0];
  const out = [];
  for (const line of body.split('\n')) {
    if (!line.startsWith('|')) continue;
    const firstCell = line.slice(1).split('|')[0];
    for (const m of firstCell.matchAll(/`(\/api\/[^`]+)`/g)) out.push(m[1]);
  }
  return out;
}

function allowed(path, allowlist) {
  return allowlist.some((a) => {
    if (a.endsWith('/*')) {
      const prefix = a.slice(0, -2);
      return path === prefix || path.startsWith(`${prefix}/`);
    }
    if (a.endsWith('*')) return path.startsWith(a.slice(0, -1));
    return a === path;
  });
}

function main() {
  const list = process.argv.includes('--list');
  const shared = collect(SHARED_DIRS);
  const web = new Set([...collect(WEB_DIRS), ...shared]);
  const mobile = new Set([...collect(MOBILE_DIRS), ...shared]);
  const has = (set, p) => set.has(p) || [...set].some((q) => pathsMatch(p, q));
  const webOnly = [...web].filter((p) => !has(mobile, p)).sort();
  const mobileOnly = [...mobile].filter((p) => !has(web, p)).sort();
  const allowlist = readAllowlist(readFileSync(SYNC_DOC, 'utf8'));
  const unlisted = webOnly.filter((p) => !allowed(p, allowlist));
  const stale = allowlist.filter((a) => !a.endsWith('*') && !webOnly.includes(a));
  // (prefix entries are never reported stale)

  if (list) {
    console.log(`web paths: ${web.size}, mobile paths: ${mobile.size}`);
    console.log(`\nweb-only (${webOnly.length}):\n  ${webOnly.join('\n  ')}`);
    console.log(`\nmobile-only (${mobileOnly.length}):\n  ${mobileOnly.join('\n  ')}`);
  }
  if (stale.length) console.log(`note: ${stale.length} allowlist entr${stale.length === 1 ? 'y is' : 'ies are'} no longer web-only and can be removed from docs/mobile-web-sync.md:\n  ${stale.join('\n  ')}`);
  if (unlisted.length) {
    console.error(`\n✖ ${unlisted.length} API path${unlisted.length === 1 ? '' : 's'} used by web but not mobile and not listed under "## Web-only API paths" in docs/mobile-web-sync.md:\n  ${unlisted.join('\n  ')}\n\nEither add the mobile screen, or list the path there with a one-line reason.`);
    process.exit(1);
  }
  console.log(`✔ API parity: ${web.size} web paths, ${webOnly.length} web-only (all listed).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
