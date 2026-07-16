import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const script = resolve(root, 'scripts/release-provenance.mjs');
const temporaryDirectories: string[] = [];

function temporaryDirectory(name: string): string {
  const directory = mkdtempSync(join(tmpdir(), `darkbear-${name}-`));
  temporaryDirectories.push(directory);
  return directory;
}

function write(directory: string, path: string, contents: string | Uint8Array): void {
  const destination = join(directory, path);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, contents);
}

function command(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: 'utf8',
    env,
  });
}

function successfulCommand(args: string[], env?: NodeJS.ProcessEnv): string {
  const result = command(args, env);
  if (result.status !== 0) {
    throw new Error(`command failed (${result.status}): ${result.stderr}`);
  }
  return result.stdout.trim();
}

function sourceFixture(directory: string, reverse = false): void {
  const files: Array<[string, string]> = [
    ['index.html', '<main>DarkBear</main>'],
    ['package.json', '{"name":"fixture"}\n'],
    ['pnpm-lock.yaml', 'lockfileVersion: 9\n'],
    ['pnpm-workspace.yaml', 'packages: []\n'],
    ['tsconfig.json', '{"compilerOptions":{}}\n'],
    ['tsconfig.browser.json', '{"extends":"./tsconfig.json"}\n'],
    ['vite.config.ts', 'export default {}\n'],
    ['src/main.ts', 'export const answer = 42;\n'],
    ['src/nested/feature.tsx', 'export const Feature = () => null;\n'],
    ['public/favicon.svg', '<svg/>\n'],
    ['public/binary.dat', '\0\u0001\u0002'],
    ['src/main.test.ts', 'throw new Error("test only");\n'],
    ['src/__tests__/fixture.ts', 'export const ignored = true;\n'],
    ['docs/private-paths.md', '/home/example/private\n'],
    ['tests/e2e.spec.ts', 'test("ignored", () => {});\n'],
    ['out/generated.js', 'generated\n'],
    ['.env', 'TOKEN=must-not-leak\n'],
    ['.claude/settings.json', '{"ignored":true}\n'],
    ['tsconfig.tsbuildinfo', 'generated cache\n'],
  ];
  for (const [path, contents] of reverse ? files.reverse() : files) {
    write(directory, path, contents);
  }
}

