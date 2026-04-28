type Parsed = {
  dimensionId: string | null;
  anexoNum: number | null;
  indicatorId: string | null;
  criterionId: string | null;
};

function parseName(name: string): Parsed {
  const dim = name.match(/\bC([123])_ANEXO_/i);
  const anexo = name.match(/\bANEXO_(\d{1,6})\b/i);
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
