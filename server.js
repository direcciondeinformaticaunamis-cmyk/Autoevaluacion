import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 3000;
const DIST_DIR = path.join(__dirname, 'dist');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PENDING_EVIDENCE_FILE = path.join(DATA_DIR, 'pending-evidence.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const CATALOG_LINKS_FILE = path.join(__dirname, 'src', 'constants', 'catalogLinks.ts');

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

// Persisted sessions for single-instance hosting. If you scale horizontally, swap this for Redis/DB.
const sessions = new Map(readJsonFile(SESSIONS_FILE, []).map((s) => [s.sid, s]));

function readJsonFile(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed ?? fallback;
  } catch (err) {
    console.error(`Could not read ${file}:`, err);
    return fallback;
  }
}

function writeJsonFile(file, value) {
  ensureDataDir();
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function persistSessions() {
  writeJsonFile(SESSIONS_FILE, [...sessions.entries()].map(([sid, sess]) => ({ sid, ...sess })));
}

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
  if (!user) return res.status(401).json({ ok: false, error: 'unauthorized' });
  req.user = user;
  return next();
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readPendingEvidence() {
  try {
    if (!fs.existsSync(PENDING_EVIDENCE_FILE)) return [];
    const raw = fs.readFileSync(PENDING_EVIDENCE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Could not read pending evidence database:', err);
    return [];
  }
}

function readBaseCatalogNames() {
  try {
    const raw = fs.readFileSync(CATALOG_LINKS_FILE, 'utf8');
    const names = [];
    const re = /["']([^"']+)["']\s*:/g;
    let match;
    while ((match = re.exec(raw))) names.push(match[1].replace(/\s+/g, '_'));
    return names;
  } catch (err) {
    console.error('Could not read base catalog links:', err);
    return [];
  }
}

function normalizePendingEvidenceItem(item) {
  if (!item || typeof item !== 'object') return null;
  const generatedName = String(item.generatedName || '').trim();
  const indicatorId = String(item.indicatorId || '').trim().toLowerCase();
  const dimensionId = String(item.dimensionId || '').trim();
  if (!generatedName || !indicatorId || !dimensionId) return null;

  return {
    id: String(item.id || crypto.randomUUID()),
    originalName: String(item.originalName || generatedName).trim(),
    generatedName,
    indicatorId,
    dimensionId,
    year: String(item.year || new Date().getFullYear()).trim(),
    link: String(item.link || '').trim(),
    pending: Boolean(item.pending ?? !String(item.link || '').trim()),
    createdAt: Number.isFinite(Number(item.createdAt)) ? Number(item.createdAt) : Date.now(),
  };
}

function writePendingEvidence(items) {
  ensureDataDir();
  const normalized = items
    .map(normalizePendingEvidenceItem)
    .filter(Boolean)
    .sort((a, b) => b.createdAt - a.createdAt);
  fs.writeFileSync(PENDING_EVIDENCE_FILE, JSON.stringify(normalized, null, 2));
  return normalized;
}

function appendHistory(user, action, details = {}) {
  const history = readJsonFile(HISTORY_FILE, []);
  const entry = {
    id: crypto.randomUUID(),
    user,
    action,
    createdAt: Date.now(),
    ...details,
  };
  writeJsonFile(HISTORY_FILE, [entry, ...Array.isArray(history) ? history : []].slice(0, 1000));
  return entry;
}

function normalizeDriveLink(link) {
  const raw = String(link || '').trim();
  if (!raw) return '';
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('invalid_url');
  }
  if (!/(^|\.)drive\.google\.com$/i.test(url.hostname)) throw new Error('invalid_drive_link');
  return url.toString();
}

function parseAnexoName(name) {
  const dim = String(name).match(/\bC\s*([123])\s*_?\s*ANEXO\b/i);
  const anexo = String(name).match(/\bANEXO\s*_?\s*(\d{1,6})\b/i);
  return {
    dimensionId: dim ? dim[1] : null,
    anexoNum: anexo ? Number(anexo[1]) : null,
  };
}

function nextAnexoForDimension(names, dimensionId) {
  let max = 0;
  for (const name of names) {
    const parsed = parseAnexoName(name);
    if (parsed.dimensionId !== dimensionId || !parsed.anexoNum || Number.isNaN(parsed.anexoNum)) continue;
    if (parsed.anexoNum > max) max = parsed.anexoNum;
  }
  return max + 1;
}

function safeFileBase(name) {
  return String(name || 'archivo')
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'archivo';
}

function buildGeneratedName({ originalName, indicatorId, dimensionId, knownNames = [] }) {
  const existingNames = [
    ...readBaseCatalogNames(),
    ...knownNames.map(String),
    ...readPendingEvidence().map((item) => item.generatedName),
  ];
  const anexoNum = nextAnexoForDimension(existingNames, String(dimensionId));
  const anexoStr = String(anexoNum).padStart(3, '0');
  const ext = String(originalName || '').match(/\.[^.]+$/)?.[0]?.toLowerCase() || '';
  return `C${dimensionId}_ANEXO_${anexoStr}_${String(indicatorId).toLowerCase()}_01_${safeFileBase(originalName)}${ext}`;
}

function diffPendingEvidence(oldItems, newItems, user) {
  const oldById = new Map(oldItems.map((item) => [item.id, item]));
  const newById = new Map(newItems.map((item) => [item.id, item]));
  for (const oldItem of oldItems) {
    if (!newById.has(oldItem.id)) {
      appendHistory(user, 'removed_evidence', {
        evidenceId: oldItem.id,
        generatedName: oldItem.generatedName,
        indicatorId: oldItem.indicatorId,
        link: oldItem.link || '',
      });
    }
  }
  for (const newItem of newItems) {
    const oldItem = oldById.get(newItem.id);
    if (!oldItem) continue;
    if ((oldItem.link || '') !== (newItem.link || '') || Boolean(oldItem.pending) !== Boolean(newItem.pending)) {
      appendHistory(user, newItem.link ? 'saved_drive_link' : 'updated_evidence', {
        evidenceId: newItem.id,
        generatedName: newItem.generatedName,
        indicatorId: newItem.indicatorId,
        link: newItem.link || '',
      });
    }
  }
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
  persistSessions();
  setSessionCookie(res, sid, secure);
  return res.status(200).json({ ok: true, user });
});

