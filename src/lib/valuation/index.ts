import type { AnalysisResult, FormState, ModelResult } from '../../types'
import { DEFAULT_FORM } from '../../data/defaults'
import {
  DATA_COVERAGE_CHECKS,
  INDUSTRY_OVERRIDE_PROFILE,
  INDUSTRY_PROFILES,
  MODEL_WEIGHTS,
  QUALITY_BANDS,
  type IndustryProfile,
  type ModelKey,
  type ModelWeights,
} from './config'
import {
  buildModelResults,
  computeDCF,
  computeGraham,
  computeROEPB,
  computeRelative,
  runSensitivity,
} from './models'
import { clamp, scoreFromThreshold } from './utils'
import { formatPct, formatYuan, grade } from './presentation'

function getWeight(weights: ModelWeights, key: ModelKey): number {
  return weights[key] || 0
}

function isUsableModel(model: ModelResult): model is ModelResult & { value: number } {
  return model.valid && Number.isFinite(model.value)
}

function modelValue(model: ModelResult): number {
  return Number.isFinite(model.value) ? (model.value as number) : 0
}

function computeMarginSafety(price: number, intrinsicValue: number): number {
  return price > 0 && intrinsicValue > 0 ? (intrinsicValue - price) / price : 0
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

function computeRedFlags(input: FormState): {
  blocked: boolean
  scorePenalty: number
  flags: string[]
} {
  const flags: string[] = []
  if (input.ocfToNi3yAvg > 0 && input.ocfToNi3yAvg < 0.7) {
    flags.push('经营性现金流/净利润连续3年低于0.7')
  }
  if (input.goodwillToEquity > 30) {
    flags.push('商誉/净资产超过30%')
  }
  if (input.otherReceivablesToEquity > 20) {
    flags.push('其他应收款/净资产超过20%')
  }
  if (input.inventoryTurnoverTrend < -10 && input.arTurnoverTrend < -10) {
    flags.push('存货与应收账款周转率持续恶化')
  }

  const blocked = flags.length > 0
  const scorePenalty = blocked ? Math.min(35, flags.length * 12) : 0
  return { blocked, scorePenalty, flags }
}

function computeDataCoverage(input: FormState): {
  score: number
  level: 'high' | 'medium' | 'low'
  missingCoreFields: string[]
} {
  const missingCoreFields = DATA_COVERAGE_CHECKS
    .filter((c) => Number(input[c.key]) <= 0)
    .map((c) => c.label)
  const score = Math.round(((DATA_COVERAGE_CHECKS.length - missingCoreFields.length) / DATA_COVERAGE_CHECKS.length) * 100)
  const level = score >= 80 ? 'high' as const : score >= 55 ? 'medium' as const : 'low' as const
  return { score, level, missingCoreFields }
}

function computeValuationRange(
  dcf: ModelResult,
  roepb: ModelResult,
  rel: ModelResult,
  baseValue: number,
): { rangeBear: number; rangeBull: number; conservativeValue: number } {
  const rangeCandidates = [
    dcf.range?.bear,
    modelValue(roepb) > 0 ? modelValue(roepb) * 0.85 : undefined,
    modelValue(rel) > 0 ? modelValue(rel) * 0.88 : undefined,
  ].filter((v): v is number => Number.isFinite(v))
  const rangeBear = rangeCandidates.length ? Math.min(...rangeCandidates) : baseValue

  const rangeBullCandidates = [
    dcf.range?.bull,
    modelValue(roepb) > 0 ? modelValue(roepb) * 1.15 : undefined,
    modelValue(rel) > 0 ? modelValue(rel) * 1.12 : undefined,
  ].filter((v): v is number => Number.isFinite(v))
  const rangeBull = rangeBullCandidates.length ? Math.max(...rangeBullCandidates) : baseValue

  return {
    rangeBear,
    rangeBull,
    conservativeValue: Math.min(rangeBear, baseValue),
  }
}

function collectWarnings(args: {
  dcf: ModelResult
  roepb: ModelResult
  rel: ModelResult
  grh: ModelResult
  cape: ModelResult
  fcfev: ModelResult
  sotp: ModelResult
  qualityScore: number
  confidence: number
  industryName: string
  dataCoverage: ReturnType<typeof computeDataCoverage>
  redFlags: ReturnType<typeof computeRedFlags>
}): string[] {
  function appendModelWarning(label: string, model: ModelResult, enabled = true): void {
    if (enabled && !model.valid) {
      warnings.push(`${label} 未采用：${model.reason}`)
    }
  }

  const warnings: string[] = []
  const { dcf, roepb, rel, grh, cape, fcfev, sotp, qualityScore, confidence, industryName, dataCoverage, redFlags } = args

  appendModelWarning('DCF', dcf)
  appendModelWarning('ROE-PB', roepb)
  appendModelWarning('相对估值', rel)
  appendModelWarning('Graham 公式', grh)
  appendModelWarning('CAPE', cape, industryName === '强周期')
  appendModelWarning('FCF/EV', fcfev, industryName === '重资产基建')
  appendModelWarning('SOTP', sotp, industryName === '科技/平台')
  if (qualityScore < 60) warnings.push('质量评分偏低：建议提高安全边际阈值。')
  if (confidence < 0.6) warnings.push('置信度偏低：建议补充数据后再评估。')
  if (dataCoverage.level === 'low') {
    warnings.push(`数据充分度偏低（${dataCoverage.score}%）：${dataCoverage.missingCoreFields.slice(0, 4).join('、')} 等关键字段缺失。`)
  }
  if (redFlags.blocked) {
    warnings.push('触发硬性财务红旗：不建议长期持有。')
    for (const flag of redFlags.flags) {
      warnings.push(`红旗：${flag}`)
    }
  }
  if (!warnings.length) warnings.push('无明显模型警告，但仍需结合行业与治理实地研究。')

  return warnings
}

function buildPercentileCloud(input: FormState): AnalysisResult['percentileCloud'] {
  return [
    {
      metric: 'PE',
      percentile5y: clamp(input.pePercentile5y, 0, 100),
      percentile10y: clamp(input.pePercentile10y, 0, 100),
    },
    {
      metric: 'PB',
      percentile5y: clamp(input.pbPercentile5y, 0, 100),
      percentile10y: clamp(input.pbPercentile10y, 0, 100),
    },
    {
      metric: 'PCF',
      percentile5y: clamp(input.pcfPercentile5y, 0, 100),
      percentile10y: clamp(input.pcfPercentile10y, 0, 100),
    },
  ]
}

function buildThermometer(input: FormState): AnalysisResult['thermometer'] {
  const spread = input.csi300EarningsYield > 0
    ? input.csi300EarningsYield - input.cn10yYield
    : 0
  const spreadMean = input.equityBondSpreadMean10y
  const spreadStd = input.equityBondSpreadStd10y > 0 ? input.equityBondSpreadStd10y : 1
  const zScore = (spread - spreadMean) / spreadStd
  return {
    spread,
    zScore,
    status: zScore >= 2 || spread >= 3 ? 'cold' : zScore < 0 ? 'hot' : 'neutral',
  }
}

function computeCompanyEVEBITDA(input: FormState): number | undefined {
  if (!(input.ebitdaPerShare > 0 && input.sharesOutstanding > 0 && input.price > 0)) return undefined

  const ebitdaTotal = input.ebitdaPerShare * input.sharesOutstanding // 亿元
  const enterpriseValue = input.price * input.sharesOutstanding + input.netDebt // 亿元
  return ebitdaTotal > 0 ? enterpriseValue / ebitdaTotal : undefined
}

function buildLongTermReturn(input: FormState, intrinsicValue: number): NonNullable<AnalysisResult['longTermReturn']> {
  const dividendYield = input.price > 0 ? input.dividend0 / input.price : 0
  const sustainableGrowth = input.bvps > 0
    ? clamp((input.eps / input.bvps) * (1 - Math.min(1, input.dividend0 / Math.max(input.eps, 0.0001))), -0.05, 0.15)
    : clamp(input.fcfGrowth / 100, -0.05, 0.15)
  const rerating10y = input.price > 0 && intrinsicValue > 0 ? (Math.pow(intrinsicValue / input.price, 1 / 10) - 1) : 0

  return {
    annualDividend: dividendYield,
    annualGrowth: sustainableGrowth,
    annualValuationChange: rerating10y,
    annualTotal: dividendYield + sustainableGrowth + rerating10y,
    horizonYears: 10,
  }
}

function computeSafetyScore(conservativeMarginSafety: number): number {
  return Math.round(clamp(50 + conservativeMarginSafety * 120, 0, 100))
}

function computeConfidenceAdjusted(
  confidence: number,
  redFlags: ReturnType<typeof computeRedFlags>,
): number {
  return clamp(
    confidence * (redFlags.blocked ? 0.55 : 1) * (1 - redFlags.scorePenalty / 200),
    0.05,
    0.98,
  )
}

export function aggregate(
  models: ModelResult[],
  qualityScore: number,
  customWeights?: ModelWeights,
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

  // Annotate each model with its effective weight and contribution
  const modelsWithContribution: ModelResult[] = models.map((m) => {
    if (!isUsableModel(m)) return m
    const effectiveWeight = getWeight(weights, m.key) / usedWeight
    return {
      ...m,
      weight: effectiveWeight,
      contribution: m.value * effectiveWeight,
    }
  })

  const modelConf = valid.reduce((sum, m) => sum + (m.confidence || 0), 0) / valid.length
  const confidence = clamp(modelConf * (0.7 + (qualityScore / 100) * 0.3), 0.1, 0.98)
  return { value, confidence, modelsWithContribution }
}

export function analyze(input: FormState): AnalysisResult {
  input = normalizeInput(input)
  const dataCoverage = computeDataCoverage(input)
  const industryProfile = detectIndustryProfile(input)
  const { dcf, roepb, rel, grh, cape, fcfev, sotp, all } = buildModelResults(input)
  const qualityScore = computeQuality(input)
  const redFlags = computeRedFlags(input)
  const base = aggregate(all, qualityScore, industryProfile.weights)

  const { rangeBear, rangeBull, conservativeValue } = computeValuationRange(dcf, roepb, rel, base.value)

  const marginSafety = computeMarginSafety(input.price, base.value)
  const conservativeMarginSafety = computeMarginSafety(input.price, conservativeValue)
  const warnings = collectWarnings({
    dcf,
    roepb,
    rel,
    grh,
    cape,
    fcfev,
    sotp,
    qualityScore,
    confidence: base.confidence,
    industryName: industryProfile.name,
    dataCoverage,
    redFlags,
  })

  const companyEVEBITDA = computeCompanyEVEBITDA(input)
  const longTermReturn = buildLongTermReturn(input, base.value)

  const percentileCloud = buildPercentileCloud(input)
  const thermometer = buildThermometer(input)

  const safetyScore = computeSafetyScore(conservativeMarginSafety)
  const confidenceAdjusted = computeConfidenceAdjusted(base.confidence, redFlags)

  return {
    intrinsicValue: base.value,
    intrinsicRange: {
      bear: rangeBear,
      base: base.value,
      bull: rangeBull,
      conservative: conservativeValue,
    },
    marginSafety,
    conservativeMarginSafety,
    confidence: confidenceAdjusted,
    qualityScore,
    safetyScore,
    models: base.modelsWithContribution,
    sensitivity: runSensitivity(input, dcf),
    warnings,
    companyEVEBITDA,
    industryProfile: industryProfile.name,
    redFlags,
    longTermReturn,
    percentileCloud,
    thermometer,
    dataCoverage,
  }
}

export { clamp, computeDCF, computeGraham, computeROEPB, computeRelative, formatPct, formatYuan, grade, runSensitivity }
