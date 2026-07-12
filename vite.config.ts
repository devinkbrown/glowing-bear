import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

// DarkBear — Vite + SolidJS static SPA. Output to out/ (deploy.sh copies it to the webroot).
export default defineConfig({
  base: '/darkbear/',
  plugins: [solid(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    outDir: 'out',
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      output: {
        // Split the heavy, non-critical code off the entry chunk. The voice/video
        // engine is reachable statically (via src/state/media), so grouping it
        // here lifts it out of the first-paint entry chunk into a separately-
        // fetched chunk (eager, but no longer parse-blocking boot). The 3.5k-line
        // ThemeBg scene library is lazy()'d in App, so naming it keeps its
        // on-demand chunk cleanly isolated. GifPicker is lazy()'d at its own
        // import site in InputBar (behind the picker's Show gate), so Rollup
        // auto-splits its on-demand chunk — do NOT force it into a manualChunk,
        // which co-hosts shared runtime and re-creates a static, eager entry edge.
        manualChunks(id) {
          if (id.includes('/src/lib/suimyaku-media/') || id.includes('/src/lib/ringtone')) {
            return 'media-engine';
          }
          if (id.includes('/src/ui/bits/ThemeBg')) return 'theme-scenes';
          return undefined;
        },
      },
    },
  },
  server: { port: 5173, host: true },
  preview: { port: 4174, host: true },
});
