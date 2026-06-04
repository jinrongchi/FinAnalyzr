import type { AnalysisResult, FormState, ModelResult } from '../types'

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

export function computeDCF(input: FormState): ModelResult {
  const r = input.discountRate / 100
  const g = input.terminalGrowth / 100
  const fcfGrowth = input.fcfGrowth / 100

  if (r <= g || input.fcf0 <= 0 || input.sharesOutstanding <= 0) {
    return { key: 'DCF', name: 'DCF', valid: false, reason: '参数需满足 r > g，且 FCF、股本为正' }
  }

  let pv = 0
  let fcf = input.fcf0
  for (let year = 1; year <= input.forecastYears; year += 1) {
    fcf *= 1 + fcfGrowth
    pv += fcf / (1 + r) ** year
  }

  const terminalFcf = fcf * (1 + g)
  const terminalValue = terminalFcf / (r - g)
  const terminalPv = terminalValue / (1 + r) ** input.forecastYears
  const enterpriseValue = pv + terminalPv
  const equityValue = enterpriseValue - input.netDebt

  return {
    key: 'DCF',
    name: 'DCF',
    valid: true,
    value: equityValue / input.sharesOutstanding,
    confidence: 0.85,
    assumptions: `r=${input.discountRate.toFixed(1)}%, g=${input.terminalGrowth.toFixed(1)}%, 预测${input.forecastYears}年`,
  }
}

export function computeRelative(input: FormState): ModelResult {
  const peValue = input.eps > 0 && input.industryPE > 0 ? input.eps * input.industryPE : 0
  const pbValue = input.bvps > 0 && input.industryPB > 0 ? input.bvps * input.industryPB : 0
  const evValue = input.ebitdaPerShare > 0 && input.industryEVEBITDA > 0
    ? input.ebitdaPerShare * input.industryEVEBITDA
    : 0

  const value = average([peValue, pbValue, evValue])
  if (value <= 0) {
    return { key: 'REL', name: '相对估值', valid: false, reason: '关键分项缺失，无法形成有效相对估值' }
  }

  const active = [peValue, pbValue, evValue].filter((v) => v > 0).length
  return {
    key: 'REL',
    name: '相对估值',
    valid: true,
    value,
    confidence: clamp(0.55 + active * 0.12, 0.55, 0.9),
    assumptions: `PE=${input.industryPE}, PB=${input.industryPB}, EV/EBITDA=${input.industryEVEBITDA}`,
  }
}

export function computeDDM(input: FormState): ModelResult {
  const k = input.requiredReturn / 100
  const g1 = input.dividendGrowth / 100
  const g2 = input.stableGrowth / 100

  if (input.dividend0 <= 0 || k <= g2) {
    return { key: 'DDM', name: 'DDM', valid: false, reason: '参数需满足 D0 > 0 且 k > g2' }
  }

  let pv = 0
  let d = input.dividend0
  for (let year = 1; year <= input.ddmYears; year += 1) {
    d *= 1 + g1
    pv += d / (1 + k) ** year
  }

  const dStable = d * (1 + g2)
  const terminal = dStable / (k - g2)
  const terminalPv = terminal / (1 + k) ** input.ddmYears

  return {
    key: 'DDM',
    name: 'DDM',
    valid: true,
    value: pv + terminalPv,
    confidence: 0.65,
    assumptions: `k=${input.requiredReturn.toFixed(1)}%, g1=${input.dividendGrowth.toFixed(1)}%, g2=${input.stableGrowth.toFixed(1)}%`,
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

export function aggregate(models: ModelResult[], qualityScore: number): { value: number; confidence: number } {
  const valid = models.filter((m) => m.valid && Number.isFinite(m.value))
  if (!valid.length) return { value: 0, confidence: 0 }

  const weights: Record<string, number> = { DCF: 0.45, REL: 0.35, DDM: 0.2 }
  const usedWeight = valid.reduce((sum, m) => sum + (weights[m.key] || 0), 0)

  const value = valid.reduce((sum, m) => {
    const w = (weights[m.key] || 0) / usedWeight
    return sum + (m.value || 0) * w
  }, 0)

  const modelConf = valid.reduce((sum, m) => sum + (m.confidence || 0), 0) / valid.length
  const confidence = clamp(modelConf * (0.7 + (qualityScore / 100) * 0.3), 0.1, 0.98)
  return { value, confidence }
}

export function runSensitivity(input: FormState, dcf: ModelResult): { label: string; value: number }[] {
  if (!dcf.valid) return []
  const scenarios = [
    { label: '折现率 -1%', dr: -1, dg: 0 },
    { label: '折现率 +1%', dr: 1, dg: 0 },
    { label: '永续增长 -0.5%', dr: 0, dg: -0.5 },
    { label: '永续增长 +0.5%', dr: 0, dg: 0.5 },
  ]

  return scenarios.map((s) => {
    const out = computeDCF({ ...input, discountRate: input.discountRate + s.dr, terminalGrowth: input.terminalGrowth + s.dg })
    return { label: s.label, value: out.valid ? (out.value || 0) : 0 }
  })
}

export function analyze(input: FormState): AnalysisResult {
  const dcf = computeDCF(input)
  const rel = computeRelative(input)
  const ddm = computeDDM(input)
  const qualityScore = computeQuality(input)
  const base = aggregate([dcf, rel, ddm], qualityScore)

  const marginSafety = input.price > 0 && base.value > 0 ? (base.value - input.price) / input.price : 0
  const warnings: string[] = []
  if (!dcf.valid) warnings.push(`DCF 未采用：${dcf.reason}`)
  if (!rel.valid) warnings.push(`相对估值未采用：${rel.reason}`)
  if (!ddm.valid) warnings.push(`DDM 未采用：${ddm.reason}`)
  if (qualityScore < 60) warnings.push('质量评分偏低：建议提高安全边际阈值。')
  if (base.confidence < 0.6) warnings.push('置信度偏低：建议补充数据后再评估。')
  if (!warnings.length) warnings.push('无明显模型警告，但仍需结合行业与治理实地研究。')

  return {
    intrinsicValue: base.value,
    marginSafety,
    confidence: base.confidence,
    qualityScore,
    models: [dcf, rel, ddm],
    sensitivity: runSensitivity(input, dcf),
    warnings,
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
