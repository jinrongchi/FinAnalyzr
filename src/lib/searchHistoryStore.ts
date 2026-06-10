import type { FormState, SearchHistoryEntry } from '../types'
import { APP_LIMITS } from '../config'
import { DEFAULT_FORM } from '../data/defaults'
import { logger } from './logger'
import { getStorage, getStorageKey } from './storage'

const STORAGE = getStorage()
const STORAGE_KEY = getStorageKey('search-history.v1')
const MAX_ITEMS = APP_LIMITS.searchHistoryMaxItems
let cachedRaw: string | null | undefined
let cachedItems: SearchHistoryEntry[] = []

type LegacyHistoryEntry = Partial<SearchHistoryEntry> & {
  fetchedAt?: string
  ticker?: string
  form?: unknown
}

function normalizeForm(value: unknown): FormState {
  if (!value || typeof value !== 'object') return DEFAULT_FORM
  return {
    ...DEFAULT_FORM,
    ...(value as Partial<FormState>),
  }
}

// Migrate legacy entries (with fetchedAt) to new format (with createdAt/updatedAt)
function migrateEntry(entry: LegacyHistoryEntry): { entry: SearchHistoryEntry | null; migrated: boolean } {
  if (!entry.ticker) {
    return { entry: null, migrated: false }
  }

  // Already in new format
  if (entry.updatedAt && entry.createdAt) {
    return {
      entry: {
        id: entry.ticker,
        ticker: entry.ticker,
        stockName: entry.stockName || entry.ticker,
        sourceTradeDate: entry.sourceTradeDate,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        form: normalizeForm(entry.form),
      },
      migrated: false,
    }
  }

  // Legacy format with fetchedAt
  if (entry.fetchedAt && !entry.updatedAt) {
    return {
      entry: {
        id: entry.ticker, // Convert old compound ID to ticker-only ID
        ticker: entry.ticker,
        stockName: entry.stockName || entry.ticker,
        sourceTradeDate: entry.sourceTradeDate,
        createdAt: entry.fetchedAt,
        updatedAt: entry.fetchedAt,
        form: normalizeForm(entry.form),
      },
      migrated: true,
    }
  }

  // Fallback: ensure all required fields exist
  const now = new Date().toISOString()
  return {
    entry: {
      id: entry.ticker,
      ticker: entry.ticker,
      stockName: entry.stockName || entry.ticker,
      sourceTradeDate: entry.sourceTradeDate,
      createdAt: entry.createdAt || entry.fetchedAt || now,
      updatedAt: entry.updatedAt || entry.fetchedAt || now,
      form: normalizeForm(entry.form),
    },
    migrated: !entry.updatedAt,
  }
}

function parse(raw: string | null): { items: SearchHistoryEntry[]; needsPersist: boolean } {
  if (!raw) return { items: [], needsPersist: false }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return { items: [], needsPersist: false }
    const candidateEntries = parsed.filter((entry): entry is LegacyHistoryEntry => Boolean(entry) && typeof entry === 'object')
    
    // Migrate legacy entries and deduplicate by new ID (ticker only)
    const migrations = candidateEntries.map(migrateEntry)
    const migrated = migrations.map((m) => m.entry).filter((entry): entry is SearchHistoryEntry => entry !== null)
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
  // Invalidate cache so subsequent reads observe the latest persisted payload.
  cachedRaw = undefined
}

export function loadSearchHistory(): SearchHistoryEntry[] {
  const raw = STORAGE.getItem(STORAGE_KEY)
  if (raw === cachedRaw) {
    return cachedItems
  }

  const { items, needsPersist } = parse(raw)
  // Re-save if migration happened to persist the new format
  if (needsPersist && items.length > 0) {
    persist(items)
    logger.info('search-history migrated from legacy format', { count: items.length })
  }

  const sorted = items.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  cachedRaw = STORAGE.getItem(STORAGE_KEY)
  cachedItems = sorted
  return sorted
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
  const current = loadSearchHistory()
  const existing = current.find((item) => item.id === id)

  const entry: SearchHistoryEntry = {
    id,
    ticker: input.ticker,
    stockName: input.stockName || input.ticker,
    sourceTradeDate: input.sourceTradeDate,
    createdAt: existing?.createdAt || input.createdAt || now, // preserve on update
    updatedAt: now, // always update timestamp
    form: input.form,
  }

  const next = [entry, ...current.filter((item) => item.id !== id)]
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
