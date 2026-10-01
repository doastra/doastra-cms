import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the admin runs on :5173 and proxies API calls to the server on :4000.
export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/admin/api': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000',
      '/api': 'http://localhost:4000',
    },
  },
});
