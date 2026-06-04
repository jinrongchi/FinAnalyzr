import { describe, expect, it } from 'vitest'
import { DEFAULT_FORM } from '../data/defaults'
import type { Snapshot } from '../types'
import { analyze } from './valuation'
import { buildBacktestSeries, computeAssumptionAttribution } from './backtest'

const VALID_FORM = {
  ...DEFAULT_FORM,
  ticker: '600519',
  price: 100,
  fcf0: 300,
  forecastYears: 10,
  fcfGrowth: 6,
  discountRate: 10,
  terminalGrowth: 3,
  sharesOutstanding: 10,
  eps: 10,
  bvps: 50,
  ebitdaPerShare: 15,
  industryPE: 20,
  industryPB: 3,
  industryEVEBITDA: 12,
  dividend0: 2,
  dividendGrowth: 5,
  ddmYears: 5,
  requiredReturn: 9,
  stableGrowth: 3,
  roic: 15,
  deRatio: 0.5,
  fcfConversion: 80,
  governanceScore: 75,
  moatScore: 70,
}

function makeSnapshot(id: string, label: string, formPatch = {}): Snapshot {
  const form = { ...VALID_FORM, ...formPatch }
  return {
    id,
    label,
    createdAt: new Date(Number(id) * 1000).toISOString(),
    form,
    result: analyze(form),
  }
}

describe('backtest module', () => {
  it('builds backtest points from consecutive snapshots', () => {
    const s1 = makeSnapshot('1', 'v1', { price: 100, eps: 10 })
    const s2 = makeSnapshot('2', 'v2', { price: 110, eps: 10.5 })
    const s3 = makeSnapshot('3', 'v3', { price: 120, eps: 11 })

    const series = buildBacktestSeries([s3, s1, s2])
    expect(series).toHaveLength(2)
    expect(series[0].fromLabel).toBe('v1')
    expect(series[0].toLabel).toBe('v2')
    expect(Number.isFinite(series[0].predictedReturn)).toBe(true)
    expect(Number.isFinite(series[0].realizedReturn)).toBe(true)
  })

  it('computes assumption attribution with residual term', () => {
    const base = makeSnapshot('1', 'base', {
      price: 100,
      fcfGrowth: 6,
      discountRate: 10,
      terminalGrowth: 3,
    })
    const target = makeSnapshot('2', 'target', {
      price: 110,
      fcfGrowth: 8,
      discountRate: 9,
      terminalGrowth: 3.5,
    })

    const attribution = computeAssumptionAttribution(base, target, [
      { key: 'fcfGrowth', label: 'FCF增长率' },
      { key: 'discountRate', label: '折现率' },
      { key: 'terminalGrowth', label: '永续增长率' },
    ])

    expect(attribution.items.length).toBe(4)
    expect(attribution.items.at(-1)?.key).toBe('residual')
    expect(Number.isFinite(attribution.totalDelta)).toBe(true)
  })
})
