import { describe, expect, it } from 'vitest'
import { DEFAULT_FORM } from '../data/defaults'
import { analyze, computeDCF, computeRelative, computeROEPB } from './valuation/index'

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
    expect((result.conformanceChecks || []).length).toBeGreaterThan(0)
  })

  it('hard rejects ST stocks and caps safety score to 0', () => {
    const result = analyze({
      ...VALID_FORM,
      isST: 1,
    })

    expect(result.redFlags?.blocked).toBe(true)
    expect(result.redFlags?.hardReject).toBe(true)
    expect(result.safetyScore).toBe(0)
    expect(result.warnings.some((w) => w.includes('Do Not Invest'))).toBe(true)
  })

  it('applies listing-age confidence penalty for IPOs under 5 years', () => {
    const mature = analyze({
      ...VALID_FORM,
      listedYears: 8,
    })
    const young = analyze({
      ...VALID_FORM,
      listedYears: 2,
    })

    expect(young.confidence).toBeLessThan(mature.confidence)
  })

  it('applies ERP market-cycle adjustment to safety score', () => {
    const neutral = analyze({
      ...VALID_FORM,
      csi300EarningsYield: 2,
      cn10yYield: 2,
      equityBondSpreadMean10y: 0,
      equityBondSpreadStd10y: 1,
    })
    const coldMarket = analyze({
      ...VALID_FORM,
      csi300EarningsYield: 6,
      cn10yYield: 2,
      equityBondSpreadMean10y: 0,
      equityBondSpreadStd10y: 1,
    })

    expect(coldMarket.marketCycleAdjustment).toBe(10)
    expect((coldMarket.safetyScore || 0) - (neutral.safetyScore || 0)).toBeGreaterThanOrEqual(10)
  })

  it('keeps DCF terminal value share under guardrail when needed', () => {
    const result = computeDCF({
      ...VALID_FORM,
      fcfGrowth: 28,
      discountRate: 8,
    })

    expect(result.valid).toBe(true)
    expect(result.assumptions?.includes('TV占比=')).toBe(true)
    const matched = result.assumptions?.match(/TV占比=(\d+(?:\.\d+)?)%/)
    expect(matched).toBeTruthy()
    const ratio = matched ? Number(matched[1]) : 999
    expect(ratio).toBeLessThanOrEqual(70)
  })

  it('raises safety score when valuation margin improves', () => {
    const expensive = analyze({ ...VALID_FORM, price: 2200 })
    const cheap = analyze({ ...VALID_FORM, price: 1200 })
    expect((cheap.safetyScore || 0)).toBeGreaterThan((expensive.safetyScore || 0))
  })

  it('caps DCF phase-1 growth for infra asset-heavy profile', () => {
    const result = computeDCF({
      ...VALID_FORM,
      industryOverride: 4,
      fcfGrowth: 30,
    })

    expect(result.valid).toBe(true)
    expect(result.assumptions?.includes('g1=10.0%')).toBe(true)
  })

  it('uses sustainable ROE proxy in ROE-PB when ROIC is lower', () => {
    const lowRoic = computeROEPB({
      ...VALID_FORM,
      eps: 40,
      bvps: 100,
      roic: 12,
    })
    const highRoic = computeROEPB({
      ...VALID_FORM,
      eps: 40,
      bvps: 100,
      roic: 30,
    })

    expect(lowRoic.valid).toBe(true)
    expect(highRoic.valid).toBe(true)
    expect((lowRoic.value || 0)).toBeLessThan((highRoic.value || 0))
    expect(lowRoic.assumptions?.includes('ROE_s=min(ROE,ROIC)')).toBe(true)
  })

  it('caps safety score for growth-board small-cap with no profit', () => {
    const result = analyze({
      ...VALID_FORM,
      ticker: '300750.SZ',
      price: 12,
      sharesOutstanding: 5,
      eps: -0.2,
    })

    expect((result.safetyScore || 0)).toBeLessThanOrEqual(40)
    expect(result.warnings.some((w) => w.includes('创业板/科创板小市值且未盈利'))).toBe(true)
  })

  it('applies stronger confidence penalty for listings under 1 year', () => {
    const underFiveYears = analyze({
      ...VALID_FORM,
      listedYears: 2,
    })
    const underOneYear = analyze({
      ...VALID_FORM,
      listedYears: 0.5,
    })

    expect(underOneYear.confidence).toBeLessThan(underFiveYears.confidence)
  })

  it('adds policy-sensitive warning when industry is flagged', () => {
    const result = analyze({
      ...VALID_FORM,
      isPolicySensitive: 1,
    })
    expect(result.warnings.some((w) => w.includes('政策敏感行业'))).toBe(true)
  })

  it('uses growth-board flag to apply no-profit small-cap cap', () => {
    const result = analyze({
      ...VALID_FORM,
      ticker: '000001.SZ',
      isGrowthBoard: 1,
      price: 10,
      sharesOutstanding: 6,
      eps: -0.1,
    })
    expect((result.safetyScore || 0)).toBeLessThanOrEqual(40)
  })

  it('does not hard reject low OCF/NI for financial sector', () => {
    const result = analyze({
      ...VALID_FORM,
      isFinancialSector: 1,
      ocfToNi3yAvg: 0.3,
    })

    expect(result.redFlags?.hardReject).toBe(false)
    expect(result.warnings.some((w) => w.includes('金融行业口径'))).toBe(true)
  })

  it('warns financial stocks that PB<0.7 may still be unsafe', () => {
    const result = analyze({
      ...VALID_FORM,
      isFinancialSector: 1,
      price: 60,
      bvps: 100,
    })

    expect(result.warnings.some((w) => w.includes('PB低于0.7'))).toBe(true)
  })

  it('flags high payout ratio with weak cash support', () => {
    const result = analyze({
      ...VALID_FORM,
      eps: 2,
      dividend0: 2,
      fcfConversion: 40,
    })
    expect(result.redFlags?.flags.some((f) => f.includes('分红支付率超过70%且现金流覆盖偏弱'))).toBe(true)
  })

  it('warns when payout ratio exceeds 100%', () => {
    const result = analyze({
      ...VALID_FORM,
      eps: 1,
      dividend0: 1.5,
      fcfConversion: 90,
    })
    expect(result.warnings.some((w) => w.includes('股息支付率超过100%'))).toBe(true)
  })

  it('flags simultaneous >30% increase in AR and inventory turnover days', () => {
    const result = analyze({
      ...VALID_FORM,
      inventoryTurnoverTrend: 45,
      arTurnoverTrend: 38,
    })
    expect(result.redFlags?.flags.some((f) => f.includes('周转天数近3年累计上升超过30%'))).toBe(true)
  })

  it('flags related-party sales ratio above 30% and hard-rejects above 50%', () => {
    const warn = analyze({
      ...VALID_FORM,
      relatedPartySalesToRevenue: 35,
    })
    const block = analyze({
      ...VALID_FORM,
      relatedPartySalesToRevenue: 55,
    })

    expect(warn.redFlags?.flags.some((f) => f.includes('关联方销售占营收超过30%'))).toBe(true)
    expect(block.redFlags?.hardReject).toBe(true)
    expect(block.redFlags?.flags.some((f) => f.includes('关联方销售占营收超过50%'))).toBe(true)
  })

  it('flags external guarantees above 30% and hard-rejects above 50%', () => {
    const warn = analyze({
      ...VALID_FORM,
      externalGuaranteeToEquity: 31,
    })
    const block = analyze({
      ...VALID_FORM,
      externalGuaranteeToEquity: 51,
    })

    expect(warn.redFlags?.flags.some((f) => f.includes('对外担保/净资产超过30%'))).toBe(true)
    expect(block.redFlags?.hardReject).toBe(true)
    expect(block.redFlags?.flags.some((f) => f.includes('对外担保/净资产超过50%'))).toBe(true)
  })
})
