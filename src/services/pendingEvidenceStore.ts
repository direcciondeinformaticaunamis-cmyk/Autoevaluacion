export type PendingEvidence = {
  id: string;
  originalName: string;
  generatedName: string;
  indicatorId: string;
  dimensionId: string;
  year: string;
  link?: string;
  pending?: boolean;
  createdAt: number;
};

const STORAGE_KEY = 'unamis.pendingEvidence.v1';

function normalizeItems(items: PendingEvidence[]): PendingEvidence[] {
  return items
    .filter((item) => item.generatedName && item.indicatorId && item.dimensionId)
    .map((item) => ({
      ...item,
      indicatorId: item.indicatorId.toLowerCase(),
      pending: item.pending ?? !item.link,
    }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function loadPendingEvidence(): PendingEvidence[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return normalizeItems(parsed);
  } catch {
    return [];
  }
}

export function savePendingEvidence(items: PendingEvidence[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeItems(items)));
}

export function mergePendingEvidence(localItems: PendingEvidence[], remoteItems: PendingEvidence[]): PendingEvidence[] {
  const byKey = new Map<string, PendingEvidence>();
  for (const item of [...remoteItems, ...localItems]) {
    const key = item.id || item.generatedName;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, item);
      continue;
    }
    const itemIsMoreComplete = (existing.pending ?? true) && !(item.pending ?? true);
    const itemHasLink = !existing.link && !!item.link;
    if (itemIsMoreComplete || itemHasLink || item.createdAt > existing.createdAt) byKey.set(key, item);
  }
  return normalizeItems([...byKey.values()]);
}

export async function fetchPendingEvidence(): Promise<PendingEvidence[]> {
  const res = await fetch('/api/pending-evidence', { credentials: 'include' });
  if (!res.ok) throw new Error('No se pudo leer la base de datos de anexos.');
  const data = await res.json();
  if (!data?.ok || !Array.isArray(data.items)) return [];
  return normalizeItems(data.items);
}

export async function syncPendingEvidence(items: PendingEvidence[]): Promise<PendingEvidence[]> {
  const res = await fetch('/api/pending-evidence', {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: normalizeItems(items) }),
  });
  if (!res.ok) throw new Error('No se pudo guardar la base de datos de anexos.');
  const data = await res.json();
  const saved = data?.ok && Array.isArray(data.items) ? normalizeItems(data.items) : normalizeItems(items);
  savePendingEvidence(saved);
  return saved;
}

export function addPendingEvidence(items: PendingEvidence[], next: Omit<PendingEvidence, 'id' | 'createdAt'>): PendingEvidence[] {
  const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const updated = [{ ...next, id, createdAt: Date.now() }, ...items];
  savePendingEvidence(updated);
  return updated;
}

export function removePendingEvidence(items: PendingEvidence[], id: string): PendingEvidence[] {
  const updated = items.filter((x) => x.id !== id);
  savePendingEvidence(updated);
  return updated;
}

export function clearPendingEvidence() {
  localStorage.removeItem(STORAGE_KEY);
}
