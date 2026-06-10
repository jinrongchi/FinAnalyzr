import { DEFAULT_FORM } from '../../data/defaults'
import type { FormState, ModelResult } from '../../types'
import {
  INDUSTRY_OVERRIDE_PROFILE,
  INDUSTRY_PROFILES,
  MODEL_WEIGHTS,
  QUALITY_BANDS,
  type IndustryProfile,
  type ModelKey,
  type ModelWeights,
} from './config'
import { clamp, scoreFromThreshold } from './utils'

function getWeight(weights: ModelWeights, key: ModelKey): number {
  return weights[key] || 0
}

function isUsableModel(model: ModelResult): model is ModelResult & { value: number } {
  return model.valid && Number.isFinite(model.value)
}

function computeMarginSafety(price: number, intrinsicValue: number): number {
  return price > 0 && intrinsicValue > 0 ? (intrinsicValue - price) / price : 0
}

function piecewiseScore(value: number, points: Array<[number, number]>): number {
  if (!Number.isFinite(value) || points.length === 0) return 0
  const sorted = [...points].sort((a, b) => a[0] - b[0])
  if (value <= sorted[0][0]) return sorted[0][1]
  if (value >= sorted[sorted.length - 1][0]) return sorted[sorted.length - 1][1]

  for (let i = 1; i < sorted.length; i += 1) {
    const [x2, y2] = sorted[i]
    const [x1, y1] = sorted[i - 1]
    if (value <= x2) {
      const ratio = (value - x1) / (x2 - x1)
      return y1 + ratio * (y2 - y1)
    }
  }

  return sorted[sorted.length - 1][1]
}

function normalizeDcfMarginScore(marginSafety: number): number {
  return clamp(piecewiseScore(marginSafety, [[-0.1, 20], [0, 50], [0.3, 80], [0.5, 100]]), 0, 100)
}

function normalizePbDiscountScore(input: FormState, roepb: ModelResult): number | undefined {
  if (!(roepb.valid && Number.isFinite(roepb.value) && roepb.value && input.bvps > 0 && input.price > 0)) {
    return undefined
  }
  const fairPb = roepb.value / input.bvps
  const currentPb = input.price / input.bvps
  if (!(fairPb > 0 && currentPb > 0)) return undefined
  const discount = fairPb / currentPb - 1
  return clamp(piecewiseScore(discount, [[-0.2, 20], [0, 50], [0.2, 80], [0.5, 100]]), 0, 100)
}

function normalizePegScore(peg: number): number | undefined {
  if (!(peg > 0)) return undefined
  return clamp(piecewiseScore(peg, [[2, 20], [1, 60], [0.5, 90], [0.2, 100]]), 0, 100)
}

function normalizeDividendScore(input: FormState): number | undefined {
  if (!(input.price > 0 && input.dividend0 > 0)) return undefined
  const dividendYield = input.dividend0 / input.price
  return clamp(piecewiseScore(dividendYield, [[0.01, 20], [0.03, 50], [0.05, 80], [0.07, 100]]), 0, 100)
}

function normalizeFcfYieldScore(input: FormState): number | undefined {
  if (!(input.fcfYield > 0)) return undefined
  const yieldDecimal = input.fcfYield / 100
  return clamp(piecewiseScore(yieldDecimal, [[0, 0], [0.05, 70], [0.08, 100]]), 0, 100)
}

function normalizePercentileScore(percentile: number): number {
  return clamp(100 - clamp(percentile, 0, 100), 0, 100)
}

function averageDefined(values: Array<number | undefined>): number | undefined {
  const defined = values.filter((v): v is number => Number.isFinite(v))
  if (!defined.length) return undefined
  return defined.reduce((sum, value) => sum + value, 0) / defined.length
}

function resolveModelScore(input: FormState, model: ModelResult, roepb: ModelResult): number | undefined {
  if (!(model.valid && Number.isFinite(model.value) && model.value)) return undefined

  const modelMarginScore = normalizeDcfMarginScore(computeMarginSafety(input.price, model.value))
  const pbScore = normalizePbDiscountScore(input, roepb)
  const percentileScore = averageDefined([
    normalizePercentileScore(input.pePercentile10y),
    normalizePercentileScore(input.pbPercentile10y),
    normalizePercentileScore(input.pcfPercentile10y),
  ])
  const pegScore = normalizePegScore(input.peg)
  const dividendScore = normalizeDividendScore(input)
  const fcfYieldScore = normalizeFcfYieldScore(input)

  switch (model.key) {
    case 'DCF':
      return normalizeDcfMarginScore(computeMarginSafety(input.price, model.value))
    case 'ROEPB':
      return pbScore ?? modelMarginScore
    case 'REL':
      return averageDefined([modelMarginScore, percentileScore, pegScore]) ?? modelMarginScore
    case 'GRH':
      return averageDefined([modelMarginScore, dividendScore]) ?? modelMarginScore
    case 'CAPE':
      return percentileScore ?? modelMarginScore
    case 'FCFEV':
      return fcfYieldScore ?? modelMarginScore
    case 'SOTP':
      return modelMarginScore
    default:
      return modelMarginScore
  }
}

