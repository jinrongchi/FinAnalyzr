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
            json: async () => ok(['ts_code', 'name', 'list_date', 'industry', 'market'], [['002850.SZ', '科达利', '20170302', '电子', '科创板']]),
          }
        case 'balancesheet':
          return {
            ok: true,
            json: async () => ok(
              ['ts_code', 'end_date', 'total_cur_liab', 'total_ncl', 'notes_receiv'],
              [['002850.SZ', '20260331', 8274618294.97, 1931325146.06, 520000000]],
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
    expect(result.patch.industryOverride).toBe(5)
    expect(result.patch.isGrowthBoard).toBe(1)
    expect(result.patch.discountRate).toBe(10)
    expect(result.patch.terminalGrowth).toBe(3)
    expect(result.patch.netDebt).toBeCloseTo(102.0594, 4)

    expect(result.fieldSources.price).toBe('auto')
    expect(result.fieldSources.eps).toBe('auto')
    expect(result.fieldSources.bvps).toBe('auto')
    expect(result.fieldSources.sharesOutstanding).toBe('auto')
    expect(result.fieldSources.fcf0).toBe('auto')
    expect(result.fieldSources.industryOverride).toBe('derived')
    expect(result.fieldSources.discountRate).toBe('derived')
    expect(result.fieldSources.terminalGrowth).toBe('default')
    expect(result.fieldSources.netDebt).toBe('derived')

    expect(result.fieldNotes.discountRate).toContain('Beta 数据不可用')
    expect(result.fieldNotes.discountRate).toContain('成长板风险溢价')
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
            json: async () => ok(['ts_code', 'name', 'list_date', 'industry', 'market'], [['002850.SZ', '科达利', '20170302', '银行', '主板']]),
          }
        case 'balancesheet':
          return {
            ok: true,
            json: async () => ok(
              ['ts_code', 'end_date', 'total_cur_liab', 'total_ncl', 'notes_receiv'],
              [['002850.SZ', '20260331', 8274618294.97, 1931325146.06, 520000000]],
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
        industryOverride: 2,
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
    expect(result.fieldSources.industryOverride).toBeUndefined()
    expect(result.fieldSources.industryPE).toBeUndefined()
    expect(result.fieldSources.industryPB).toBeUndefined()
    expect(result.fieldSources.dividend0).toBe('auto')
    expect(result.fieldSources.dividendGrowth).toBeUndefined()
    expect(result.fieldSources.peg).toBe('derived')
    expect(result.fieldSources.moatScore).toBeUndefined()
    expect(result.fieldSources.governanceScore).toBeUndefined()
    expect(result.fieldSources.fcfGrowth).toBeUndefined()
    expect(result.fieldSources.fcfConversion).toBe('derived')
    expect(result.patch.industryOverride).toBe(2)
    expect(result.patch.isFinancialSector).toBe(1)
    expect(result.patch.discountRate).toBe(12)
  })

  it('recomputes percentile fields from fetched history instead of keeping stale current values', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const raw = String(init?.body || '{}')
      const payload = JSON.parse(raw) as { api_name?: string; params?: { start_date?: string } }

      switch (payload.api_name) {
        case 'daily_basic':
          if (payload.params?.start_date) {
            return {
              ok: true,
              json: async () => ok(
                ['ts_code', 'trade_date', 'close', 'pe_ttm', 'pb', 'dv_ttm', 'total_share'],
                [
                  ['600519.SH', '20260608', 1600, 25, 8, 1.2, 125619.78],
                  ['600519.SH', '20250608', 1500, 20, 7, 1.1, 125619.78],
                  ['600519.SH', '20240608', 1400, 15, 6, 1.0, 125619.78],
                  ['600519.SH', '20230608', 1300, 10, 5, 0.9, 125619.78],
                ],
              ),
            }
          }

          return {
            ok: true,
            json: async () => ok(
              ['ts_code', 'trade_date', 'close', 'pe_ttm', 'pb', 'dv_ttm', 'total_share'],
              [['600519.SH', '20260608', 1600, 25, 8, 1.2, 125619.78]],
            ),
          }
        case 'fina_indicator':
          return {
            ok: true,
            json: async () => ok(
              ['ts_code', 'end_date', 'eps', 'bps', 'ebitda', 'roic', 'debt_to_assets', 'ocf_to_or'],
              [['600519.SH', '20260331', 65, 200, 8000000, 24, 15, 30]],
            ),
          }
        case 'cashflow':
          return {
            ok: true,
            json: async () => ok(
              ['ts_code', 'end_date', 'n_cashflow_act', 'n_cashflow_inv_act', 'free_cashflow'],
              [['600519.SH', '20260331', 10000000000, -2000000000, 8000000000]],
            ),
          }
        case 'stock_basic':
          return {
            ok: true,
            json: async () => ok(['ts_code', 'name', 'list_date', 'industry', 'market'], [['600519.SH', '贵州茅台', '20010827', '食品饮料', '主板']]),
          }
        case 'balancesheet':
          return {
            ok: true,
            json: async () => ok(
              ['ts_code', 'end_date', 'monetary_cap', 'total_cur_liab', 'total_ncl', 'goodwill', 'oth_receiv', 'notes_receiv', 'total_hldr_eqy_exc_min_int'],
              [['600519.SH', '20260331', 1000000000, 500000000, 300000000, 10000000, 5000000, 1000000, 3000000000]],
            ),
          }
        case 'stk_factor':
          return {
            ok: true,
            json: async () => ok([], []),
          }
        case 'index_dailybasic':
          return {
            ok: true,
            json: async () => ok([], []),
          }
        case 'income':
          return {
            ok: true,
            json: async () => ok([], []),
          }
        case 'cn_cpi':
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
      '600519',
      {
        ...DEFAULT_FORM,
        pePercentile5y: 51.4,
        pePercentile10y: 26.1,
        pbPercentile5y: 56.8,
        pbPercentile10y: 52.3,
        pcfPercentile5y: 33.3,
        pcfPercentile10y: 22.2,
      },
      { forceRefresh: true },
    )

    expect(result.patch.pePercentile5y).toBe(100)
    expect(result.patch.pePercentile10y).toBe(100)
    expect(result.patch.pbPercentile5y).toBe(100)
    expect(result.patch.pbPercentile10y).toBe(100)
    expect(result.patch.peAvg6m).toBe(25)
    expect(result.patch.peAvg1y).toBe(22.5)
    expect(result.patch.peAvg3y).toBe(20)
    expect(result.patch.pbAvg6m).toBe(8)
    expect(result.patch.pbAvg1y).toBe(7.5)
    expect(result.patch.pbAvg3y).toBe(7)
  })

  it('auto-fills optional related-party and guarantee risk ratios when tables are available', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const raw = String(init?.body || '{}')
      const payload = JSON.parse(raw) as { api_name?: string }

      switch (payload.api_name) {
        case 'daily_basic':
          return {
            ok: true,
            json: async () => ok(
              ['ts_code', 'trade_date', 'close', 'pe_ttm', 'pb', 'dv_ttm', 'total_share'],
              [['600000.SH', '20260608', 10, 5, 0.6, 4, 200000]],
            ),
          }
        case 'fina_indicator':
          return {
            ok: true,
            json: async () => ok(
              ['ts_code', 'end_date', 'eps', 'bps', 'ebitda', 'roic', 'debt_to_assets', 'ocf_to_or', 'n_income_attr_p', 'inv_turn', 'ar_turn'],
              [['600000.SH', '20260331', 1, 8, 1000000, 12, 70, 18, 1200000, 4, 6]],
            ),
          }
        case 'cashflow':
          return {
            ok: true,
            json: async () => ok(
              ['ts_code', 'end_date', 'n_cashflow_act', 'n_cashflow_inv_act', 'free_cashflow'],
              [['600000.SH', '20260331', 5000000000, -1000000000, 4000000000]],
            ),
          }
        case 'stock_basic':
          return {
            ok: true,
            json: async () => ok(['ts_code', 'name', 'list_date', 'industry', 'market'], [['600000.SH', '浦发银行', '19991110', '银行', '主板']]),
          }
        case 'balancesheet':
          return {
            ok: true,
            json: async () => ok(
              ['ts_code', 'end_date', 'monetary_cap', 'total_cur_liab', 'total_ncl', 'goodwill', 'oth_receiv', 'notes_receiv', 'total_hldr_eqy_exc_min_int'],
              [['600000.SH', '20260331', 10000000000, 6000000000, 2000000000, 500000000, 300000000, 100000000, 20000000000]],
            ),
          }
        case 'related_trade':
          return {
            ok: true,
            json: async () => ok(
              ['ts_code', 'end_date', 'related_sales', 'revenue'],
              [['600000.SH', '20260331', 3500000000, 10000000000]],
            ),
          }
        case 'guarantee':
          return {
            ok: true,
            json: async () => ok(
              ['ts_code', 'end_date', 'guarantee_amt', 'net_assets'],
              [['600000.SH', '20260331', 6000000000, 20000000000]],
            ),
          }
        case 'stk_factor':
          return {
            ok: true,
            json: async () => ok(['ts_code', 'trade_date', 'beta'], [['600000.SH', '20260608', 1.1]]),
          }
        case 'index_dailybasic':
          return {
            ok: true,
            json: async () => ok(['ts_code', 'trade_date', 'pe_ttm'], [['000300.SH', '20260608', 14]]),
          }
        case 'income':
          return {
            ok: true,
            json: async () => ok(['ts_code', 'end_date', 'n_income_attr_p'], [['600000.SH', '20251231', 1200000000]]),
          }
        case 'cn_cpi':
          return {
            ok: true,
            json: async () => ok(['month', 'nt_yoy', 'nt_val'], [['202601', 1.2, 101.2]]),
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

    const result = await loadFromTushare('', '600000', { ...DEFAULT_FORM }, { forceRefresh: true })

    expect(result.patch.relatedPartySalesToRevenue).toBeCloseTo(35, 6)
    expect(result.patch.externalGuaranteeToEquity).toBeCloseTo(30, 6)
    expect(result.fieldSources.relatedPartySalesToRevenue).toBe('derived')
    expect(result.fieldSources.externalGuaranteeToEquity).toBe('derived')
  })
})
