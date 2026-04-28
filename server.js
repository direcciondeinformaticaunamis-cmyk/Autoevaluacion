import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const PORT = process.env.PORT || 3000;
const DIST_DIR = path.join(__dirname, 'dist');

// Simple healthcheck for hosting platforms.
app.get('/health', (_req, res) => res.status(200).send('ok'));

// Serve Vite build output.
app.use(express.static(DIST_DIR, {
  maxAge: '1h',
  index: false,
}));

// SPA fallback.
app.get('*', (_req, res) => {
  res.sendFile(path.join(DIST_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server listening on :${PORT}`);
});