app.post('/api/logout', (req, res) => {
  const secure = isHttps(req);
  const cookies = parseCookies(req.headers.cookie);
  const sid = cookies.unamis_sid;
  if (sid) sessions.delete(sid);
  persistSessions();
  clearSessionCookie(res, secure);
  return res.status(200).json({ ok: true });
});

app.get('/api/pending-evidence', requireAuth, (_req, res) => {
  return res.status(200).json({ ok: true, items: readPendingEvidence() });
});

app.get('/api/evidence-history', requireAuth, (req, res) => {
  const history = readJsonFile(HISTORY_FILE, []);
  return res.status(200).json({ ok: true, items: Array.isArray(history) ? history : [] });
});

app.post('/api/anexo-preview', requireAuth, (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  const knownNames = Array.isArray(req.body?.knownNames) ? req.body.knownNames : [];
  const generatedNames = [];
  const workingNames = [...knownNames, ...readPendingEvidence().map((item) => item.generatedName)];
  for (const item of items) {
    const generatedName = buildGeneratedName({ ...item, knownNames: workingNames });
    generatedNames.push(generatedName);
    workingNames.push(generatedName);
  }
  return res.status(200).json({ ok: true, generatedNames });
});

app.post('/api/anexo-reserve', requireAuth, (req, res) => {
  const originalName = String(req.body?.originalName || '').trim();
  const indicatorId = String(req.body?.indicatorId || '').trim().toLowerCase();
  const dimensionId = String(req.body?.dimensionId || '').trim();
  const knownNames = Array.isArray(req.body?.knownNames) ? req.body.knownNames : [];
  if (!originalName || !indicatorId || !dimensionId) return res.status(400).json({ ok: false, error: 'missing_fields' });

  const generatedName = buildGeneratedName({ originalName, indicatorId, dimensionId, knownNames });
  const current = readPendingEvidence();
  const item = normalizePendingEvidenceItem({
    id: crypto.randomUUID(),
    originalName,
    generatedName,
    indicatorId,
    dimensionId,
    year: String(req.body?.year || new Date().getFullYear()),
    link: '',
    pending: true,
    createdAt: Date.now(),
  });
  const items = writePendingEvidence([item, ...current]);
  appendHistory(req.user, 'codified_evidence', { evidenceId: item.id, generatedName, indicatorId, link: '' });
  return res.status(200).json({ ok: true, item, items });
});

app.put('/api/pending-evidence', requireAuth, (req, res) => {
  if (!Array.isArray(req.body?.items)) {
    return res.status(400).json({ ok: false, error: 'items_must_be_array' });
  }
  try {
    const incoming = req.body.items.map((item) => ({
      ...item,
      link: item?.link ? normalizeDriveLink(item.link) : '',
      pending: item?.link ? false : item?.pending,
    }));
    const previous = readPendingEvidence();
    const items = writePendingEvidence(incoming);
    diffPendingEvidence(previous, items, req.user);
    return res.status(200).json({ ok: true, items });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message || 'invalid_evidence' });
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
