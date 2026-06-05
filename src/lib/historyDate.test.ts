import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildSnapshotName, formatTradeDate, getRefreshStatus, parseTradeDate } from './historyDate'

describe('historyDate helpers', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('formats trade dates consistently', () => {
    expect(formatTradeDate(undefined)).toBe('N/A')
    expect(formatTradeDate('20240617')).toBe('2024-06-17')
    expect(formatTradeDate('2024-06-17')).toBe('2024-06-17')
  })

  it('parses valid date strings and rejects invalid values', () => {
    expect(parseTradeDate(undefined)).toBeNull()
    expect(parseTradeDate('20240617')).not.toBeNull()
    expect(parseTradeDate('bad')).toBeNull()
  })

  it('treats previous Friday as up-to-date on Monday', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-08T10:00:00Z')) // Monday

    const status = getRefreshStatus('20240105') // Friday
    expect(status.canRefresh).toBe(false)
    expect(status.reason.includes('已是最新')).toBe(true)
  })

  it('allows refresh when trade date is older than one day on regular weekdays', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-10T10:00:00Z')) // Wednesday

    const status = getRefreshStatus('20240108') // Monday
    expect(status.canRefresh).toBe(true)
  })

  it('builds snapshot names with fallback label', () => {
    expect(buildSnapshotName('', '600519', '20240617')).toBe('600519 2024-06-17')
  })
})
