import type { AnalysisResult, FormState, ModelResult } from '../types'
import { DEFAULT_FORM } from '../data/defaults'

const MODEL_WEIGHTS: Record<string, number> = {
  DCF: 0.3,
  ROEPB: 0.24,
  REL: 0.22,
  GRH: 0.09,
  CAPE: 0.05,
  FCFEV: 0.05,
  SOTP: 0.05,
}

type IndustryProfile = {
  name: string
  weights: Record<string, number>
}

const INDUSTRY_PROFILES: Record<string, IndustryProfile> = {
  financialRealEstate: {
    name: '金融/地产',
    weights: { DCF: 0.12, ROEPB: 0.42, REL: 0.26, GRH: 0.12, FCFEV: 0.08 },
  },
  consumerHealthcare: {
    name: '消费/医药',
    weights: { DCF: 0.38, ROEPB: 0.24, REL: 0.2, GRH: 0.1, FCFEV: 0.08 },
  },
  cyclical: {
    name: '强周期',
    weights: { DCF: 0.16, ROEPB: 0.14, REL: 0.22, CAPE: 0.24, GRH: 0.12, FCFEV: 0.12 },
  },
  infraAssetHeavy: {
    name: '重资产基建',
    weights: { DCF: 0.24, ROEPB: 0.16, REL: 0.2, FCFEV: 0.26, GRH: 0.14 },
  },
  technologyPlatform: {
    name: '科技/平台',
    weights: { DCF: 0.24, ROEPB: 0.2, REL: 0.18, SOTP: 0.24, GRH: 0.06, CAPE: 0.08 },
  },
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

function average(values: number[]): number {
  const valid = values.filter((v) => Number.isFinite(v) && v > 0)
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : 0
}

function scoreFromThreshold(value: number, bands: Array<[number, number]>): number {
  for (const [limit, score] of bands) {
    if (value >= limit) return score
  }
  return 20
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
  if (input.industryOverride === 1) return INDUSTRY_PROFILES.financialRealEstate
  if (input.industryOverride === 2) return INDUSTRY_PROFILES.consumerHealthcare
  if (input.industryOverride === 3) return INDUSTRY_PROFILES.cyclical
  if (input.industryOverride === 4) return INDUSTRY_PROFILES.infraAssetHeavy
  if (input.industryOverride === 5) return INDUSTRY_PROFILES.technologyPlatform

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

function dcfValueWithParams(
  input: FormState,
  discountRate: number,
  growthPhase1: number,
  growthPhase2: number,
  terminalMultiple: number,
): number {
  const r = discountRate / 100
  if (r <= 0 || input.sharesOutstanding <= 0) return 0

  let fcf = input.fcf0
  let pv = 0
  const years = Math.max(10, input.forecastYears)
  const phaseSplit = Math.min(5, years)

  for (let year = 1; year <= years; year += 1) {
    const growth = year <= phaseSplit ? growthPhase1 / 100 : growthPhase2 / 100
    fcf *= 1 + growth
    pv += fcf / (1 + r) ** year
  }

  const terminalValue = Math.max(0, fcf) * terminalMultiple
  const terminalPv = terminalValue / (1 + r) ** years
  const equity = pv + terminalPv - input.netDebt
  return equity / input.sharesOutstanding
}

export function computeDCF(input: FormState): ModelResult {
  if (input.discountRate <= 0) {
    return { key: 'DCF', name: 'DCF', valid: false, reason: '折现率或永续增长率未设置，请加载数据或手工填写' }
  }
  if (input.sharesOutstanding <= 0) {
    return { key: 'DCF', name: 'DCF', valid: false, reason: '总股本未填写' }
  }

  if (input.fcf0 <= 0 && input.fcfGrowth <= 0) {
    return { key: 'DCF', name: 'DCF', valid: false, reason: 'FCF 为负且增长率非正，无法在预测期内转正' }
  }

  const baseG1 = input.fcfGrowth
  const baseG2 = input.fcfGrowth * 0.55

  const bear = dcfValueWithParams(input, input.discountRate + 1.2, baseG1 - 3, baseG2 - 2, 15)
  const base = dcfValueWithParams(input, input.discountRate, baseG1, baseG2, 18)
  const bull = dcfValueWithParams(input, Math.max(1, input.discountRate - 1), baseG1 + 2, baseG2 + 1, 20)

  if (base <= 0) {
    return { key: 'DCF', name: 'DCF', valid: false, reason: '估值结果无效，请检查FCF与折现参数' }
  }

  return {
    key: 'DCF',
    name: 'DCF',
    valid: true,
    value: base,
    confidence: input.fcf0 < 0 ? 0.65 : 0.85,
    weight: MODEL_WEIGHTS.DCF,
    range: { bear, base, bull },
    assumptions: `10年分段DCF, r=${input.discountRate.toFixed(1)}%, g1=${baseG1.toFixed(1)}%, g2=${baseG2.toFixed(1)}%, 终值倍数18x`,
  }
}

export function computeROEPB(input: FormState): ModelResult {
  const roe = input.bvps > 0 ? input.eps / input.bvps : 0
  const r = input.discountRate / 100
  const g = Math.max(0, input.terminalGrowth / 100)

  if (input.bvps <= 0 || r <= g || roe <= 0) {
    return { key: 'ROEPB', name: 'ROE-PB', valid: false, reason: 'ROE-PB 所需参数不足（需EPS、BVPS且 r > g）' }
  }

  const fairPb = (roe - g) / (r - g)
  if (!Number.isFinite(fairPb) || fairPb <= 0) {
    return { key: 'ROEPB', name: 'ROE-PB', valid: false, reason: '合理PB计算结果无效' }
  }

  const value = fairPb * input.bvps
  const stabilityBoost = clamp((roe * 100 - 8) / 12, 0, 1)
  return {
    key: 'ROEPB',
    name: 'ROE-PB',
    valid: true,
    value,
    confidence: clamp(0.55 + stabilityBoost * 0.3, 0.55, 0.9),
    weight: MODEL_WEIGHTS.ROEPB,
    assumptions: `PB*=(${(roe * 100).toFixed(1)}%-${(g * 100).toFixed(1)}%)/(${(r * 100).toFixed(1)}%-${(g * 100).toFixed(1)}%)=${fairPb.toFixed(2)}x`,
  }
}

export function computeRelative(input: FormState): ModelResult {
  const peValue = input.eps > 0 && input.industryPE > 0 ? input.eps * input.industryPE : 0
  const pbValue = input.bvps > 0 && input.industryPB > 0 ? input.bvps * input.industryPB : 0
  const pcfValue = input.pcf > 0 && input.eps > 0 ? input.eps * input.pcf : 0
  const pegValue = input.price > 0 && input.peg > 0 ? input.price / input.peg : 0

  const value = average([peValue, pbValue, pcfValue, pegValue])
  if (value <= 0) {
    return { key: 'REL', name: '相对估值', valid: false, reason: '关键分项缺失，无法形成有效相对估值' }
  }

  const active = [peValue, pbValue, pcfValue, pegValue].filter((v) => v > 0).length
  return {
    key: 'REL',
    name: '相对估值',
    valid: true,
    value,
    confidence: clamp(0.55 + active * 0.12, 0.55, 0.9),
    weight: MODEL_WEIGHTS.REL,
    assumptions: `PE=${input.industryPE.toFixed(1)}, PB=${input.industryPB.toFixed(2)}, PCF=${input.pcf > 0 ? input.pcf.toFixed(1) : 'N/A'}, PEG=${input.peg > 0 ? input.peg.toFixed(2) : 'N/A'}`,
  }
}

function computeCAPE(input: FormState): ModelResult {
  const cape = Number.isFinite(input.cape) ? input.cape : 0
  const eps = Number.isFinite(input.eps) ? input.eps : 0
  if (cape <= 0 || eps <= 0) {
    return { key: 'CAPE', name: 'CAPE', valid: false, reason: '缺少CAPE或EPS，无法计算' }
  }
  return {
    key: 'CAPE',
    name: 'CAPE',
    valid: true,
    value: eps * cape,
    confidence: 0.58,
    weight: MODEL_WEIGHTS.CAPE,
    assumptions: `CAPE=${cape.toFixed(1)}x`,
  }
}

function computeFCFEV(input: FormState): ModelResult {
  if (input.fcfYield <= 0 || input.fcf0 <= 0 || input.sharesOutstanding <= 0) {
    return { key: 'FCFEV', name: 'FCF/EV', valid: false, reason: '缺少 FCF/EV 关键参数' }
  }
  const equityValue = (input.fcf0 / (input.fcfYield / 100) - input.netDebt) / input.sharesOutstanding
  if (!Number.isFinite(equityValue) || equityValue <= 0) {
    return { key: 'FCFEV', name: 'FCF/EV', valid: false, reason: 'FCF/EV 推导估值无效' }
  }
  return {
    key: 'FCFEV',
    name: 'FCF/EV',
    valid: true,
    value: equityValue,
    confidence: 0.6,
    weight: MODEL_WEIGHTS.FCFEV,
    assumptions: `FCFY=${input.fcfYield.toFixed(1)}%`,
  }
}

function computeSOTP(input: FormState): ModelResult {
  const autoSotp = (() => {
    if (input.eps <= 0 && input.ebitdaPerShare <= 0) return 0
    const platformCore = input.eps > 0 ? input.eps * Math.max(input.industryPE, 18) * 0.65 : 0
    const infraPart = input.ebitdaPerShare > 0 ? input.ebitdaPerShare * Math.max(input.industryEVEBITDA, 10) * 0.35 : 0
    return platformCore + infraPart
  })()

  const segmentManual =
    input.sotpSegmentCorePerShare
    + input.sotpSegmentGrowthPerShare
    + input.sotpSegmentInvestmentPerShare
    + input.sotpSegmentNetCashPerShare
  const manual = segmentManual > 0 ? segmentManual : input.sotpPerShare > 0 ? input.sotpPerShare : 0
  const rndAdj = input.rndCapitalizationAdjPerShare
  const value = Math.max(0, (manual || autoSotp) + rndAdj)

  if (value <= 0) {
    return {
      key: 'SOTP',
      name: 'SOTP',
      valid: false,
      reason: '缺少分部估值基础数据（可填写SOTP每股估值）',
    }
  }

  return {
    key: 'SOTP',
    name: 'SOTP',
    valid: true,
    value,
    confidence: manual > 0 ? 0.72 : 0.58,
    weight: MODEL_WEIGHTS.SOTP,
    assumptions: manual > 0
      ? `手工SOTP=${manual.toFixed(2)}元/股${segmentManual > 0 ? '（分部汇总）' : ''}, 研发资本化调整=${rndAdj.toFixed(2)}元/股`
      : `自动SOTP=${autoSotp.toFixed(2)}元/股, 研发资本化调整=${rndAdj.toFixed(2)}元/股`,
  }
}

export function computeGraham(input: FormState): ModelResult {
  if (input.eps <= 0) {
    return { key: 'GRH', name: 'Graham 公式', valid: false, reason: 'EPS 为零，无法计算' }
  }
  const growth = input.dividendGrowth !== 0 ? input.dividendGrowth : input.fcfGrowth
  const value = input.eps * (8.5 + 2 * growth)
  if (!Number.isFinite(value) || value <= 0) {
    return { key: 'GRH', name: 'Graham 公式', valid: false, reason: '增长参数异常，无法计算' }
  }
  return {
    key: 'GRH',
    name: 'Graham 公式',
    valid: true,
    value,
    confidence: 0.55,
    weight: MODEL_WEIGHTS.GRH,
    assumptions: `内在价值=EPS×(8.5+2g), EPS=${input.eps.toFixed(2)}, g=${growth.toFixed(1)}%`,
  }
}

export function computeQuality(input: FormState): number {
  const roicScore = scoreFromThreshold(input.roic, [[25, 98], [20, 90], [15, 78], [10, 62], [5, 45]])
  const deScore = scoreFromThreshold(-input.deRatio, [[-0.2, 95], [-0.5, 82], [-1.0, 65], [-1.5, 45]])
  const fcfScore = scoreFromThreshold(input.fcfConversion, [[95, 95], [85, 85], [70, 70], [50, 55]])
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
  const checks: Array<{ key: keyof FormState; label: string }> = [
    { key: 'price', label: '价格' },
    { key: 'fcf0', label: 'FCF' },
    { key: 'discountRate', label: '折现率' },
    { key: 'sharesOutstanding', label: '总股本' },
    { key: 'eps', label: 'EPS' },
    { key: 'bvps', label: 'BVPS' },
    { key: 'industryPE', label: '行业PE' },
    { key: 'industryPB', label: '行业PB' },
    { key: 'pcf', label: 'PCF' },
    { key: 'peg', label: 'PEG' },
    { key: 'dividend0', label: '股息D0' },
    { key: 'csi300EarningsYield', label: '股债利差E/P' },
    { key: 'pePercentile5y', label: 'PE分位(5Y)' },
    { key: 'pbPercentile5y', label: 'PB分位(5Y)' },
    { key: 'pcfPercentile5y', label: 'PCF分位(5Y)' },
    { key: 'pePercentile10y', label: 'PE分位' },
    { key: 'pbPercentile10y', label: 'PB分位' },
    { key: 'pcfPercentile10y', label: 'PCF分位' },
  ]

  const missingCoreFields = checks
    .filter((c) => Number(input[c.key]) <= 0)
    .map((c) => c.label)
  const score = Math.round(((checks.length - missingCoreFields.length) / checks.length) * 100)
  const level = score >= 80 ? 'high' as const : score >= 55 ? 'medium' as const : 'low' as const
  return { score, level, missingCoreFields }
}

export function aggregate(
  models: ModelResult[],
  qualityScore: number,
  customWeights?: Record<string, number>,
): { value: number; confidence: number; modelsWithContribution: ModelResult[] } {
  const valid = models.filter((m) => m.valid && Number.isFinite(m.value))
  if (!valid.length) return { value: 0, confidence: 0, modelsWithContribution: models }

  const weights = customWeights || MODEL_WEIGHTS
  const usedWeight = valid.reduce((sum, m) => sum + (weights[m.key] || 0), 0)
  if (usedWeight <= 0) return { value: 0, confidence: 0, modelsWithContribution: models }

  const value = valid.reduce((sum, m) => {
    const w = (weights[m.key] || 0) / usedWeight
    return sum + (m.value || 0) * w
  }, 0)

  // Annotate each model with its effective weight and contribution
  const modelsWithContribution: ModelResult[] = models.map((m) => {
    if (!m.valid || !Number.isFinite(m.value)) return m
    const effectiveWeight = (weights[m.key] || 0) / usedWeight
    return {
      ...m,
      weight: effectiveWeight,
      contribution: (m.value || 0) * effectiveWeight,
    }
  })

  const modelConf = valid.reduce((sum, m) => sum + (m.confidence || 0), 0) / valid.length
  const confidence = clamp(modelConf * (0.7 + (qualityScore / 100) * 0.3), 0.1, 0.98)
  return { value, confidence, modelsWithContribution }
}

export function runSensitivity(input: FormState, dcf: ModelResult): { label: string; value: number }[] {
  if (!dcf.valid) return []
  const scenarios = [
    { label: '折现率 -1%', dr: -1, dg: 0, dfcfg: 0 },
    { label: '折现率 +1%', dr: 1, dg: 0, dfcfg: 0 },
    { label: '永续增长 -0.5%', dr: 0, dg: -0.5, dfcfg: 0 },
    { label: '永续增长 +0.5%', dr: 0, dg: 0.5, dfcfg: 0 },
    { label: 'FCF增长 -20%', dr: 0, dg: 0, dfcfg: -20 },
    { label: 'FCF增长 +20%', dr: 0, dg: 0, dfcfg: 20 },
  ]

  return scenarios.map((s) => {
    const out = computeDCF({
      ...input,
      discountRate: input.discountRate + s.dr,
      terminalGrowth: input.terminalGrowth + s.dg,
      fcfGrowth: input.fcfGrowth + s.dfcfg,
    })
    return { label: s.label, value: out.valid ? (out.value || 0) : 0 }
  })
}

export function analyze(input: FormState): AnalysisResult {
  input = normalizeInput(input)
  const dataCoverage = computeDataCoverage(input)
  const industryProfile = detectIndustryProfile(input)
  const dcf = computeDCF(input)
  const roepb = computeROEPB(input)
  const rel = computeRelative(input)
  const grh = computeGraham(input)
  const cape = computeCAPE(input)
  const fcfev = computeFCFEV(input)
  const sotp = computeSOTP(input)
  const qualityScore = computeQuality(input)
  const redFlags = computeRedFlags(input)
  const base = aggregate([dcf, roepb, rel, grh, cape, fcfev, sotp], qualityScore, industryProfile.weights)

  const rangeCandidates = [
    dcf.range?.bear,
    roepb.value ? roepb.value * 0.85 : undefined,
    rel.value ? rel.value * 0.88 : undefined,
  ].filter((v): v is number => Number.isFinite(v))
  const rangeBear = rangeCandidates.length ? Math.min(...rangeCandidates) : base.value
  const rangeBullCandidates = [
    dcf.range?.bull,
    roepb.value ? roepb.value * 1.15 : undefined,
    rel.value ? rel.value * 1.12 : undefined,
  ].filter((v): v is number => Number.isFinite(v))
  const rangeBull = rangeBullCandidates.length ? Math.max(...rangeBullCandidates) : base.value
  const conservativeValue = Math.min(rangeBear, base.value)

  const marginSafety = input.price > 0 && base.value > 0 ? (base.value - input.price) / input.price : 0
  const conservativeMarginSafety = input.price > 0 && conservativeValue > 0 ? (conservativeValue - input.price) / input.price : 0
  const warnings: string[] = []
  if (!dcf.valid) warnings.push(`DCF 未采用：${dcf.reason}`)
  if (!roepb.valid) warnings.push(`ROE-PB 未采用：${roepb.reason}`)
  if (!rel.valid) warnings.push(`相对估值未采用：${rel.reason}`)
  if (!grh.valid) warnings.push(`Graham 公式未采用：${grh.reason}`)
  if (!cape.valid && industryProfile.name === '强周期') warnings.push(`CAPE 未采用：${cape.reason}`)
  if (!fcfev.valid && industryProfile.name === '重资产基建') warnings.push(`FCF/EV 未采用：${fcfev.reason}`)
  if (!sotp.valid && industryProfile.name === '科技/平台') warnings.push(`SOTP 未采用：${sotp.reason}`)
  if (qualityScore < 60) warnings.push('质量评分偏低：建议提高安全边际阈值。')
  if (base.confidence < 0.6) warnings.push('置信度偏低：建议补充数据后再评估。')
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

  // Company own EV/EBITDA (informational reference, not used in relative valuation)
  const companyEVEBITDA = input.ebitdaPerShare > 0 && input.sharesOutstanding > 0 && input.price > 0
    ? (() => {
        const ebitdaTotal = input.ebitdaPerShare * input.sharesOutstanding // 亿元
        const enterpriseValue = input.price * input.sharesOutstanding + input.netDebt // 亿元
        return ebitdaTotal > 0 ? enterpriseValue / ebitdaTotal : undefined
      })()
    : undefined

  const dividendYield = input.price > 0 ? input.dividend0 / input.price : 0
  const sustainableGrowth = input.bvps > 0
    ? clamp((input.eps / input.bvps) * (1 - Math.min(1, input.dividend0 / Math.max(input.eps, 0.0001))), -0.05, 0.15)
    : clamp(input.fcfGrowth / 100, -0.05, 0.15)
  const rerating10y = input.price > 0 && base.value > 0 ? (Math.pow(base.value / input.price, 1 / 10) - 1) : 0
  const longTermReturn = {
    annualDividend: dividendYield,
    annualGrowth: sustainableGrowth,
    annualValuationChange: rerating10y,
    annualTotal: dividendYield + sustainableGrowth + rerating10y,
    horizonYears: 10,
  }

  const percentileCloud = [
    {
      metric: 'PE' as const,
      percentile5y: clamp(input.pePercentile5y, 0, 100),
      percentile10y: clamp(input.pePercentile10y, 0, 100),
    },
    {
      metric: 'PB' as const,
      percentile5y: clamp(input.pbPercentile5y, 0, 100),
      percentile10y: clamp(input.pbPercentile10y, 0, 100),
    },
    {
      metric: 'PCF' as const,
      percentile5y: clamp(input.pcfPercentile5y, 0, 100),
      percentile10y: clamp(input.pcfPercentile10y, 0, 100),
    },
  ]

  const spread = input.csi300EarningsYield > 0
    ? input.csi300EarningsYield - input.cn10yYield
    : 0
  const spreadMean = input.equityBondSpreadMean10y
  const spreadStd = input.equityBondSpreadStd10y > 0 ? input.equityBondSpreadStd10y : 1
  const zScore = (spread - spreadMean) / spreadStd
  const thermometer = {
    spread,
    zScore,
    status: zScore >= 2 || spread >= 3 ? 'cold' as const : zScore < 0 ? 'hot' as const : 'neutral' as const,
  }

  const safetyScore = Math.round(clamp(50 + conservativeMarginSafety * 120, 0, 100))
  const confidenceAdjusted = clamp(
    base.confidence * (redFlags.blocked ? 0.55 : 1) * (1 - redFlags.scorePenalty / 200),
    0.05,
    0.98,
  )

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

export function formatYuan(v: number): string {
  return Number.isFinite(v) ? `￥${v.toFixed(2)}` : '-'
}

export function formatPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`
}

export function grade(margin: number): { label: string; cls: string } {
  if (margin >= 0.3) return { label: '明显低估', cls: 'grade-good' }
  if (margin >= 0.1) return { label: '轻度低估', cls: 'grade-good' }
  if (margin <= -0.2) return { label: '高估', cls: 'grade-bad' }
  return { label: '合理区间', cls: 'grade-mid' }
}
