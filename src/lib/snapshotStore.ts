import type { AnalysisResult, FormState, Snapshot } from '../types'
import { APP_LIMITS } from '../config'
import { getStorage, getStorageKey } from './storage'

const STORAGE = getStorage()
const STORAGE_KEY = getStorageKey('snapshots.v1')
const MAX_SNAPSHOTS = APP_LIMITS.snapshotsMaxItems
let cachedRaw: string | null | undefined
let cachedItems: Snapshot[] = []

function safeParse(raw: string | null): Snapshot[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as Array<Partial<Snapshot>>
    if (!Array.isArray(parsed)) return []
    return parsed.map((item) => ({
      id: item.id || crypto.randomUUID(),
      createdAt: item.createdAt || new Date().toISOString(),
      sourceTradeDate: item.sourceTradeDate,
      tags: Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === 'string') : [],
      label: item.label || '',
      form: item.form as Snapshot['form'],
      result: item.result as Snapshot['result'],
    }))
  } catch {
    return []
  }
}

export function loadSnapshots(): Snapshot[] {
  const raw = STORAGE.getItem(STORAGE_KEY)
  if (raw === cachedRaw) {
    return cachedItems
  }

  const parsed = safeParse(raw)
  cachedRaw = raw
  cachedItems = parsed
  return parsed
}

export function saveSnapshot(
  form: FormState,
  result: AnalysisResult,
  label: string,
  sourceTradeDate?: string,
  tags: string[] = [],
): Snapshot {
  const existing = loadSnapshots()
  const snapshot: Snapshot = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    sourceTradeDate,
    tags,
    label: label.trim() || `${form.ticker} ${new Date().toLocaleString('zh-CN')}`,
    form,
    result,
  }
  const next = [snapshot, ...existing].slice(0, MAX_SNAPSHOTS)
  STORAGE.setItem(STORAGE_KEY, JSON.stringify(next))
  cachedRaw = undefined
  return snapshot
}

export function deleteSnapshot(id: string): void {
  const next = loadSnapshots().filter((s) => s.id !== id)
  STORAGE.setItem(STORAGE_KEY, JSON.stringify(next))
  cachedRaw = undefined
}

export function updateSnapshotTags(id: string, tags: string[]): void {
  const normalized = Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean)))
  const next = loadSnapshots().map((s) => (s.id === id ? { ...s, tags: normalized } : s))
  STORAGE.setItem(STORAGE_KEY, JSON.stringify(next))
  cachedRaw = undefined
}
