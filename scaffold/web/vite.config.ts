import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// The browser talks to one origin (:5173). API, auth and WebSocket paths are
// proxied to the server, so the session cookie is first-party and no CORS is needed.
//
// Login round-trip in dev:
//   5173/auth/login --proxy--> server --302--> IdP :4020 --302--> OIDC_REDIRECT_URI (/auth/callback)
//   --302--> WEB_ORIGIN. Cookies are scoped by host, not port, so a cookie set by
//   localhost:4000 is also sent to localhost:5173 (and vice versa).
export default defineConfig(({ mode }) => {
  // Follows the server's PORT: scaffold/server/.env first, then <repo>/.env, shell wins.
  const env = { ...loadEnv(mode, '../..', ''), ...loadEnv(mode, '../server', ''), ...process.env };
  const target = env.API_TARGET ?? `http://localhost:${env.PORT ?? 4000}`;

  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': target,
        '/auth': target,
        '/healthz': target,
        '/ws': { target, ws: true },
      },
    },
  };
});
