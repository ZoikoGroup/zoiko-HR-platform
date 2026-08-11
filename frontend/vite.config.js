import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: {
    // noDiscovery prevents Rolldown from scanning all node_modules (causes OOM on Windows).
    // We explicitly include every CJS package that needs ESM conversion.
    noDiscovery: true,
    include: [
      'react',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'react-dom',
      'react-dom/client',
      'react-is',
      'react-redux',
      'react-router',
      'react-router-dom',
      'redux',
      'redux-thunk',
      'reselect',
      'use-sync-external-store',
      'immer',
      'scheduler',
      'recharts',
      'lucide-react',
      'clsx',
      'eventemitter3',
      'tiny-invariant',
      'xlsx',
      'pdfmake/build/pdfmake',
      'pdfmake/build/vfs_fonts',
    ],
  },
  build: {
    chunkSizeWarningLimit: 1500,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('xlsx')) return 'vendor-xlsx';
            if (id.includes('recharts')) return 'vendor-recharts';
            if (id.includes('react-router-dom')) return 'vendor-router';
            if (id.includes('react-dom')) return 'vendor-react-dom';
            if (id.includes('react')) return 'vendor-react';
            if (id.includes('lucide-react')) return 'vendor-icons';
            return 'vendor';
          }
        },
      },
    },
  },
});
