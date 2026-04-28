import * as pdfjsLib from 'pdfjs-dist';
import Tesseract from 'tesseract.js';

// pdfjs needs an explicit worker entry for bundlers.
// Vite will resolve this URL at build time.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export async function extractPdfText(file: File, maxPages = 3): Promise<string> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;

  const pages = Math.min(pdf.numPages, Math.max(1, maxPages));
  let out = '';

  for (let pageNum = 1; pageNum <= pages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const text = content.items
      .map((it: any) => (typeof it.str === 'string' ? it.str : ''))
      .filter(Boolean)
      .join(' ');
    out += `\n\n[PAGE ${pageNum}]\n${text}`;
  }

  return out.trim();
}

export async function ocrPdfText(
  file: File,
  maxPages = 2,
  onProgress?: (p: number) => void
): Promise<string> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;

  const pages = Math.min(pdf.numPages, Math.max(1, maxPages));
  let out = '';

  for (let pageNum = 1; pageNum <= pages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.8 });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context not available');

    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);

    // pdfjs types differ across builds; keep this flexible.
    await (page as any).render({ canvasContext: ctx, viewport }).promise;
    const dataUrl = canvas.toDataURL('image/png');

    const { data } = await Tesseract.recognize(dataUrl, 'spa', {
      logger: (m) => {
        if (m.status === 'recognizing text' && typeof m.progress === 'number') {
          const base = (pageNum - 1) / pages;
          const scaled = base + m.progress / pages;
          onProgress?.(Math.max(0, Math.min(1, scaled)));
        }
      },
      // Use CDN assets to avoid bundling huge wasm.
      workerPath: 'https://unpkg.com/tesseract.js@5.0.5/dist/worker.min.js',
      corePath: 'https://unpkg.com/tesseract.js-core@5.0.0/tesseract-core.wasm.js',
      langPath: 'https://tessdata.projectnaptha.com/4.0.0',
    });

    out += `\n\n[OCR PAGE ${pageNum}]\n${(data.text ?? '').trim()}`;
  }

  onProgress?.(1);
  return out.trim();
}
