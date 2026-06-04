import { describe, expect, it } from 'vitest'
import { DEFAULT_FORM } from '../data/defaults'
import { analyze, computeDCF, computeDDM, computeRelative } from './valuation'

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
  ddmYears: 5,
  requiredReturn: 9,
  stableGrowth: 3,
  roic: 24,
  deRatio: 0.4,
  fcfConversion: 95,
  governanceScore: 85,
  moatScore: 90,
}

describe('valuation engine', () => {
  it('computes DCF with valid assumptions', () => {
    const result = computeDCF(VALID_FORM)
    expect(result.valid).toBe(true)
    expect((result.value || 0) > 0).toBe(true)
  })

  it('rejects DCF when discount rate is not above terminal growth', () => {
    const result = computeDCF({ ...VALID_FORM, discountRate: 3, terminalGrowth: 3 })
    expect(result.valid).toBe(false)
  })

  it('returns invalid relative valuation with missing multipliers', () => {
    const result = computeRelative({
      ...VALID_FORM,
      industryPE: 0,
      industryPB: 0,
      industryEVEBITDA: 0,
    })
    expect(result.valid).toBe(false)
  })

  it('returns invalid DDM when k <= g2', () => {
    const result = computeDDM({ ...VALID_FORM, requiredReturn: 3, stableGrowth: 3 })
    expect(result.valid).toBe(false)
  })

  it('analyzes and returns a complete result payload', () => {
    const result = analyze(VALID_FORM)
    expect(result.models.length).toBe(3)
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(Number.isFinite(result.intrinsicValue)).toBe(true)
    expect(Number.isFinite(result.marginSafety)).toBe(true)
  })
})
