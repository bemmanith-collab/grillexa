import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // Defaults to a local backend. Set VITE_API_PROXY to point the dev server
    // at a deployed one instead — handy for checking UI changes on a phone
    // over the LAN without running Postgres locally:
    //   VITE_API_PROXY=https://grillexa.fly.dev npm run dev
    // Note that this talks to the real database: anything saved is saved for
    // real. Browse freely, but don't test billing against it.
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY || 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