function releaseFixture(directory: string): void {
  write(directory, 'index.html', '<script>version stamp</script>\n');
  write(directory, 'sw.js', 'const DEPLOY_VERSION = "stamp";\n');
  write(directory, 'assets/app-a1.js', 'console.log("app");\n');
  write(directory, 'assets/app-b2.css', 'body { color: #fff; }\n');
  write(directory, 'offline.html', '<p>offline</p>\n');
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('release provenance source digest contract', () => {
  it('is path-independent, creation-order-independent, and limited to browser inputs', () => {
    const first = temporaryDirectory('source-a');
    const second = temporaryDirectory('source-b');
    sourceFixture(first);
    sourceFixture(second, true);

    const initial = successfulCommand(['source-digest', first]);
    expect(initial).toMatch(/^[0-9a-f]{64}$/);
    expect(successfulCommand(['source-digest', second])).toBe(initial);

    write(first, 'docs/private-paths.md', '/different/private/path\n');
    write(first, 'src/main.test.ts', 'different test code\n');
    write(first, '.env', 'TOKEN=different-secret\n');
    write(first, 'out/generated.js', 'different generated output\n');
    write(first, 'tsconfig.tsbuildinfo', 'different generated cache\n');
    expect(successfulCommand(['source-digest', first])).toBe(initial);

    write(first, 'src/main.ts', 'export const answer = 43;\n');
    expect(successfulCommand(['source-digest', first])).not.toBe(initial);
  });

  it('rejects symlinks and incomplete source trees instead of hashing ambiguous inputs', () => {
    const incomplete = temporaryDirectory('source-incomplete');
    write(incomplete, 'index.html', '<main/>');
    const incompleteResult = command(['source-digest', incomplete]);
    expect(incompleteResult.status).toBe(1);
    expect(incompleteResult.stderr).toContain('required digest input');

    const linked = temporaryDirectory('source-linked');
    sourceFixture(linked);
    symlinkSync('/etc/hosts', join(linked, 'public', 'host-data'));
    const linkedResult = command(['source-digest', linked]);
    expect(linkedResult.status).toBe(1);
    expect(linkedResult.stderr).toContain('symbolic links are not valid digest inputs');
  });
});

describe('release provenance artifact and manifest contract', () => {
  it('excludes only circular root stamps and the manifest from the artifact digest', () => {
    const release = temporaryDirectory('artifact');
    releaseFixture(release);
    const initial = successfulCommand(['digest', release]);
    expect(initial).toMatch(/^[0-9a-f]{64}$/);

    write(release, 'index.html', '<script>different version</script>\n');
    write(release, 'sw.js', 'const DEPLOY_VERSION = "different";\n');
    write(release, 'release.json', '{"ignored":"circular"}\n');
    expect(successfulCommand(['digest', release])).toBe(initial);

    write(release, 'assets/app-a1.js', 'console.log("tampered");\n');
    expect(successfulCommand(['digest', release])).not.toBe(initial);
  });

  it('writes a strict non-sensitive manifest and verifies its artifact bytes', () => {
    const release = temporaryDirectory('manifest-private-user');
    releaseFixture(release);
    const artifactDigest = successfulCommand(['digest', release]);
    const version = '2026-07-16-darkbear-a1b2c3d4';
    const commit = 'a'.repeat(40);
    const sourceDigest = 'b'.repeat(64);
    const secret = 'credential-that-must-never-be-published';

    const output = successfulCommand([
      'write',
      release,
      version,
      commit,
      'dirty',
      sourceDigest,
      artifactDigest,
      '2026-07-16T20:15:30Z',
      '10.31.0',
      '7.3.6',
    ], { ...process.env, DARKBEAR_TEST_SECRET: secret });
    expect(output).toBe(`wrote release.json for ${version}`);

    const manifestSource = readFileSync(join(release, 'release.json'), 'utf8');
    const manifest = JSON.parse(manifestSource) as Record<string, unknown>;
    expect(Object.keys(manifest)).toEqual([
      'schema',
      'version',
      'commit',
      'treeState',
      'sourceDigest',
      'artifactDigest',
      'builtAt',
      'tools',
    ]);
    expect(manifest).toEqual({
      schema: 'darkbear.release-provenance/v1',
      version,
      commit,
      treeState: 'dirty',
      sourceDigest,
      artifactDigest,
      builtAt: '2026-07-16T20:15:30Z',
      tools: {
        node: process.versions.node,
        pnpm: '10.31.0',
        vite: '7.3.6',
      },
    });
    expect(manifestSource).not.toContain(release);
    expect(manifestSource).not.toContain('manifest-private-user');
    expect(manifestSource).not.toContain(secret);
    expect(manifestSource).not.toContain('DARKBEAR_TEST_SECRET');

    expect(successfulCommand(['verify', release, version]))
      .toBe(`verified ${version} ${artifactDigest}`);
    write(release, 'index.html', '<script>new excluded stamp</script>\n');
    expect(command(['verify', release, version]).status).toBe(0);

    write(release, 'offline.html', '<p>tampered</p>\n');
    const tampered = command(['verify', release, version]);
    expect(tampered.status).toBe(1);
    expect(tampered.stderr).toContain('artifact digest does not match release files');
  });

  it('rejects stale write digests, version mismatches, and extra manifest fields', () => {
    const release = temporaryDirectory('strict');
    releaseFixture(release);
    const artifactDigest = successfulCommand(['digest', release]);
    const args = [
      release,
      'release-1',
      'c'.repeat(40),
      'clean',
      'd'.repeat(64),
      artifactDigest,
      '2026-07-16T20:15:30.000Z',
      '10.31.0',
      '7.3.6',
    ];

    const stale = command(['write', ...args.slice(0, 5), 'e'.repeat(64), ...args.slice(6)]);
    expect(stale.status).toBe(1);
    expect(stale.stderr).toContain('artifact digest does not match release files');

    expect(command(['write', ...args]).status).toBe(0);
    const wrongVersion = command(['verify', release, 'release-2']);
    expect(wrongVersion.status).toBe(1);
    expect(wrongVersion.stderr).toContain('release version mismatch');

    const manifest = JSON.parse(readFileSync(join(release, 'release.json'), 'utf8')) as Record<string, unknown>;
    manifest.sourcePaths = ['src/private.ts'];
    write(release, 'release.json', `${JSON.stringify(manifest)}\n`);
    const extraField = command(['verify', release, 'release-1']);
    expect(extraField.status).toBe(1);
    expect(extraField.stderr).toContain('missing or unrecognized top-level fields');
  });

  it('does not read environment variables into the provenance implementation', () => {
    const source = readFileSync(script, 'utf8');
    expect(source).not.toContain('process.env');
    expect(source).not.toMatch(/\/(?:home|Users)\//);
  });
});
