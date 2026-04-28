import { OFFICIAL_MATRIX } from '../constants/matrix';
import type { IndicatorAnalysis } from './geminiService';
import { CATALOG_LINKS } from '../constants/catalogLinks';

type ParsedDoc = {
  name: string;
  indicatorId: string | null;
  year: string;
  link: string;
};

function flattenIndicators() {
  const out: { id: string; description: string; requiredDocs: string[] }[] = [];
  for (const dim of OFFICIAL_MATRIX) {
    for (const crit of dim.criteria) {
      for (const ind of crit.indicators) {
        out.push({ id: ind.id, description: ind.description, requiredDocs: ind.requiredDocs });
      }
    }
  }
  return out;
}

function extractFirstUrl(line: string): string {
  const m = line.match(/https?:\/\/\S+/i);
  return m?.[0] ?? '';
}

function inferYear(name: string): string {
  const m = name.match(/\b(19|20)\d{2}\b/);
  return m?.[0] ?? new Date().getFullYear().toString();
}

function extractIndicatorId(name: string): string | null {
  // Avoid \b because underscores are word chars in filenames.
  const m = name.match(/(\d+\.\d+\.[a-z])/i);
  return m ? m[1].toLowerCase() : null;
}

function parseDocumentList(documentList: string): ParsedDoc[] {
  const rawLines = documentList
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const out: ParsedDoc[] = [];

  // Some exported docs come concatenated without newlines.
  const tokenRe = /\bC[123]_ANEXO_[A-Za-z0-9._-]+\.(?:pdf|docx|xlsx|xls|png|jpg|jpeg)\b/gi;

  for (const line of rawLines) {
    const link = extractFirstUrl(line);
    const withoutLink = link
      ? line.replace(link, '').trim().replace(/[|\t,]+$/, '').trim()
      : line;

    const tokens = withoutLink.match(tokenRe);
    if (tokens && tokens.length > 1) {
      for (const t of tokens) {
        out.push({
          name: t,
          indicatorId: extractIndicatorId(t),
          year: inferYear(t),
          link,
        });
      }
      continue;
    }

    out.push({
      name: withoutLink,
      indicatorId: extractIndicatorId(withoutLink),
      year: inferYear(withoutLink),
      link,
    });
  }

  return out;
}

function resolveLink(name: string, explicitLink: string): string {
  if (explicitLink) return explicitLink;
  // Try exact match first.
  const direct = CATALOG_LINKS[name];
  if (direct) return direct;
  // Try normalized (spaces -> underscores).
  const norm = name.replace(/\s+/g, '_');
  return CATALOG_LINKS[norm] ?? '';
}

function computeState(found: number, required: number): 'Completo' | 'Parcial' | 'Débil' {
  // Local mode: compliance is based on evidence presence.
  // If you want stricter validation later, switch to Gemini (or another evaluator).
  if (found <= 0) return 'Débil';
  if (required > 0 && found >= required) return 'Completo';
  return 'Parcial';
}

export function analyzeDocumentsOffline(documentList: string): IndicatorAnalysis[] {
  const allIndicators = flattenIndicators();
  const docs = parseDocumentList(documentList);

  const byIndicator = new Map<string, ParsedDoc[]>();
  for (const d of docs) {
    if (!d.indicatorId) continue;
    const arr = byIndicator.get(d.indicatorId) ?? [];
    arr.push(d);
    byIndicator.set(d.indicatorId, arr);
  }

  return allIndicators.map((ind) => {
    const indicatorDocs = byIndicator.get(ind.id) ?? [];
    const state = computeState(indicatorDocs.length, ind.requiredDocs.length);

    const missing = ind.requiredDocs.filter((req) => {
      const needle = req.toLowerCase();
      return !indicatorDocs.some((d) => d.name.toLowerCase().includes(needle));
    });

    const complianceLevel =
      state === 'Completo' ? 'Alto' : state === 'Parcial' ? 'Medio' : 'Bajo';

    return {
      indicator: ind.id,
      description: ind.description,
      documents: indicatorDocs.map((d) => ({
        name: d.name,
        type: 'Evidencial',
        year: d.year,
        focus: 'medio',
        status: 'vigente',
        link: resolveLink(d.name, d.link),
      })),
      technicalAnalysis: {
        complianceLevel,
        mathCoherence: 'N/A (modo local)',
        resourceUsage: 'N/A (modo local)',
        observations:
          `Modo local: se asignaron documentos al indicador por patrón en el nombre (ej. ${ind.id}). ` +
          `Documentos detectados: ${indicatorDocs.length}.`,
      },
      history: 'N/A (modo local)',
      gaps:
        missing.length > 0
          ? missing.map((m) => `Falta evidencia requerida: ${m}`)
          : state === 'Débil'
            ? ['No se detectaron documentos para este indicador en la lista ingresada.']
            : [],
      recommendations:
        missing.length > 0
          ? ['Adjuntar/registrar los documentos faltantes en el catálogo o en la lista de evidencias.']
          : state === 'Débil'
            ? ['Registrar evidencias (nomenclatura + link) que correspondan a este indicador.']
            : ['Revisar consistencia de enlaces y vigencia de documentos.'],
      finalSummary:
        state === 'Completo'
          ? 'Cobertura suficiente según la lista actual.'
          : state === 'Parcial'
            ? 'Cobertura parcial: existen evidencias, pero faltan respaldos requeridos.'
            : 'Cobertura débil: no hay evidencias registradas para este indicador.',
      state,
    } satisfies IndicatorAnalysis;
  });
}
