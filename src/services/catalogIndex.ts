import { CATALOG_LINKS } from '../constants/catalogLinks';

export type CatalogItem = {
  name: string;
  link: string;
  indicatorId: string | null;
  dimensionId: string | null;
  year: string | null;
  pending?: boolean;
  pendingId?: string;
};

function inferYear(name: string): string | null {
  const m = name.match(/\b(19|20)\d{2}\b/);
  return m?.[0] ?? null;
}

function extractIndicatorId(name: string): string | null {
  // Avoid \b here because underscores are "word" chars and break boundaries in filenames.
  const m = name.match(/(\d+\.\d+\.[a-z])/i);
  return m ? m[1].toLowerCase() : null;
}

function extractDimensionId(name: string): string | null {
  const m = name.match(/\bC([123])_ANEXO\b/i);
  return m ? m[1] : null;
}

export function buildCatalogIndex(extraItems: CatalogItem[] = []): {
  items: CatalogItem[];
  byDimension: Map<string, CatalogItem[]>;
  byIndicator: Map<string, CatalogItem[]>;
} {
  const baseItems: CatalogItem[] = Object.entries(CATALOG_LINKS).map(([name, link]) => {
    const normName = name.replace(/\s+/g, '_');
    return {
      name: normName,
      link,
      indicatorId: extractIndicatorId(normName),
      dimensionId: extractDimensionId(normName),
      year: inferYear(normName),
    };
  });

  const items: CatalogItem[] = [...extraItems, ...baseItems];

  const byDimension = new Map<string, CatalogItem[]>();
  const byIndicator = new Map<string, CatalogItem[]>();

  for (const it of items) {
    if (it.dimensionId) {
      const arr = byDimension.get(it.dimensionId) ?? [];
      arr.push(it);
      byDimension.set(it.dimensionId, arr);
    }
    if (it.indicatorId) {
      const arr = byIndicator.get(it.indicatorId) ?? [];
      arr.push(it);
      byIndicator.set(it.indicatorId, arr);
    }
  }

  // Stable ordering for UI.
  for (const [, arr] of byDimension) arr.sort((a, b) => a.name.localeCompare(b.name));
  for (const [, arr] of byIndicator) arr.sort((a, b) => a.name.localeCompare(b.name));

  return { items, byDimension, byIndicator };
}
