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
        // engine and GifPicker are reachable statically (via src/state/media and
        // InputBar respectively), so they cannot be lazy()'d from App — grouping
        // them here still lifts each out of the first-paint entry chunk into a
        // separately-fetched chunk (eager, but no longer parse-blocking boot). The
        // 3.5k-line ThemeBg scene library is lazy()'d in App, so naming it keeps
        // its on-demand chunk cleanly isolated.
        manualChunks(id) {
          if (id.includes('/src/lib/suimyaku-media/') || id.includes('/src/lib/ringtone')) {
            return 'media-engine';
          }
          if (id.includes('/src/ui/bits/ThemeBg')) return 'theme-scenes';
          if (id.includes('/src/ui/input/GifPicker')) return 'gif-picker';
          return undefined;
        },
      },
    },
  },
  server: { port: 5173, host: true },
  preview: { port: 4174, host: true },
});
