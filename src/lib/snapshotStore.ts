import type { AnalysisResult, FormState, Snapshot } from '../types'
import { APP_LIMITS } from '../config'
import { getStorage, getStorageKey } from './storage'

const STORAGE = getStorage()
const STORAGE_KEY = getStorageKey('snapshots.v1')
const MAX_SNAPSHOTS = APP_LIMITS.snapshotsMaxItems

function safeParse(raw: string | null): Snapshot[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as Snapshot[]
    if (!Array.isArray(parsed)) return []
    return parsed
  } catch {
    return []
  }
}

export function loadSnapshots(): Snapshot[] {
  return safeParse(STORAGE.getItem(STORAGE_KEY))
}

export function saveSnapshot(form: FormState, result: AnalysisResult, label: string): Snapshot {
  const existing = loadSnapshots()
  const snapshot: Snapshot = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    label: label.trim() || `${form.ticker} ${new Date().toLocaleString('zh-CN')}`,
    form,
    result,
  }
  const next = [snapshot, ...existing].slice(0, MAX_SNAPSHOTS)
  STORAGE.setItem(STORAGE_KEY, JSON.stringify(next))
  return snapshot
}

export function deleteSnapshot(id: string): void {
  const next = loadSnapshots().filter((s) => s.id !== id)
  STORAGE.setItem(STORAGE_KEY, JSON.stringify(next))
}
