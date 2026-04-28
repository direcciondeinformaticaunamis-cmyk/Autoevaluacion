import fs from 'node:fs/promises';
import mammoth from 'mammoth';

const filePath = process.argv[2];
const outPath = process.argv[3];

if (!filePath) {
  console.error('Usage: node scripts/extract-docx.mjs <path-to-docx> [output-txt]');
  process.exit(2);
}

try {
  const buf = await fs.readFile(filePath);
  const mode = (process.argv[4] ?? '').toLowerCase();

  if (mode === 'html') {
    const { value } = await mammoth.convertToHtml({ buffer: buf });
    const html = value ?? '';
    if (outPath) {
      await fs.writeFile(outPath, html, { encoding: 'utf8' });
    } else {
      process.stdout.write(html);
    }
    process.exit(0);
  }

  const { value } = await mammoth.extractRawText({ buffer: buf });
  const text = value ?? '';
  if (outPath) {
    // Always write UTF-8; PowerShell redirection can produce UTF-16.
    await fs.writeFile(outPath, text, { encoding: 'utf8' });
  } else {
    process.stdout.write(text);
  }
} catch (err) {
  console.error(String(err?.stack || err));
  process.exit(1);
}
