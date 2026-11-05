import { defineConfig } from 'vite';
import { brotliCompressSync, gzipSync } from 'node:zlib';

// Recharts 3 pulls a whole state-management stack (redux, react-redux, immer,
// reselect, …) plus d3 modules. They are only needed by the eight chart pages,
// so they must never land in a chunk the entry modulepreloads.
const RECHARTS_DEPS =
  /\/node_modules\/(recharts|@reduxjs\/toolkit|redux|react-redux|immer|reselect|victory-vendor|es-toolkit|decimal\.js-light|eventemitter3|tiny-invariant|use-sync-external-store|d3-[a-z-]+|internmap)\//;

// Ship .gz and .br next to every text asset. nginx serves the .gz with
// `gzip_static on` (and Vercel/CDNs negotiate brotli themselves), so no
// compression work happens per request.
const COMPRESSIBLE = /\.(js|css|html|svg|json|txt|xml)$/;
function precompress() {
  return {
    name: 'zoiko-precompress',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const [fileName, item] of Object.entries(bundle)) {
        if (item.type !== 'asset' || !COMPRESSIBLE.test(fileName)) continue;
        const source = Buffer.isBuffer(item.source) ? item.source : Buffer.from(item.source);
        if (source.length < 1024) continue;
        this.emitFile({ type: 'asset', fileName: `${fileName}.gz`, source: gzipSync(source, { level: 9 }) });
        this.emitFile({ type: 'asset', fileName: `${fileName}.br`, source: brotliCompressSync(source) });
      }
    },
  };
}

export default defineConfig({
  plugins: [precompress()],
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
      'react-router',
      'react-router-dom',
      'scheduler',
      'lucide-react',
      'clsx',
      'xlsx',
      'pdfmake/build/pdfmake',
      'pdfmake/build/vfs_fonts',
      // recharts imports the CommonJS use-sync-external-store/shim/with-selector;
      // pre-bundling recharts converts it (and its other deps) to ESM. Without
      // this the dev server serves it raw: "does not provide an export named
      // 'useSyncExternalStoreWithSelector'" on any page with a chart.
      'recharts',
    ],
  },
  build: {
    chunkSizeWarningLimit: 1500,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('/xlsx/')) return 'vendor-xlsx';
          if (RECHARTS_DEPS.test(id)) return 'vendor-recharts';
          // only loaded when a document is previewed, so keep them out of the chunk every page preloads
          if (/\/node_modules\/(mammoth|jszip|pdfmake|pako|bluebird|underscore|xmlbuilder|dingbat-to-unicode|lop|path-is-absolute|base64-js|argparse|option|readable-stream|lie|immediate|setimmediate)\//.test(id)) return 'vendor-docs';
          if (id.includes('/react-router')) return 'vendor-router';
          if (id.includes('/react-dom/') || id.includes('/scheduler/')) return 'vendor-react-dom';
          if (/\/node_modules\/react\//.test(id)) return 'vendor-react';
          // Everything else (including lucide icons and dompurify) is left to
          // Rollup: icons and sanitizer then live in the page chunks that use
          // them instead of one vendor chunk modulepreloaded everywhere.
        },
      },
    },
  },
});
