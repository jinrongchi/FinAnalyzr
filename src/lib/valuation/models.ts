import type { FormState, ModelResult } from '../../types'
import { MODEL_WEIGHTS, SENSITIVITY_SCENARIOS } from './config'
import { averagePositive, clamp } from './utils'

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

  const value = averagePositive([peValue, pbValue, pcfValue, pegValue])
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

export function buildModelResults(input: FormState): {
  dcf: ModelResult
  roepb: ModelResult
  rel: ModelResult
  grh: ModelResult
  cape: ModelResult
  fcfev: ModelResult
  sotp: ModelResult
  all: ModelResult[]
} {
  const dcf = computeDCF(input)
  const roepb = computeROEPB(input)
  const rel = computeRelative(input)
  const grh = computeGraham(input)
  const cape = computeCAPE(input)
  const fcfev = computeFCFEV(input)
  const sotp = computeSOTP(input)
  const all = [dcf, roepb, rel, grh, cape, fcfev, sotp]
  return { dcf, roepb, rel, grh, cape, fcfev, sotp, all }
}

export function runSensitivity(input: FormState, dcf: ModelResult): { label: string; value: number }[] {
  if (!dcf.valid) return []
  return SENSITIVITY_SCENARIOS.map((s) => {
    const out = computeDCF({
      ...input,
      discountRate: input.discountRate + s.dr,
      terminalGrowth: input.terminalGrowth + s.dg,
      fcfGrowth: input.fcfGrowth + s.dfcfg,
    })
    return { label: s.label, value: out.valid ? (out.value || 0) : 0 }
  })
}
