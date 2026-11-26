import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { handleApi } from './server/api.mjs';

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  return {
    base: env.KOTOBANE_BASE || '/',
    plugins: [
      react(), tailwind(),
      {
        name: 'kotobane-api',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (req.url?.startsWith('/api/')) void handleApi(req, res, env);
            else next();
          });
        },
      },
    ],
    server: { host: '127.0.0.1' },
  };
});
