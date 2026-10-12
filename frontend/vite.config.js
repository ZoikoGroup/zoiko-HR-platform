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
            if (id.includes('/xlsx/')) return 'vendor-xlsx';
            if (id.includes('/recharts/') || id.includes('/d3-')) return 'vendor-recharts';
            // only loaded when a document is previewed, so keep them out of the chunk every page preloads
            if (/\/node_modules\/(mammoth|jszip|pdfmake|pako|bluebird|underscore|xmlbuilder|dingbat-to-unicode|lop|path-is-absolute|base64-js|argparse|option|readable-stream|lie|immediate|setimmediate)\//.test(id)) return 'vendor-docs';
            if (id.includes('/lucide-react/')) return 'vendor-icons';
            if (id.includes('/react-router')) return 'vendor-router';
            if (id.includes('/react-dom/') || id.includes('/scheduler/')) return 'vendor-react-dom';
            if (/\/node_modules\/react\//.test(id)) return 'vendor-react';
            return 'vendor';
          }
        },
      },
    },
  },
});
