import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('performance delivery contract', () => {
  it('does not hoist shared runtime into manually named lazy chunks', () => {
    expect(source('vite.config.ts')).toContain('onlyExplicitManualChunks: true');
  });

  it('keeps scene and mascot modules lazy and capability-gated', () => {
    const app = source('src/App.tsx');
    const connect = source('src/ui/modals/ConnectModal.tsx');
    expect(app).toContain("const ThemeBg = lazy(() => import('@/ui/bits/ThemeBg'))");
    expect(app).toContain("const StarfieldBg = lazy(() => import('@/ui/bits/StarfieldBg'))");
    expect(app).toContain("uiState.activeModal !== 'connect'");
    expect(app).toContain("settings.sceneMotion !== 'reduced'");
    expect(connect).toContain("const AstronautBear = lazy(() => import('@/ui/bits/AstronautBear'))");
    expect(connect).not.toContain("import('@/ui/bits/ThemeBg')");
    expect(connect).not.toContain("import('@/ui/bits/StarfieldBg')");
    expect(connect).toContain('const decorativeMotionEnabled = () =>');
    expect(connect).toContain("settings.sceneMotion !== 'reduced'");
  });
});
