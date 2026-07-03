import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import { fileURLToPath, URL } from 'node:url';

// Test config — jsdom for store/DOM-adjacent suites; pure protocol suites
// run fine under jsdom too. Solid plugin so .tsx under test transforms.
export default defineConfig({
  plugins: [solid()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    conditions: ['development', 'browser'],
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
