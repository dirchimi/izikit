/**
 * gen-sw-precache.mjs — build step (runs right after `next build`).
 *
 * Offline-first needs EVERY JS/CSS chunk available offline, not just the ones a
 * device happened to fetch online. A never-visited route (e.g. /parametres)
 * otherwise fails with `ChunkLoadError: Failed to load chunk …` the moment it
 * is opened offline (the service worker only cached chunks fetched on demand).
 *
 * This scans the build output (`.next/static`) and writes the full list of
 * public asset URLs + the build id to `public/sw-precache.json`. The service
 * worker fetches it on install and pre-caches every asset, so any screen loads
 * offline. The build id also drives SW revisioning (see PwaRegistrar: it
 * registers `/sw.js?v=<buildId>`, so a new deploy installs a fresh SW that
 * re-precaches the new chunk set).
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = process.cwd(); // frontend/
const staticDir = join(root, '.next', 'static');
const buildId = readFileSync(join(root, '.next', 'BUILD_ID'), 'utf8').trim();

/** Recursively list every file under `dir`. */
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

// Only JS/CSS — the executable app shell. (Fonts/images are cache-first on
// demand and rarely block a route from rendering; keeping the precache to
// code bounds the install download.)
const assets = walk(staticDir)
  .filter((f) => /\.(?:js|css)$/.test(f))
  .map((f) => '/_next/static/' + relative(staticDir, f).split(sep).join('/'));

const manifest = { buildId, assets };
writeFileSync(join(root, 'public', 'sw-precache.json'), JSON.stringify(manifest));

console.log(`[gen-sw-precache] wrote ${assets.length} assets (buildId=${buildId})`);
