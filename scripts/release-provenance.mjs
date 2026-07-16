import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { lstat, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

const SCHEMA = 'darkbear.release-provenance/v1';
const MANIFEST_NAME = 'release.json';
const ARTIFACT_DIGEST_EXCLUSIONS = new Set(['index.html', 'sw.js', MANIFEST_NAME]);
const REQUIRED_SOURCE_FILES = [
  'index.html',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'vite.config.ts',
];
const MANIFEST_KEYS = [
  'schema',
  'version',
  'commit',
  'treeState',
  'sourceDigest',
  'artifactDigest',
  'builtAt',
  'tools',
];
const TOOL_KEYS = ['node', 'pnpm', 'vite'];
const SAFE_VERSION = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const FULL_COMMIT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const SHA256 = /^[0-9a-f]{64}$/;
const TOOL_VERSION = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const UTC_RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const MAX_MANIFEST_BYTES = 64 * 1024;

function fail(message, exitCode = 1) {
  console.error(`release provenance: ${message}`);
  process.exit(exitCode);
}

function usage() {
  fail(
    [
      'usage:',
      '  node scripts/release-provenance.mjs source-digest <repo>',
      '  node scripts/release-provenance.mjs digest <release-dir>',
      '  node scripts/release-provenance.mjs write <release-dir> <version> <full-commit> <clean|dirty> <source-digest> <artifact-digest> <built-at> <pnpm-version> <vite-version>',
      '  node scripts/release-provenance.mjs verify <release-dir> <expected-version>',
    ].join('\n'),
    2,
  );
}

function normalizedRelativePath(root, path) {
  const normalized = relative(root, path).split(sep).join('/');
  if (
    normalized.length === 0
    || normalized === '..'
    || normalized.startsWith('../')
    || normalized.includes('\0')
    || normalized.includes('\uFFFD')
  ) {
    throw new Error('encountered an unsafe or non-portable relative path');
  }
  return normalized;
}

function sourcePathIsTest(path) {
  const segments = path.split('/');
  if (segments.includes('__tests__') || segments.includes('__snapshots__')) return true;
  return /\.(?:test|spec)\.[^/]+$/.test(path);
}

async function collectTreeFiles(directory, root, options = {}) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    const normalized = normalizedRelativePath(root, path);
    if (options.exclude?.(normalized, entry)) continue;
    if (entry.isSymbolicLink()) {
      throw new Error(`symbolic links are not valid digest inputs: ${normalized}`);
    }
    if (entry.isDirectory()) {
      files.push(...await collectTreeFiles(path, root, options));
    } else if (entry.isFile()) {
      files.push({ path, normalized });
    } else {
      throw new Error(`special files are not valid digest inputs: ${normalized}`);
    }
  }
  return files;
}

async function requiredRegularFile(root, normalized) {
  const path = resolve(root, normalized);
  const stat = await lstat(path).catch(() => null);
  if (!stat?.isFile() || stat.isSymbolicLink()) {
    throw new Error(`required digest input is missing or not a regular file: ${normalized}`);
  }
  return { path, normalized };
}

async function sourceFiles(repo) {
  const root = resolve(repo);
  const files = [];
  for (const required of REQUIRED_SOURCE_FILES) {
    files.push(await requiredRegularFile(root, required));
  }

  const rootEntries = await readdir(root, { withFileTypes: true });
  const tsconfigs = rootEntries
    .filter((entry) => (
      entry.isFile()
      && entry.name.startsWith('tsconfig')
      && !entry.name.endsWith('.tsbuildinfo')
    ))
    .map((entry) => entry.name);
  if (tsconfigs.length === 0) {
    throw new Error('required digest input is missing: tsconfig*');
  }
  for (const name of tsconfigs) files.push(await requiredRegularFile(root, name));

  for (const sourceDirectory of ['src', 'public']) {
    const directory = resolve(root, sourceDirectory);
    const stat = await lstat(directory).catch(() => null);
    if (!stat?.isDirectory() || stat.isSymbolicLink()) {
      throw new Error(`required digest input is missing or not a directory: ${sourceDirectory}`);
    }
    files.push(...await collectTreeFiles(directory, root, {
      exclude: sourceDirectory === 'src'
        ? (path) => sourcePathIsTest(path)
        : undefined,
    }));
  }
  return files;
}

async function artifactFiles(releaseDirectory) {
  const root = resolve(releaseDirectory);
  const stat = await lstat(root).catch(() => null);
  if (!stat?.isDirectory()) throw new Error('release directory does not exist');
  const files = await collectTreeFiles(root, root, {
    exclude: (path) => ARTIFACT_DIGEST_EXCLUSIONS.has(path),
  });
  if (files.length === 0) throw new Error('release has no digestible artifacts');
  return files;
}

async function digestFiles(files) {
  const ordered = [...files].sort((left, right) => (
    Buffer.compare(Buffer.from(left.normalized, 'utf8'), Buffer.from(right.normalized, 'utf8'))
  ));
  const hash = createHash('sha256');
  for (const file of ordered) {
    const pathBytes = Buffer.from(file.normalized, 'utf8');
    const contents = await readFile(file.path);
    const pathLength = Buffer.allocUnsafe(4);
    const contentLength = Buffer.allocUnsafe(8);
    pathLength.writeUInt32BE(pathBytes.length);
    contentLength.writeBigUInt64BE(BigInt(contents.length));
    hash.update(pathLength);
    hash.update(pathBytes);
    hash.update(contentLength);
    hash.update(contents);
  }
  return hash.digest('hex');
}

