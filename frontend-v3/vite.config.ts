import { resolve } from 'path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vitejs.dev/config/
// Note: @vitejs/plugin-react shim uses vite's built-in esbuild JSX transform.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  resolve: {
    alias: [
      {
        find: /^\/?@vite\/client/,
        replacement: resolve(__dirname, 'node_modules/vite/dist/client/client.mjs'),
      },
      {
        find: /^\/?@vite\/env/,
        replacement: resolve(__dirname, 'node_modules/vite/dist/client/env.mjs'),
      },
      {
        find: '@/pages/command-center/commandCenter.fixtures',
        replacement: resolve(
          __dirname,
          command === 'serve'
            ? './src/pages/command-center/commandCenter.fixtures.ts'
            : './src/pages/command-center/commandCenter.fixture-disabled.ts'
        ),
      },
      {
        find: '@/pages/entities/entities.fixtures',
        replacement: resolve(
          __dirname,
          command === 'serve'
            ? './src/pages/entities/entities.fixtures.ts'
            : './src/pages/entities/entities.fixture-disabled.ts'
        ),
      },
      {
        find: '@/pages/investigations/investigation.fixtures',
        replacement: resolve(
          __dirname,
          command === 'serve'
            ? './src/pages/investigations/investigation.fixtures.ts'
            : './src/pages/investigations/investigation.fixture-disabled.ts'
        ),
      },
      {
        find: '@/pages/incidents/incidents.fixtures',
        replacement: resolve(
          __dirname,
          command === 'serve'
            ? './src/pages/incidents/incidents.fixtures.ts'
            : './src/pages/incidents/incidents.fixture-disabled.ts'
        ),
      },
      {
        find: '@/pages/incidents/incidentDetail.fixtures',
        replacement: resolve(
          __dirname,
          command === 'serve'
            ? './src/pages/incidents/incidentDetail.fixtures.ts'
            : './src/pages/incidents/incidentDetail.fixture-disabled.ts'
        ),
      },
      {
        find: '@/pages/incidents/incidentWorkbench.fixtures',
        replacement: resolve(
          __dirname,
          command === 'serve'
            ? './src/pages/incidents/incidentWorkbench.fixtures.ts'
            : './src/pages/incidents/incidentWorkbench.fixture-disabled.ts'
        ),
      },
      {
        find: '@/pages/alerts/alertTriage.fixtures',
        replacement: resolve(
          __dirname,
          command === 'serve'
            ? './src/pages/alerts/alertTriage.fixtures.ts'
            : './src/pages/alerts/alertTriage.fixture-disabled.ts'
        ),
      },
      {
        find: '@/pages/alerts/alertInvestigation.fixtures',
        replacement: resolve(
          __dirname,
          command === 'serve'
            ? './src/pages/alerts/alertInvestigation.fixtures.ts'
            : './src/pages/alerts/alertInvestigation.fixture-disabled.ts'
        ),
      },
      {
        find: '@/pages/search-hunt/searchHunt.fixtures',
        replacement: resolve(
          __dirname,
          command === 'serve'
            ? './src/pages/search-hunt/searchHunt.fixtures.ts'
            : './src/pages/search-hunt/searchHunt.fixture-disabled.ts'
        ),
      },
      {
        find: '@/pages/constellation/constellation.fixtures',
        replacement: resolve(
          __dirname,
          command === 'serve'
            ? './src/pages/constellation/constellation.fixtures.ts'
            : './src/pages/constellation/constellation.fixture-disabled.ts'
        ),
      },
      {
        find: '@/pages/detection-rules/detectionRules.fixtures',
        replacement: resolve(
          __dirname,
          command === 'serve'
            ? './src/pages/detection-rules/detectionRules.fixtures.ts'
            : './src/pages/detection-rules/detectionRules.fixture-disabled.ts'
        ),
      },
      {
        find: '@/pages/response/playbookBuilder.fixtures',
        replacement: resolve(
          __dirname,
          command === 'serve'
            ? './src/pages/response/playbookBuilder.fixtures.ts'
            : './src/pages/response/playbookBuilder.fixture-disabled.ts'
        ),
      },
      {
        find: '@/services/responseActionService.fixtures',
        replacement: resolve(
          __dirname,
          command === 'serve'
            ? './src/services/responseActionService.fixtures.ts'
            : './src/services/responseActionService.fixture-disabled.ts'
        ),
      },
      {
        find: '@/services/playbookService.fixtures',
        replacement: resolve(
          __dirname,
          command === 'serve'
            ? './src/services/playbookService.fixtures.ts'
            : './src/services/playbookService.fixture-disabled.ts'
        ),
      },
      {
        find: '@/pages/response/response.fixtures',
        replacement: resolve(
          __dirname,
          command === 'serve'
            ? './src/pages/response/response.fixtures.ts'
            : './src/pages/response/response.fixture-disabled.ts'
        ),
      },
      {
        find: '@/pages/edr/fileQuarantine.fixtures',
        replacement: resolve(
          __dirname,
          command === 'serve'
            ? './src/pages/edr/fileQuarantine.fixtures.ts'
            : './src/pages/edr/fileQuarantine.fixture-disabled.ts'
        ),
      },
      {
        find: '@/pages/posture/assets/assets.fixtures',
        replacement: resolve(
          __dirname,
          command === 'serve'
            ? './src/pages/posture/assets/assets.fixtures.ts'
            : './src/pages/posture/assets/assets.fixture-disabled.ts'
        ),
      },
      { find: /^@\//, replacement: resolve(__dirname, './src') + '/' },
    ],
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: process.env.VITE_BACKEND_URL ?? 'http://localhost:8088',
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes, req) => {
            // Handle SSE streams — prevent buffering
            if (req.headers.accept?.includes('text/event-stream')) {
              proxyRes.headers['x-accel-buffering'] = 'no';
              proxyRes.headers['cache-control'] = 'no-cache';
            }
          });
        },
      },
      '/management': {
        target: process.env.VITE_BACKEND_URL ?? 'http://localhost:8088',
        changeOrigin: true,
        secure: false,
      },
      '/agent-packages': {
        target: process.env.VITE_BACKEND_URL ?? 'http://localhost:8088',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
}));
