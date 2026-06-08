import { describe, it, expect, beforeEach, vi } from 'vitest'
import { upsertSearchHistory, removeSearchHistory, loadSearchHistory } from './searchHistoryStore'
import type { FormState } from '../types'

// Mock storage
const mockStorage: Map<string, string> = new Map()

beforeEach(() => {
  mockStorage.clear()
  vi.doMock('./storage', () => ({
    getStorage: () => ({
      getItem: (key: string) => mockStorage.get(key) ?? null,
      setItem: (key: string, value: string) => mockStorage.set(key, value),
    }),
    getStorageKey: (key: string) => key,
  }))
})

const baseForm: FormState = {
  ticker: 'AAPL',
  price: 150,
  fcf0: 100,
  forecastYears: 5,
  fcfGrowth: 0.05,
  discountRate: 0.08,
  terminalGrowth: 0.03,
  netDebt: 50,
  sharesOutstanding: 16,
  eps: 6,
  bvps: 40,
  ebitdaPerShare: 15,
  industryPE: 25,
  industryPB: 4,
  industryEVEBITDA: 15,
  dividend0: 0.9,
  dividendGrowth: 0.1,
  ddmYears: 10,
  requiredReturn: 0.08,
  stableGrowth: 0.03,
  roic: 0.15,
  deRatio: 0.3,
  fcfConversion: 0.8,
  governanceScore: 8,
  moatScore: 8,
}

describe('searchHistoryStore - Deduplication & Timestamps', () => {
  it('should create a new entry with createdAt and updatedAt', () => {
    const before = new Date().getTime()
    const entry = upsertSearchHistory({
      ticker: 'AAPL',
      stockName: 'Apple Inc.',
      form: baseForm,
    })
    const after = new Date().getTime()

    expect(entry.id).toBe('AAPL') // ticker only
    expect(entry.ticker).toBe('AAPL')
    expect(entry.stockName).toBe('Apple Inc.')
    expect(entry.createdAt).toBeDefined()
    expect(entry.updatedAt).toBeDefined()
    const createdAtTime = new Date(entry.createdAt).getTime()
    expect(createdAtTime).toBeGreaterThanOrEqual(before)
    expect(createdAtTime).toBeLessThanOrEqual(after)
    expect(entry.createdAt).toBe(entry.updatedAt)
  })

  it('should update existing entry by ticker only - preserve createdAt, update updatedAt', async () => {
    // First insert
    const first = upsertSearchHistory({
      ticker: 'AAPL',
      stockName: 'Apple Inc.',
      form: baseForm,
    })
    const createdAt = first.createdAt

    // Wait a bit to ensure timestamps differ
    await new Promise((resolve) => setTimeout(resolve, 10))

    // Update with new data
    const updated = upsertSearchHistory({
      ticker: 'AAPL',
      stockName: 'Apple Inc.',
      sourceTradeDate: '2024-01-15',
      form: { ...baseForm, price: 180 },
    })

    expect(updated.id).toBe('AAPL') // same id
    expect(updated.createdAt).toBe(createdAt) // preserved
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(new Date(createdAt).getTime()) // updated
    expect(updated.form.price).toBe(180) // new data
  })

  it('should not create duplicate entries for same ticker even on different dates', async () => {
    // First entry
    upsertSearchHistory({
      ticker: 'AAPL',
      stockName: 'Apple Inc.',
      form: baseForm,
    })

    await new Promise((resolve) => setTimeout(resolve, 10))

    // Second entry for same ticker (should update, not create)
    upsertSearchHistory({
      ticker: 'AAPL',
      stockName: 'Apple Inc.',
      sourceTradeDate: '2024-02-20',
      form: { ...baseForm, price: 160 },
    })

    const history = loadSearchHistory()
    expect(history).toHaveLength(1)
    expect(history[0].ticker).toBe('AAPL')
    expect(history[0].sourceTradeDate).toBe('2024-02-20')
  })

  it('should sort by updatedAt descending - most recent first', async () => {
    // Create multiple entries
    upsertSearchHistory({
      ticker: 'AAPL',
      stockName: 'Apple Inc.',
      form: baseForm,
    })

    await new Promise((resolve) => setTimeout(resolve, 10))

    const entry2 = upsertSearchHistory({
      ticker: 'MSFT',
      stockName: 'Microsoft Corp.',
      form: { ...baseForm, ticker: 'MSFT' },
    })

    await new Promise((resolve) => setTimeout(resolve, 10))

    // Update first entry
    const entry1Updated = upsertSearchHistory({
      ticker: 'AAPL',
      stockName: 'Apple Inc.',
      form: { ...baseForm, price: 170 },
    })

    const history = loadSearchHistory()
    expect(history).toHaveLength(2)
    expect(history[0].ticker).toBe('AAPL') // most recent
    expect(history[1].ticker).toBe('MSFT') // less recent
    expect(history[0].updatedAt).toBe(entry1Updated.updatedAt)
    expect(history[1].updatedAt).toBe(entry2.updatedAt)
  })

  it('should preserve sourceTradeDate as data field (not part of identity)', () => {
    const entry1 = upsertSearchHistory({
      ticker: 'AAPL',
      stockName: 'Apple Inc.',
      sourceTradeDate: '2024-01-15',
      form: baseForm,
    })

    expect(entry1.sourceTradeDate).toBe('2024-01-15')

    // Update with different sourceTradeDate
    const entry2 = upsertSearchHistory({
      ticker: 'AAPL',
      stockName: 'Apple Inc.',
      sourceTradeDate: '2024-02-20',
      form: { ...baseForm, price: 180 },
    })

    expect(entry2.id).toBe('AAPL') // same id (ticker only)
    expect(entry2.sourceTradeDate).toBe('2024-02-20') // updated
    expect(entry2.createdAt).toBe(entry1.createdAt) // preserved
  })

  it('should support multiple different tickers in history', () => {
    upsertSearchHistory({
      ticker: 'AAPL',
      stockName: 'Apple Inc.',
      form: baseForm,
    })

    upsertSearchHistory({
      ticker: 'MSFT',
      stockName: 'Microsoft Corp.',
      form: { ...baseForm, ticker: 'MSFT' },
    })

    upsertSearchHistory({
      ticker: 'GOOGL',
      stockName: 'Alphabet Inc.',
      form: { ...baseForm, ticker: 'GOOGL' },
    })

    const history = loadSearchHistory()
    expect(history).toHaveLength(3)
    expect(new Set(history.map((h) => h.ticker))).toEqual(new Set(['AAPL', 'MSFT', 'GOOGL']))
  })

  it('should handle upsert with explicit createdAt (for migration)', () => {
    const customCreatedAt = '2024-01-01T00:00:00.000Z'

    const entry = upsertSearchHistory({
      ticker: 'AAPL',
      stockName: 'Apple Inc.',
      createdAt: customCreatedAt,
      form: baseForm,
    })

    expect(entry.createdAt).toBe(customCreatedAt)
    expect(entry.updatedAt).not.toBe(customCreatedAt) // updatedAt is fresh
  })

  it('should remove entry by id (ticker)', () => {
    upsertSearchHistory({
      ticker: 'AAPL',
      stockName: 'Apple Inc.',
      form: baseForm,
    })

    let history = loadSearchHistory()
    expect(history).toHaveLength(1)

    removeSearchHistory('AAPL')

    history = loadSearchHistory()
    expect(history).toHaveLength(0)
  })
})
