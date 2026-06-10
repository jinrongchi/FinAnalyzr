import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_FORM } from '../data/defaults'
import { loadFromTushare } from './tushare/index'

type ProxyResponse = {
  code: number
  msg: string
  data: {
    fields: string[]
    items: Array<Array<string | number | null>>
  }
}

function ok(fields: string[], items: Array<Array<string | number | null>>): ProxyResponse {
  return {
    code: 0,
    msg: '',
    data: {
      fields,
      items,
    },
  }
}

describe('loadFromTushare source labeling', () => {
  it('maps values by field name when upstream omits some requested columns', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const raw = String(init?.body || '{}')
      const payload = JSON.parse(raw) as { api_name?: string }

      switch (payload.api_name) {
        case 'daily_basic':
          return {
            ok: true,
            json: async () => ok(
              ['ts_code', 'trade_date', 'close', 'pe_ttm', 'pb', 'dv_ttm', 'total_share'],
              [['002850.SZ', '20260608', 183.18, 27.7043, 3.9228, 1.3648, 27795.8806]],
            ),
          }
        case 'fina_indicator':
          return {
            ok: true,
            json: async () => ok(
              ['ts_code', 'end_date', 'eps', 'bps', 'ebitda', 'roic', 'debt_to_assets', 'ocf_to_or'],
              [['002850.SZ', '20260331', 1.67, 49.5799, 3.1391, 42.3151, 0.0534, 16.2]],
            ),
          }
        case 'cashflow':
          return {
            ok: true,
            json: async () => ok(
              ['ts_code', 'end_date', 'n_cashflow_act', 'n_cashflow_inv_act', 'free_cashflow'],
              [['002850.SZ', '20260331', 221033445.55, -527848343.59, -143713058.8774]],
            ),
          }
        case 'stock_basic':
          return {
            ok: true,
            json: async () => ok(['ts_code', 'name'], [['002850.SZ', '科达利']]),
          }
        case 'balancesheet':
          return {
            ok: true,
            json: async () => ok(
              ['ts_code', 'end_date', 'total_cur_liab', 'total_ncl'],
              [['002850.SZ', '20260331', 8274618294.97, 1931325146.06]],
            ),
          }
        case 'stk_factor':
          return {
            ok: true,
            json: async () => ok([], []),
          }
        default:
          return {
            ok: false,
            status: 400,
            json: async () => ({ code: -1, msg: 'unsupported api' }),
          }
      }
    })

    vi.stubGlobal('fetch', fetchMock)

    const result = await loadFromTushare('', '002850', { ...DEFAULT_FORM }, { forceRefresh: true })

    expect(result.sourceTradeDate).toBe('20260608')
    expect(result.stockName).toBe('科达利')

    expect(result.patch.price).toBeCloseTo(183.18, 6)
    expect(result.patch.eps).toBeCloseTo(1.67, 6)
    expect(result.patch.bvps).toBeCloseTo(49.5799, 6)
    expect(result.patch.sharesOutstanding).toBeCloseTo(2.779588, 6)
    expect(result.patch.fcf0).toBeCloseTo(-1.4371, 4)
    expect(result.patch.discountRate).toBe(9)
    expect(result.patch.terminalGrowth).toBe(3)
    expect(result.patch.netDebt).toBeCloseTo(102.0594, 4)

    expect(result.fieldSources.price).toBe('auto')
    expect(result.fieldSources.eps).toBe('auto')
    expect(result.fieldSources.bvps).toBe('auto')
    expect(result.fieldSources.sharesOutstanding).toBe('auto')
    expect(result.fieldSources.fcf0).toBe('auto')
    expect(result.fieldSources.discountRate).toBe('derived')
    expect(result.fieldSources.terminalGrowth).toBe('default')
    expect(result.fieldSources.netDebt).toBe('derived')

    expect(result.fieldNotes.discountRate).toContain('Beta 数据不可用')
    expect(result.fieldNotes.netDebt).toContain('净负债=流动负债+非流动负债-货币资金')
    expect(result.fieldNotes.netDebt).toContain('balancesheet 未返回货币资金')
  })

  it('does not infer manual labels from pre-filled numeric values', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const raw = String(init?.body || '{}')
      const payload = JSON.parse(raw) as { api_name?: string }

      switch (payload.api_name) {
        case 'daily_basic':
          return {
            ok: true,
            json: async () => ok(
              ['ts_code', 'trade_date', 'close', 'pe_ttm', 'pb', 'dv_ttm', 'total_share'],
              [['002850.SZ', '20260608', 183.18, 27.7043, 3.9228, 1.3648, 27795.8806]],
            ),
          }
        case 'fina_indicator':
          return {
            ok: true,
            json: async () => ok(
              ['ts_code', 'end_date', 'eps', 'bps', 'ebitda', 'roic', 'debt_to_assets', 'ocf_to_or'],
              [['002850.SZ', '20260331', 1.67, 49.5799, 3.1391, 42.3151, 0.0534, 16.2]],
            ),
          }
        case 'cashflow':
          return {
            ok: true,
            json: async () => ok(
              ['ts_code', 'end_date', 'n_cashflow_act', 'n_cashflow_inv_act', 'free_cashflow'],
              [['002850.SZ', '20260331', 221033445.55, -527848343.59, -143713058.8774]],
            ),
          }
        case 'stock_basic':
          return {
            ok: true,
            json: async () => ok(['ts_code', 'name'], [['002850.SZ', '科达利']]),
          }
        case 'balancesheet':
          return {
            ok: true,
            json: async () => ok(
              ['ts_code', 'end_date', 'total_cur_liab', 'total_ncl'],
              [['002850.SZ', '20260331', 8274618294.97, 1931325146.06]],
            ),
          }
        case 'stk_factor':
          return {
            ok: true,
            json: async () => ok([], []),
          }
        default:
          return {
            ok: false,
            status: 400,
            json: async () => ({ code: -1, msg: 'unsupported api' }),
          }
      }
    })

    vi.stubGlobal('fetch', fetchMock)

    const result = await loadFromTushare(
      '',
      '002850',
      {
        ...DEFAULT_FORM,
        industryPE: 30,
        industryPB: 3,
        discountRate: 12,
        terminalGrowth: 4,
        dividend0: 2,
        dividendGrowth: 5,
        moatScore: 70,
        governanceScore: 75,
        fcfGrowth: 8,
        fcfConversion: 90,
      },
      { forceRefresh: true },
    )

    expect(result.fieldSources.discountRate).toBeUndefined()
    expect(result.fieldSources.terminalGrowth).toBeUndefined()
    expect(result.fieldSources.industryPE).toBeUndefined()
    expect(result.fieldSources.industryPB).toBeUndefined()
    expect(result.fieldSources.dividend0).toBe('auto')
    expect(result.fieldSources.dividendGrowth).toBeUndefined()
    expect(result.fieldSources.peg).toBe('derived')
    expect(result.fieldSources.moatScore).toBeUndefined()
    expect(result.fieldSources.governanceScore).toBeUndefined()
    expect(result.fieldSources.fcfGrowth).toBeUndefined()
    expect(result.fieldSources.fcfConversion).toBe('derived')
  })
})
