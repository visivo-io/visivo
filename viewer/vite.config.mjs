import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import eslint from 'vite-plugin-eslint';
import tailwindcss from '@tailwindcss/vite';

const backendPort = process.env.VITE_BACKEND_PORT || 8000;
const serverPort = parseInt(process.env.VITE_PORT || '3000');

export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss(), eslint()],
  server: {
    open: !process.env.VITE_BACKEND_PORT,
    port: serverPort,
    proxy: {
      '/data': `http://127.0.0.1:${backendPort}`,
      '/api': `http://127.0.0.1:${backendPort}`,
    },
  },
  build: {
    outDir: 'build',
  },
});
