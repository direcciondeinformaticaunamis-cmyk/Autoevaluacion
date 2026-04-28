import fs from 'node:fs/promises';
import path from 'node:path';

function decodeHtml(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function extractAnchors(html) {
  const out = [];
  const re = /<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = decodeHtml(m[1]);
    const text = decodeHtml(m[2].replace(/<[^>]+>/g, ''));
    if (!href || !text) continue;
    out.push({ text, href });
  }
  return out;
}

function normalizeFilename(s) {
  // Word often uses spaces; repo uses underscores.
  const t = s.replace(/\s+/g, '_').trim();
  return t;
}

function toTs(mapObj) {
  return (
    `// Auto-generated from dimension catalog .docx files\n` +
    `export const CATALOG_LINKS: Record<string, string> = ${JSON.stringify(mapObj, null, 2)} as const;\n`
  );
}

const outPath = process.argv[2];
const inputs = process.argv.slice(3);

if (!outPath || inputs.length === 0) {
  console.error('Usage: node scripts/generate-catalog-links.mjs <output.ts> <dimension1.html> [dimension2.html] ...');
  process.exit(2);
}

const map = {};

for (const inPath of inputs) {
  const html = await fs.readFile(inPath, 'utf8');
  for (const a of extractAnchors(html)) {
    const key = normalizeFilename(a.text);
    // Prefer first occurrence.
    if (!map[key]) map[key] = a.href;
  }
}

await fs.mkdir(path.dirname(outPath), { recursive: true });
await fs.writeFile(outPath, toTs(map), 'utf8');
