import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import multer from 'multer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024,
    files: 1,
  },
});

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

function requireAuth(req, res, next) {
  const user = getUserFromReq(req);
  if (!user) return res.status(401).json({ ok: false, error: 'not_authenticated' });
  req.authedUser = user;
  return next();
}

function parseJsonEnv(name) {
  const raw = process.env[name];
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function driveFolderFor({ indicatorId, criterionId, dimensionId }) {
  const byIndicator = parseJsonEnv('DRIVE_FOLDER_BY_INDICATOR');
  const byCriterion = parseJsonEnv('DRIVE_FOLDER_BY_CRITERION');
  const byDimension = parseJsonEnv('DRIVE_FOLDER_BY_DIMENSION');

  return byIndicator[String(indicatorId || '').toLowerCase()]
    || byCriterion[String(criterionId || '').toLowerCase()]
    || byDimension[String(dimensionId || '')]
    || process.env.DRIVE_ROOT_FOLDER_ID
    || '';
}

async function getDriveAccessToken() {
  const staticToken = process.env.GOOGLE_DRIVE_ACCESS_TOKEN;
  if (staticToken) return staticToken;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return '';

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || 'No se pudo renovar token de Drive.');
  }
  return data.access_token;
}

async function uploadToDrive({ file, generatedName, folderId }) {
  const accessToken = await getDriveAccessToken();
  if (!accessToken) throw new Error('Falta configurar token de Google Drive.');
  if (!folderId) throw new Error('No se encontró carpeta destino para este indicador/criterio.');

  const metadata = {
    name: generatedName,
    parents: [folderId],
  };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([file.buffer], { type: file.mimetype || 'application/octet-stream' }), generatedName);

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Google Drive rechazó la subida.');
  }
  return data;
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

app.post('/api/drive/upload', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'missing_file' });

    const generatedName = String(req.body?.generatedName || '').trim();
    const indicatorId = String(req.body?.indicatorId || '').trim().toLowerCase();
    const criterionId = String(req.body?.criterionId || '').trim().toLowerCase();
    const dimensionId = String(req.body?.dimensionId || '').trim();
    if (!generatedName || !indicatorId || !criterionId || !dimensionId) {
      return res.status(400).json({ ok: false, error: 'missing_metadata' });
    }

    const folderId = driveFolderFor({ indicatorId, criterionId, dimensionId });
    const uploaded = await uploadToDrive({ file: req.file, generatedName, folderId });
    return res.status(200).json({
      ok: true,
      file: {
        id: uploaded.id,
        name: uploaded.name,
        link: uploaded.webViewLink || `https://drive.google.com/open?id=${uploaded.id}`,
        folderId,
      },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
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
