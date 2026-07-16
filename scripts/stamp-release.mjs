import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';

const [releaseArg, version] = process.argv.slice(2);

if (!releaseArg || !version) {
  console.error('usage: node scripts/stamp-release.mjs <release-dir> <deploy-version>');
  process.exit(2);
}
if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(version)) {
  console.error(`unsafe deploy version: ${version}`);
  process.exit(2);
}

const releaseDir = resolve(releaseArg);
const INDEX_VERSION = /(<script type="text\/plain" id="db-asset-version">var v = ')[^']*('<\/script>)/;
const SW_VERSION = /const DEPLOY_VERSION = '[^']*'; \/\/ __DARKBEAR_DEPLOY_VERSION__/;
const SW_PRECACHE = /const PRECACHE_JSON = '[^\n]*'; \/\/ __DARKBEAR_PRECACHE_JSON__/;
const NEVER_CACHE = new Set(['index.html', 'sw.js', 'robots.txt']);

function singleQuotedJavaScriptString(value) {
  return `'${value
    .replaceAll('\\', '\\\\')
    .replaceAll("'", "\\'")
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029')}'`;
}

async function releaseFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) files.push(...await releaseFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

const files = await releaseFiles(releaseDir);
const precacheUrls = files
  .map((path) => relative(releaseDir, path).split(sep).join('/'))
  .filter((path) => !NEVER_CACHE.has(path))
  .sort()
  .map((path) => `/darkbear/${path}`);

for (const required of ['/darkbear/offline.html', '/darkbear/offline.js', '/darkbear/favicon.svg']) {
  if (!precacheUrls.includes(required)) {
    throw new Error(`release is missing required offline asset: ${required}`);
  }
}
if (precacheUrls.some((url) => url.endsWith('/index.html') || url.endsWith('/sw.js'))) {
  throw new Error('HTML or service worker entered the immutable precache manifest');
}

const indexPath = resolve(releaseDir, 'index.html');
const swPath = resolve(releaseDir, 'sw.js');
const indexSource = await readFile(indexPath, 'utf8');
const swSource = await readFile(swPath, 'utf8');
if (!INDEX_VERSION.test(indexSource) || !SW_VERSION.test(swSource) || !SW_PRECACHE.test(swSource)) {
  throw new Error('release stamp markers are missing or ambiguous');
}

const stampedIndex = indexSource.replace(INDEX_VERSION, `$1${version}$2`);
const precacheLiteral = singleQuotedJavaScriptString(JSON.stringify(precacheUrls));
const stampedWorker = swSource
  .replace(SW_VERSION, `const DEPLOY_VERSION = '${version}'; // __DARKBEAR_DEPLOY_VERSION__`)
  .replace(
    SW_PRECACHE,
    `const PRECACHE_JSON = ${precacheLiteral}; // __DARKBEAR_PRECACHE_JSON__`,
  );

await writeFile(indexPath, stampedIndex);
await writeFile(swPath, stampedWorker);
console.log(`stamped ${version} with ${precacheUrls.length} immutable offline assets`);