function detectIndustryProfile(input: FormState): IndustryProfile {
  const override = INDUSTRY_OVERRIDE_PROFILE[input.industryOverride]
  if (override) return INDUSTRY_PROFILES[override]

  const dividendYield = input.price > 0 ? input.dividend0 / input.price : 0
  if (input.deRatio >= 4 || dividendYield >= 0.045) {
    return INDUSTRY_PROFILES.financialRealEstate
  }
  if (input.roic >= 14 && input.fcfGrowth >= 6) {
    return INDUSTRY_PROFILES.consumerHealthcare
  }
  if (input.fcf0 <= 0 || input.fcfGrowth <= 0) {
    return INDUSTRY_PROFILES.cyclical
  }
  if (dividendYield >= 0.03 && input.fcf0 > 0 && input.fcfGrowth < 6) {
    return INDUSTRY_PROFILES.infraAssetHeavy
  }
  return INDUSTRY_PROFILES.technologyPlatform
}

export function computeQuality(input: FormState): number {
  const roicScore = scoreFromThreshold(input.roic, QUALITY_BANDS.roic)
  const deScore = scoreFromThreshold(-input.deRatio, QUALITY_BANDS.de)
  const fcfScore = scoreFromThreshold(input.fcfConversion, QUALITY_BANDS.fcf)
  return Math.round(
    roicScore * 0.25
      + deScore * 0.2
      + fcfScore * 0.2
      + clamp(input.governanceScore, 0, 100) * 0.15
      + clamp(input.moatScore, 0, 100) * 0.2,
  )
}

function normalizeInput(raw: FormState): FormState {
  const merged = { ...DEFAULT_FORM, ...raw } as FormState
  const out = { ...merged } as FormState
  const keys = Object.keys(DEFAULT_FORM) as Array<keyof FormState>

  for (const key of keys) {
    if (key === 'ticker') {
      out.ticker = String((merged.ticker || '').trim())
      continue
    }
    const value = Number((merged as Record<string, unknown>)[key as string])
    ;(out as Record<string, unknown>)[key as string] = Number.isFinite(value)
      ? value
      : (DEFAULT_FORM as Record<string, unknown>)[key as string]
  }

  return out
}

function computeCompositeNormalizedScore(
  input: FormState,
  models: ModelResult[],
  weights: ModelWeights,
  roepb: ModelResult,
): number | undefined {
  let weightedScore = 0
  let usedWeight = 0

  for (const model of models) {
    const score = resolveModelScore(input, model, roepb)
    const weight = getWeight(weights, model.key)
    if (!(Number.isFinite(score) && Number.isFinite(weight) && weight > 0)) continue
    weightedScore += (score as number) * weight
    usedWeight += weight
  }

  if (usedWeight <= 0) return undefined
  return weightedScore / usedWeight
}

function aggregate(
  models: ModelResult[],
  qualityScore: number,
  customWeights: ModelWeights | undefined,
): { value: number; confidence: number; modelsWithContribution: ModelResult[] } {
  const valid = models.filter(isUsableModel)
  if (!valid.length) return { value: 0, confidence: 0, modelsWithContribution: models }

  const weights = customWeights || MODEL_WEIGHTS
  const usedWeight = valid.reduce((sum, m) => sum + getWeight(weights, m.key), 0)
  if (usedWeight <= 0) return { value: 0, confidence: 0, modelsWithContribution: models }

  const value = valid.reduce((sum, m) => {
    const w = getWeight(weights, m.key) / usedWeight
    return sum + m.value * w
  }, 0)

  const modelsWithContribution: ModelResult[] = models.map((m) => {
    if (!isUsableModel(m)) return m
    const effectiveWeight = getWeight(weights, m.key) / usedWeight
    return { ...m, weight: effectiveWeight, contribution: m.value * effectiveWeight }
  })

  const modelConf = valid.reduce((sum, m) => sum + (m.confidence || 0), 0) / valid.length
  const confidence = clamp(modelConf * (0.7 + (qualityScore / 100) * 0.3), 0.1, 0.98)
  return { value, confidence, modelsWithContribution }
}

export {
  aggregate,
  computeCompositeNormalizedScore,
  detectIndustryProfile,
  normalizeInput,
}
