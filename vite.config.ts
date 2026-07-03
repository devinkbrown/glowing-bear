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
  },
  server: { port: 5173, host: true },
  preview: { port: 4174, host: true },
});
