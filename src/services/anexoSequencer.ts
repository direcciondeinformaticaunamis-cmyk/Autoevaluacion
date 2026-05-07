type Parsed = {
  dimensionId: string | null;
  anexoNum: number | null;
  indicatorId: string | null;
  criterionId: string | null;
};

function parseName(name: string): Parsed {
  const dim = name.match(/(?:^|[^a-z0-9])C\s*([123])\s*_?\s*ANEXO(?:_|\s|[^a-z0-9]|$)/i);
  const anexo = name.match(/ANEXO\s*_?\s*(\d{1,6})(?:_|\s|[^a-z0-9]|$)/i);
  const indicator = name.match(/(\d+\.\d+\.[a-z])/i);
  const indicatorId = indicator ? indicator[1].toLowerCase() : null;
  const criterionId = indicatorId ? indicatorId.split('.').slice(0, 2).join('.') : null;

  return {
    dimensionId: dim ? dim[1] : null,
    anexoNum: anexo ? Number(anexo[1]) : null,
    indicatorId,
    criterionId,
  };
}

export function buildMaxAnexoByCriterion(names: string[]): Map<string, number> {
  const maxBy = new Map<string, number>();
  for (const n of names) {
    const p = parseName(n);
    if (!p.criterionId || !p.anexoNum || Number.isNaN(p.anexoNum)) continue;
    const prev = maxBy.get(p.criterionId) ?? 0;
    if (p.anexoNum > prev) maxBy.set(p.criterionId, p.anexoNum);
  }
  return maxBy;
}

export function nextAnexoForCriterion(maxBy: Map<string, number>, criterionId: string): number {
  const prev = maxBy.get(criterionId) ?? 0;
  const next = prev + 1;
  maxBy.set(criterionId, next);
  return next;
}

export function buildMaxAnexoByDimension(names: string[]): Map<string, number> {
  const maxBy = new Map<string, number>();
  for (const n of names) {
    const p = parseName(n);
    if (!p.dimensionId || !p.anexoNum || Number.isNaN(p.anexoNum)) continue;
    const prev = maxBy.get(p.dimensionId) ?? 0;
    if (p.anexoNum > prev) maxBy.set(p.dimensionId, p.anexoNum);
  }
  return maxBy;
}

export function nextAnexoForDimension(maxBy: Map<string, number>, dimensionId: string): number {
  const prev = maxBy.get(dimensionId) ?? 0;
  const next = prev + 1;
  maxBy.set(dimensionId, next);
  return next;
}

export function buildMaxAnexoForCatalog(names: string[]): number {
  let max = 0;
  for (const n of names) {
    const p = parseName(n);
    if (!p.anexoNum || Number.isNaN(p.anexoNum)) continue;
    if (p.anexoNum > max) max = p.anexoNum;
  }
  return max;
}

export function nextAnexoForCatalog(currentMax: number): number {
  return currentMax + 1;
}
