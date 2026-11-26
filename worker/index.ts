import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { type AppEnv, HttpError } from './lib';
import { ensureSchema } from './core';
import { bumpVersion } from './cache';
import { publicRoutes } from './routes/public';
import { authRoutes, loadSession, SESSION_COOKIE } from './routes/auth';
import { adminRoutes } from './routes/admin';
import { recordRoutes } from './routes/records';
import { ingestRoutes } from './routes/ingest';
import { docRoutes } from './routes/docs';
import { statRoutes } from './routes/stats';
import { reviewRoutes } from './routes/review';

const app = new Hono<AppEnv>();

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status as any);
  console.error(err);
  return c.json({ error: 'Server error: ' + (err as Error).message }, 500);
});

app.use('/api/*', async (c, next) => {
  await ensureSchema(c.env);
  // CSRF guard: state-changing requests must come from this origin.
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    const origin = c.req.header('origin');
    const host = new URL(c.req.url).host;
    if (origin && new URL(origin).host !== host) throw new HttpError(403, 'Cross-origin request refused.');
  }
  c.header('Cache-Control', 'no-store');
  c.header('X-Content-Type-Options', 'nosniff');
  await next();
  // Any successful data change invalidates cached dashboards.
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) && c.res.status < 400 && !c.req.path.startsWith('/api/auth')) await bumpVersion(c.env);
});

app.route('/api/public', publicRoutes);

app.route('/api/auth', authRoutes);

// Everything below requires a signed-in user.
app.use('/api/*', async (c, next) => {
  const user = await loadSession(c.env, getCookie(c, SESSION_COOKIE));
  if (!user) throw new HttpError(401, 'Sign in required.');
  if (user.must_change_pw && !c.req.path.startsWith('/api/auth')) throw new HttpError(428, 'Password change required.');
  c.set('user', user);
  await next();
});

app.route('/api/admin', adminRoutes);
app.route('/api/uploads', ingestRoutes);
app.route('/api/stats', statRoutes);
app.route('/api/review', reviewRoutes);
app.route('/api', docRoutes);
app.route('/api', recordRoutes);

app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404));

export default {
  fetch(req: Request, env: AppEnv['Bindings'], ctx: ExecutionContext) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) return app.fetch(req, env, ctx);
    return env.ASSETS.fetch(req);
  },
};
