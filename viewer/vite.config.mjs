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
      // Socket.IO (hot-reload `project_changed` events, VIS-808) — websocket
      // upgrade enabled so the dev server behaves like the Flask-served app.
      '/socket.io': {
        target: `http://127.0.0.1:${backendPort}`,
        ws: true,
      },
    },
  },
  build: {
    outDir: 'build',
  },
});
