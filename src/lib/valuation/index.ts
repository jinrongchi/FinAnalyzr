import type { AnalysisResult, FormState, ModelResult } from '../../types'
import {
  buildModelResults,
  computeDCF,
  computeGraham,
  computeROEPB,
  computeRelative,
  runSensitivity,
} from './models'
import {
  aggregate,
  computeCompositeNormalizedScore,
  computeQuality,
  detectIndustryProfile,
  normalizeInput,
} from './scoring'
import { clamp } from './utils'
import { formatPct, formatYuan, grade } from './presentation'
import { computeDataCoverage } from './dataCoverage'
import {
  buildConformanceChecks,
  collectWarnings,
  computeConfidenceAdjusted,
  computeRedFlags,
} from './riskSignals'

function modelValue(model: ModelResult): number {
  return Number.isFinite(model.value) ? (model.value as number) : 0
}

function computeMarginSafety(price: number, intrinsicValue: number): number {
  return price > 0 && intrinsicValue > 0 ? (intrinsicValue - price) / price : 0
}

function isGrowthBoardTicker(ticker: string): boolean {
  const normalized = ticker.trim().toUpperCase()
  return normalized.startsWith('300') || normalized.startsWith('688')
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

function buildValuationAverages(input: FormState): AnalysisResult['valuationAverages'] {
  return [
    {
      metric: 'PE',
      avg6m: clamp(input.peAvg6m, 0, Number.POSITIVE_INFINITY),
      avg1y: clamp(input.peAvg1y, 0, Number.POSITIVE_INFINITY),
      avg3y: clamp(input.peAvg3y, 0, Number.POSITIVE_INFINITY),
    },
    {
      metric: 'PB',
      avg6m: clamp(input.pbAvg6m, 0, Number.POSITIVE_INFINITY),
      avg1y: clamp(input.pbAvg1y, 0, Number.POSITIVE_INFINITY),
      avg3y: clamp(input.pbAvg3y, 0, Number.POSITIVE_INFINITY),
    },
    {
      metric: 'PCF',
      avg6m: clamp(input.pcfAvg6m, 0, Number.POSITIVE_INFINITY),
      avg1y: clamp(input.pcfAvg1y, 0, Number.POSITIVE_INFINITY),
      avg3y: clamp(input.pcfAvg3y, 0, Number.POSITIVE_INFINITY),
    },
  ]
}

function buildThermometer(input: FormState): NonNullable<AnalysisResult['thermometer']> {
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

function computeMarketCycleAdjustment(
  thermometer: NonNullable<AnalysisResult['thermometer']>,
): number {
  if (thermometer.zScore >= 2 || thermometer.spread >= 3) return 10
  if (thermometer.zScore <= -2 || thermometer.spread <= 1.5) return -10
  return 0
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
    input,
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
  const valuationAverages = buildValuationAverages(input)
  const thermometer = buildThermometer(input)
  const marketCycleAdjustment = computeMarketCycleAdjustment(thermometer)
  const marketCapYi = input.price > 0 && input.sharesOutstanding > 0 ? input.price * input.sharesOutstanding : 0
  const isGrowthBoard = input.isGrowthBoard > 0 || isGrowthBoardTicker(input.ticker)
  const growthBoardHighRisk = isGrowthBoard && marketCapYi > 0 && marketCapYi < 100 && input.eps <= 0
  const conformanceChecks = buildConformanceChecks({ input, redFlags, growthBoardHighRisk, marketCycleAdjustment })

  const compositeNormalizedScore = computeCompositeNormalizedScore(input, base.modelsWithContribution, industryProfile.weights, roepb)
  const baseSafetyScore = Math.round(
    clamp(
      compositeNormalizedScore ?? computeSafetyScore(conservativeMarginSafety),
      0,
      100,
    ),
  )
  const adjustedSafetyScore = clamp(baseSafetyScore + marketCycleAdjustment, 0, 100)
  const safetyScore = redFlags.blocked
    ? 0
    : input.isST > 0
      ? Math.min(30, adjustedSafetyScore)
      : growthBoardHighRisk
        ? Math.min(40, adjustedSafetyScore)
        : adjustedSafetyScore
  const confidenceAdjusted = computeConfidenceAdjusted(base.confidence, input, redFlags)

  if (!redFlags.blocked && marketCycleAdjustment !== 0) {
    warnings.push(
      marketCycleAdjustment > 0
        ? '市场温度偏冷：已按股债利差规则上调综合分数 +10。'
        : '市场温度偏热：已按股债利差规则下调综合分数 -10。',
    )
  }
  if (!redFlags.blocked && growthBoardHighRisk) {
    warnings.push('创业板/科创板小市值且未盈利：已限制安全评分上限并降低估值可信度。')
  }

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
    valuationAverages,
    thermometer,
    marketCycleAdjustment,
    dataCoverage,
    conformanceChecks,
  }
}

export { clamp, computeDCF, computeGraham, computeROEPB, computeRelative, formatPct, formatYuan, grade, runSensitivity }