async function sourceDigest(repo) {
  return digestFiles(await sourceFiles(repo));
}

async function artifactDigest(releaseDirectory) {
  return digestFiles(await artifactFiles(releaseDirectory));
}

function hasExactKeys(value, keys) {
  return Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function isCanonicalBuiltAt(value) {
  if (typeof value !== 'string' || !UTC_RFC3339.test(value)) return false;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return false;
  const canonical = new Date(milliseconds).toISOString();
  return value.includes('.') ? canonical === value : canonical === value.replace('Z', '.000Z');
}

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('release.json must contain one JSON object');
  }
  if (!hasExactKeys(manifest, MANIFEST_KEYS)) {
    throw new Error('release.json has missing or unrecognized top-level fields');
  }
  if (manifest.schema !== SCHEMA) throw new Error('release.json schema is unsupported');
  if (typeof manifest.version !== 'string' || !SAFE_VERSION.test(manifest.version)) {
    throw new Error('release.json version is invalid');
  }
  if (typeof manifest.commit !== 'string' || !FULL_COMMIT.test(manifest.commit)) {
    throw new Error('release.json commit is not a full Git object ID');
  }
  if (manifest.treeState !== 'clean' && manifest.treeState !== 'dirty') {
    throw new Error('release.json treeState must be clean or dirty');
  }
  if (typeof manifest.sourceDigest !== 'string' || !SHA256.test(manifest.sourceDigest)) {
    throw new Error('release.json sourceDigest is invalid');
  }
  if (typeof manifest.artifactDigest !== 'string' || !SHA256.test(manifest.artifactDigest)) {
    throw new Error('release.json artifactDigest is invalid');
  }
  if (!isCanonicalBuiltAt(manifest.builtAt)) {
    throw new Error('release.json builtAt must be canonical UTC RFC3339');
  }
  if (!manifest.tools || typeof manifest.tools !== 'object' || Array.isArray(manifest.tools)) {
    throw new Error('release.json tools must contain one JSON object');
  }
  if (!hasExactKeys(manifest.tools, TOOL_KEYS)) {
    throw new Error('release.json has missing or unrecognized tool fields');
  }
  for (const tool of TOOL_KEYS) {
    if (typeof manifest.tools[tool] !== 'string' || !TOOL_VERSION.test(manifest.tools[tool])) {
      throw new Error(`release.json tool version is invalid: ${tool}`);
    }
  }
  return manifest;
}

async function readManifest(releaseDirectory) {
  const manifestPath = resolve(releaseDirectory, MANIFEST_NAME);
  const source = await readFile(manifestPath);
  if (source.length > MAX_MANIFEST_BYTES) throw new Error('release.json is too large');
  let parsed;
  try {
    parsed = JSON.parse(source.toString('utf8'));
  } catch {
    throw new Error('release.json is not valid JSON');
  }
  return validateManifest(parsed);
}

async function writeManifest(args) {
  const [
    releaseDirectory,
    version,
    commit,
    treeState,
    sourceHash,
    artifactHash,
    builtAt,
    pnpmVersion,
    viteVersion,
  ] = args;
  if (!releaseDirectory || !version || !commit || !treeState || !sourceHash || !artifactHash
    || !builtAt || !pnpmVersion || !viteVersion || args.length !== 9) usage();

  const manifest = validateManifest({
    schema: SCHEMA,
    version,
    commit,
    treeState,
    sourceDigest: sourceHash,
    artifactDigest: artifactHash,
    builtAt,
    tools: {
      node: process.versions.node,
      pnpm: pnpmVersion,
      vite: viteVersion,
    },
  });
  const recomputed = await artifactDigest(releaseDirectory);
  if (recomputed !== manifest.artifactDigest) {
    throw new Error('refusing to write release.json: artifact digest does not match release files');
  }

  const manifestPath = resolve(releaseDirectory, MANIFEST_NAME);
  const temporaryPath = resolve(
    releaseDirectory,
    `.${MANIFEST_NAME}.${process.pid}.${createHash('sha256').update(version).digest('hex').slice(0, 12)}.tmp`,
  );
  const body = `${JSON.stringify(manifest, null, 2)}\n`;
  try {
    await writeFile(temporaryPath, body, { encoding: 'utf8', mode: 0o644, flag: 'wx' });
    await rename(temporaryPath, manifestPath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
  console.log(`wrote ${MANIFEST_NAME} for ${version}`);
}

async function verifyManifest(releaseDirectory, expectedVersion) {
  if (!releaseDirectory || !expectedVersion || arguments.length !== 2) usage();
  if (!SAFE_VERSION.test(expectedVersion)) throw new Error('expected version is invalid');
  const manifest = await readManifest(releaseDirectory);
  if (manifest.version !== expectedVersion) {
    throw new Error(`release version mismatch: expected ${expectedVersion}`);
  }
  const recomputed = await artifactDigest(releaseDirectory);
  if (manifest.artifactDigest !== recomputed) {
    throw new Error('artifact digest does not match release files');
  }
  console.log(`verified ${expectedVersion} ${recomputed}`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'source-digest' && args.length === 1) {
    console.log(await sourceDigest(args[0]));
    return;
  }
  if (command === 'digest' && args.length === 1) {
    console.log(await artifactDigest(args[0]));
    return;
  }
  if (command === 'write') {
    await writeManifest(args);
    return;
  }
  if (command === 'verify' && args.length === 2) {
    await verifyManifest(args[0], args[1]);
    return;
  }
  usage();
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : 'unexpected failure');
});
