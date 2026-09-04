import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import chromeManifest from './src/manifest.json';
import path from 'path';

function manifestForBrowser(mode) {
  if (mode !== 'opera') return chromeManifest;
  // Strip the unknown permission so GX can load. Keep side_panel so CRXJS
  // still treats index.html as an entry (Opera ignores the unknown key).
  return {
    ...chromeManifest,
    permissions: chromeManifest.permissions.filter((name) => name !== 'sidePanel')
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    crx({ manifest: manifestForBrowser(mode) })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@styles': path.resolve(__dirname, './src/styles')
    }
  },
  build: {
    outDir: mode === 'opera' ? 'dist-opera' : 'dist',
    emptyOutDir: true,
    // Shared chunks (e.g. youtubeMetadata used by both the side panel and
    // the service worker) get Vite modulepreload tags that Chrome rejects as
    // "cross-world extension resource mismatch". Disable preloads for MV3.
    modulePreload: false
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5173
    }
  }
}));
