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

export function loadPendingEvidence(): PendingEvidence[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function savePendingEvidence(items: PendingEvidence[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
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
