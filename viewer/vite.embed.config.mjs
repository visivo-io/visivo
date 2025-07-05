import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  const isGlobal = mode === 'global';
  
  return {
    plugins: [react()],
    build: {
      lib: {
        entry: isGlobal 
          ? resolve(__dirname, 'src/embed/global.jsx')
          : resolve(__dirname, 'src/embed/index.jsx'),
        name: isGlobal ? 'VisivoEmbed' : 'Visivo',
        formats: isGlobal ? ['iife'] : ['es', 'cjs'],
        fileName: (format) => {
          if (isGlobal) {
            return 'visivo-embed.js';
          }
          return format === 'es' ? 'index.esm.js' : 'index.cjs.js';
        }
      },
      outDir: 'embed-dist',
      rollupOptions: {
        external: isGlobal ? [] : ['react', 'react-dom'],
        output: isGlobal ? {
          globals: {
            // For global build, we include React in the bundle
          }
        } : {
          globals: {
            react: 'React',
            'react-dom': 'ReactDOM'
          }
        }
      },
      // Minify in production
      minify: 'terser',
      sourcemap: true,
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production')
    }
  };
});