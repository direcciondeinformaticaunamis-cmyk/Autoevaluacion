import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 3000;
const DIST_DIR = path.join(__dirname, 'dist');

const ALLOWED_USERS = new Set([
  'direccion',
  'secretaria',
  'coordinacion_academica',
  'soporte_tecnologico',
  'coordinador_ead',
  'administrativo_ead',
  'director_informatica',
]);

const AUTH_PASSWORD = (process.env.AUTH_PASSWORD || 'Unamis2026*').trim();

// In-memory sessions (single instance). If you scale horizontally, swap this for Redis.
const sessions = new Map();

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  const parts = header.split(';');
  for (const p of parts) {
    const idx = p.indexOf('=');
    if (idx === -1) continue;
    const k = p.slice(0, idx).trim();
    const v = p.slice(idx + 1).trim();
    if (!k) continue;
    out[k] = decodeURIComponent(v);
  }
  return out;
}

function isHttps(req) {
  const xf = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  return req.secure || xf === 'https';
}

function setSessionCookie(res, sid, secure) {
  const parts = [
    `unamis_sid=${encodeURIComponent(sid)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=604800',
  ];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(res, secure) {
  const parts = [
    'unamis_sid=',
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function getUserFromReq(req) {
  const cookies = parseCookies(req.headers.cookie);
  const sid = cookies.unamis_sid;
  if (!sid) return null;
  const sess = sessions.get(sid);
  if (!sess || !sess.user) return null;
  return sess.user;
}

app.get('/api/me', (req, res) => {
  const user = getUserFromReq(req);
  if (!user) return res.status(401).json({ ok: false });
  return res.status(200).json({ ok: true, user });
});

app.post('/api/login', (req, res) => {
  const secure = isHttps(req);
  const user = String(req.body?.user || '').trim().toLowerCase();
  const pass = String(req.body?.pass || '');

  if (!ALLOWED_USERS.has(user)) return res.status(403).json({ ok: false, error: 'user_not_allowed' });
  if (!AUTH_PASSWORD || pass !== AUTH_PASSWORD) return res.status(401).json({ ok: false, error: 'bad_password' });

  const sid = crypto.randomUUID();
  sessions.set(sid, { user, ts: Date.now() });
  setSessionCookie(res, sid, secure);
  return res.status(200).json({ ok: true, user });
});

app.post('/api/logout', (req, res) => {
  const secure = isHttps(req);
  const cookies = parseCookies(req.headers.cookie);
  const sid = cookies.unamis_sid;
  if (sid) sessions.delete(sid);
  clearSessionCookie(res, secure);
  return res.status(200).json({ ok: true });
});

// Simple healthcheck for hosting platforms.
app.get('/health', (_req, res) => res.status(200).send('ok'));

// Serve Vite build output.
app.use(express.static(DIST_DIR, {
  // Hashed assets are safe to cache; index.html is handled below.
  maxAge: '7d',
  index: false,
}));

// SPA fallback.
app.get('*', (_req, res) => {
  // Prevent stale HTML pointing to old hashed bundles.
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(DIST_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server listening on :${PORT}`);
});
