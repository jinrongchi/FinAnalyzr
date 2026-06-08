import type { FormState, SearchHistoryEntry } from '../types'
import { APP_LIMITS } from '../config'
import { logger } from './logger'
import { getStorage, getStorageKey } from './storage'

const STORAGE = getStorage()
const STORAGE_KEY = getStorageKey('search-history.v1')
const MAX_ITEMS = APP_LIMITS.searchHistoryMaxItems

// Migrate legacy entries (with fetchedAt) to new format (with createdAt/updatedAt)
function migrateEntry(entry: any): { entry: SearchHistoryEntry; migrated: boolean } {
  // Already in new format
  if (entry.updatedAt && entry.createdAt) {
    return { entry: entry as SearchHistoryEntry, migrated: false }
  }

  // Legacy format with fetchedAt
  if (entry.fetchedAt && !entry.updatedAt) {
    return {
      entry: {
        ...entry,
        id: entry.ticker, // Convert old compound ID to ticker-only ID
        createdAt: entry.fetchedAt,
        updatedAt: entry.fetchedAt,
      },
      migrated: true,
    }
  }

  // Fallback: ensure all required fields exist
  const now = new Date().toISOString()
  return {
    entry: {
      ...entry,
      id: entry.ticker,
      createdAt: entry.createdAt || entry.fetchedAt || now,
      updatedAt: entry.updatedAt || entry.fetchedAt || now,
    },
    migrated: !entry.updatedAt,
  }
}

function parse(raw: string | null): { items: SearchHistoryEntry[]; needsPersist: boolean } {
  if (!raw) return { items: [], needsPersist: false }
  try {
    const parsed = JSON.parse(raw) as any[]
    if (!Array.isArray(parsed)) return { items: [], needsPersist: false }
    
    // Migrate legacy entries and deduplicate by new ID (ticker only)
    const migrations = parsed.map(migrateEntry)
    const migrated = migrations.map((m) => m.entry)
    const needsPersist = migrations.some((m) => m.migrated)
    
    // Deduplicate: keep only the most recently updated entry per ticker
    const deduped = new Map<string, SearchHistoryEntry>()
    for (const entry of migrated) {
      const existing = deduped.get(entry.id)
      if (!existing || new Date(entry.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
        deduped.set(entry.id, entry)
      }
    }
    
    return { items: Array.from(deduped.values()), needsPersist }
  } catch {
    return { items: [], needsPersist: false }
  }
}

function persist(items: SearchHistoryEntry[]): void {
  STORAGE.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)))
}

export function loadSearchHistory(): SearchHistoryEntry[] {
  const { items, needsPersist } = parse(STORAGE.getItem(STORAGE_KEY))
  // Re-save if migration happened to persist the new format
  if (needsPersist && items.length > 0) {
    persist(items)
    logger.info('search-history migrated from legacy format', { count: items.length })
  }
  return items.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

export function upsertSearchHistory(input: {
  ticker: string
  stockName?: string
  sourceTradeDate?: string
  createdAt?: string
  form: FormState
}): SearchHistoryEntry {
  const now = new Date().toISOString()
  const id = input.ticker // stable identity: ticker only
  const existing = loadSearchHistory().find((item) => item.id === id)

  const entry: SearchHistoryEntry = {
    id,
    ticker: input.ticker,
    stockName: input.stockName || input.ticker,
    sourceTradeDate: input.sourceTradeDate,
    createdAt: existing?.createdAt || input.createdAt || now, // preserve on update
    updatedAt: now, // always update timestamp
    form: input.form,
  }

  const next = [entry, ...loadSearchHistory().filter((item) => item.id !== id)]
  persist(next)

  logger.info('search-history upsert', {
    id: entry.id,
    ticker: entry.ticker,
    sourceTradeDate: entry.sourceTradeDate,
    isUpdate: !!existing,
  })

  return entry
}

export function removeSearchHistory(id: string): void {
  const next = loadSearchHistory().filter((item) => item.id !== id)
  persist(next)
  logger.info('search-history remove', { id })
}
