import fs from 'node:fs/promises';
import path from 'node:path';

function clean(s) {
  return (s ?? '').trim().replace(/\s+/g, ' ');
}

function parseMatrixText(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim());

  const dimensions = [];
  let currentDim = null;
  let currentCrit = null;

  const dimRe = /^DIMENSION\s+(\d+)\.\s*(.+)$/i;
  const critRe = /^Criterio\s+(\d+\.\d+)\.\s*(.+)$/i;
  const indRe = /^(\d+\.\d+\.[a-z])$/i;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line) {
      i += 1;
      continue;
    }

    const dm = line.match(dimRe);
    if (dm) {
      currentDim = { id: dm[1], name: clean(dm[2]), criteria: [] };
      dimensions.push(currentDim);
      currentCrit = null;
      i += 1;
      continue;
    }

    const cm = line.match(critRe);
    if (cm) {
      if (!currentDim) {
        currentDim = { id: '0', name: 'SIN DIMENSION', criteria: [] };
        dimensions.push(currentDim);
      }
      currentCrit = { id: cm[1], name: clean(cm[2]), indicators: [] };
      currentDim.criteria.push(currentCrit);
      i += 1;
      continue;
    }

    const im = line.match(indRe);
    if (im && currentCrit) {
      const id = im[1].toLowerCase();
      // Expect the next non-empty lines to be: description, required docs, instruments, source.
      const takeNextNonEmpty = () => {
        i += 1;
        while (i < lines.length && !lines[i]) i += 1;
        return i < lines.length ? lines[i] : '';
      };

      const description = clean(takeNextNonEmpty());
      const requiredDocsLine = clean(takeNextNonEmpty());
      const instruments = clean(takeNextNonEmpty());
      const source = clean(takeNextNonEmpty());

      const requiredDocs = requiredDocsLine
        .split(';')
        .map((s) => clean(s))
        .filter(Boolean);

      currentCrit.indicators.push({
        id,
        description,
        requiredDocs,
        instruments,
        source,
      });

      i += 1;
      continue;
    }

    i += 1;
  }

  return dimensions;
}

function toTs(dimensions) {
  const header = `export interface MatrixIndicator {
  id: string;
  description: string;
  requiredDocs: string[];
  instruments: string;
  source: string;
}

export interface MatrixCriterion {
  id: string;
  name: string;
  indicators: MatrixIndicator[];
}

export interface MatrixDimension {
  id: string;
  name: string;
  criteria: MatrixCriterion[];
}

export const OFFICIAL_MATRIX: MatrixDimension[] = `;

  return header + JSON.stringify(dimensions, null, 2) + ' as const;\n';
}

const inPath = process.argv[2];
const outPath = process.argv[3];

if (!inPath || !outPath) {
  console.error('Usage: node scripts/generate-matrix-from-text.mjs <input.txt> <output.ts>');
  process.exit(2);
}

const raw = await fs.readFile(inPath, 'utf8');
const dims = parseMatrixText(raw);
const ts = toTs(dims);

await fs.mkdir(path.dirname(outPath), { recursive: true });
await fs.writeFile(outPath, ts, 'utf8');
