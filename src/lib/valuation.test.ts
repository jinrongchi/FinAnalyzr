import { describe, expect, it } from 'vitest'
import { DEFAULT_FORM } from '../data/defaults'
import { analyze, computeDCF, computeRelative } from './valuation/index'

const VALID_FORM = {
  ...DEFAULT_FORM,
  ticker: '600519',
  price: 1680,
  fcf0: 800,
  forecastYears: 10,
  fcfGrowth: 8,
  discountRate: 10,
  terminalGrowth: 3,
  netDebt: -1500,
  sharesOutstanding: 12.5,
  eps: 55,
  bvps: 180,
  ebitdaPerShare: 90,
  industryPE: 28,
  industryPB: 8,
  industryEVEBITDA: 20,
  dividend0: 31,
  dividendGrowth: 6,
  roic: 24,
  deRatio: 0.4,
  fcfConversion: 95,
  governanceScore: 85,
  moatScore: 90,
  ocfToNi3yAvg: 1,
  goodwillToEquity: 5,
  otherReceivablesToEquity: 5,
  inventoryTurnoverTrend: 2,
  arTurnoverTrend: 1,
  csi300EarningsYield: 0,
  cn10yYield: 0,
  peg: 0,
  cape: 18,
  pcf: 0,
  pePercentile5y: 0,
  pbPercentile5y: 0,
  pcfPercentile5y: 0,
  pePercentile10y: 0,
  pbPercentile10y: 0,
  pcfPercentile10y: 0,
  fcfYield: 4.5,
}

describe('valuation engine', () => {
  it('computes DCF with valid assumptions', () => {
    const result = computeDCF(VALID_FORM)
    expect(result.valid).toBe(true)
    expect((result.value || 0) > 0).toBe(true)
  })

  it('rejects DCF when discount rate is invalid', () => {
    const result = computeDCF({ ...VALID_FORM, discountRate: 0, terminalGrowth: 3 })
    expect(result.valid).toBe(false)
  })

  it('returns invalid relative valuation with missing multipliers', () => {
    const result = computeRelative({
      ...VALID_FORM,
      industryPE: 0,
      industryPB: 0,
      pcf: 0,
      peg: 0,
    })
    expect(result.valid).toBe(false)
  })

  it('analyzes and returns a complete result payload', () => {
    const result = analyze(VALID_FORM)
    expect(result.models.length).toBeGreaterThanOrEqual(4)
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(Number.isFinite(result.intrinsicValue)).toBe(true)
    expect(Number.isFinite(result.marginSafety)).toBe(true)
    expect(result.intrinsicRange?.conservative).toBeTypeOf('number')
  })
})
