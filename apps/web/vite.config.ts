import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@plataforma/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
        configure(proxy) {
          proxy.on('error', (_err, _req, res) => {
            const out = res as { writeHead?: Function; end?: Function; headersSent?: boolean };
            if (typeof out.writeHead === 'function' && !out.headersSent) {
              out.writeHead(503, { 'Content-Type': 'application/json' });
              out.end?.(
                JSON.stringify({
                  message:
                    'La API no está disponible. Cerrá esta pantalla y ejecutá abrir-cuadratura.bat.',
                }),
              );
            }
          });
        },
      },
    },
  },
});
