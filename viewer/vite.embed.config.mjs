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
        external: isGlobal ? [] : [
          'react', 
          'react-dom', 
          'react-router-dom', 
          '@tanstack/react-query',
          'react-markdown',
          'remark-gfm',
          'rehype-raw', 
          'rehype-sanitize',
          'copy-to-clipboard',
          '@fortawesome/react-fontawesome',
          '@fortawesome/free-solid-svg-icons'
        ],
        onwarn(warning, warn) {
          // Suppress warnings about unresolved dependencies in global build
          if (isGlobal && warning.code === 'UNRESOLVED_IMPORT') {
            return;
          }
          warn(warning);
        },
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
      minify: 'esbuild',
      sourcemap: true,
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production')
    }
  };
});