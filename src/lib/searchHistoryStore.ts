import type { FormState, SearchHistoryEntry } from '../types'

const STORAGE_KEY = 'finanalyzr.search-history.v1'
const MAX_ITEMS = 120

function parse(raw: string | null): SearchHistoryEntry[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as SearchHistoryEntry[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function persist(items: SearchHistoryEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)))
}

export function loadSearchHistory(): SearchHistoryEntry[] {
  const items = parse(localStorage.getItem(STORAGE_KEY))
  return items.sort((a, b) => new Date(b.fetchedAt).getTime() - new Date(a.fetchedAt).getTime())
}

export function upsertSearchHistory(input: {
  ticker: string
  stockName?: string
  sourceTradeDate?: string
  fetchedAt?: string
  form: FormState
}): SearchHistoryEntry {
  const fetchedAt = input.fetchedAt || new Date().toISOString()
  const sourceTradeDate = input.sourceTradeDate
  const id = `${input.ticker}_${sourceTradeDate || fetchedAt.slice(0, 10)}`

  const entry: SearchHistoryEntry = {
    id,
    ticker: input.ticker,
    stockName: input.stockName || input.ticker,
    sourceTradeDate,
    fetchedAt,
    form: input.form,
  }

  const existing = loadSearchHistory().filter((item) => item.id !== id)
  const next = [entry, ...existing]
  persist(next)

  console.info('[FinAnalyzr] search-history upsert', {
    id: entry.id,
    ticker: entry.ticker,
    sourceTradeDate: entry.sourceTradeDate,
  })

  return entry
}

export function removeSearchHistory(id: string): void {
  const next = loadSearchHistory().filter((item) => item.id !== id)
  persist(next)
  console.info('[FinAnalyzr] search-history remove', { id })
}
