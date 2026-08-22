import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

// DarkBear — Vite + SolidJS static SPA. Plain builds use out/ for local
// inspection; deploy.sh overrides outDir with a versioned production release.
export default defineConfig(({ mode }) => {
  const desktop = mode === 'desktop';
  const tauriHost = process.env.TAURI_DEV_HOST;
  const desktopCsp = {
    name: 'darkbear-desktop-csp',
    transformIndexHtml(html: string): string {
      if (!desktop) return html;
      // Browser builds retain credential-free loopback WS for local relay
      // development. Packaged desktop builds have no such exception.
      return html.replace(/ ws:\/\/localhost:\* ws:\/\/127\.0\.0\.1:\*/g, '');
    },
  };

  return {
  // The deployed PWA lives below /darkbear/. Tauri packages the same source
  // behind its local asset protocol, where relative URLs are required.
  base: desktop ? './' : '/darkbear/',
  plugins: [solid(), tailwindcss(), desktopCsp],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    outDir: 'out',
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      output: {
        // Keep shared runtime in the entry graph. Without this, Rollup may move
        // a shared Solid dependency into a named lazy scene chunk and then
        // modulepreload that entire decorative library on first paint.
        onlyExplicitManualChunks: true,
        // Split the heavy, non-critical code off the entry chunk. The voice/video
        // engine is reachable statically (via src/state/media), so grouping it
        // here lifts it out of the first-paint entry chunk into a separately-
        // fetched chunk (eager, but no longer parse-blocking boot). The 3.5k-line
        // ThemeBg scene library is lazy()'d at each use, so naming it keeps its
        // on-demand chunk cleanly isolated. GifPicker is lazy()'d at its own
        // import site in InputBar (behind the picker's Show gate), so Rollup
        // auto-splits its on-demand chunk — do NOT force it into a manualChunk,
        // which co-hosts shared runtime and re-creates a static, eager entry edge.
        manualChunks(id) {
          if (id.includes('/src/lib/cadence-media/') || id.includes('/src/lib/ringtone')) {
            return 'media-engine';
          }
          if (id.includes('/src/ui/bits/ThemeBg')) return 'theme-scenes';
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    host: tauriHost || true,
    strictPort: desktop,
    hmr: tauriHost ? { protocol: 'ws', host: tauriHost, port: 1421 } : undefined,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  preview: { port: 4174, host: true },
  };
});
