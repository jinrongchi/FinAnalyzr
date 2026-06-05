import { useState } from 'react'
import { loadSearchHistory, removeSearchHistory, upsertSearchHistory } from '../lib/searchHistoryStore'
import type { FormState, SearchHistoryEntry } from '../types'

type SaveHistoryInput = {
  ticker: string
  stockName?: string
  sourceTradeDate?: string
  fetchedAt?: string
  form: FormState
}

export function useSearchHistory() {
  const [searchHistory, setSearchHistory] = useState<SearchHistoryEntry[]>(() => loadSearchHistory())

  function refreshSearchHistory(): void {
    setSearchHistory(loadSearchHistory())
  }

  function saveHistoryEntry(input: SaveHistoryInput): void {
    upsertSearchHistory(input)
    refreshSearchHistory()
  }

  function removeHistoryEntry(id: string): void {
    removeSearchHistory(id)
    refreshSearchHistory()
  }

  return {
    searchHistory,
    refreshSearchHistory,
    saveHistoryEntry,
    removeHistoryEntry,
  }
}
