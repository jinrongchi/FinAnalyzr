import type { AnalysisResult, FormState, ModelResult } from '../../types'
import { clamp } from './utils'
import type { DataCoverageResult } from './dataCoverage'

export type RedFlagResult = {
  blocked: boolean
  hardReject: boolean
  scorePenalty: number
  flags: string[]
}

export function computeRedFlags(input: FormState): RedFlagResult {
  const flags: string[] = []
  let hardReject = false
  const payoutRatio = input.eps > 0 ? input.dividend0 / input.eps : 0
  const dividendCashWeak = input.dividend0 > 0 && input.fcfConversion > 0 && input.fcfConversion < 70

  if (input.isST > 0) {
    flags.push('检测到 ST/*ST 风险标记')
    hardReject = true
  }

  if (input.isFinancialSector <= 0) {
    if (input.ocfToNi3yAvg > 0 && input.ocfToNi3yAvg < 0.5) {
      flags.push('经营性现金流/净利润连续3年低于0.5')
      hardReject = true
    } else if (input.ocfToNi3yAvg > 0 && input.ocfToNi3yAvg < 0.7) {
      flags.push('经营性现金流/净利润连续3年低于0.7')
    }
  }

  if (input.goodwillToEquity > 50) {
    flags.push('商誉/净资产超过50%')
    hardReject = true
  } else if (input.goodwillToEquity > 30) {
    flags.push('商誉/净资产超过30%')
  }

  if (input.otherReceivablesToEquity > 50) {
    flags.push('其他应收款/净资产超过50%')
    hardReject = true
  } else if (input.otherReceivablesToEquity > 20) {
    flags.push('其他应收款/净资产超过20%')
  }

  if (input.relatedPartySalesToRevenue > 50) {
    flags.push('关联方销售占营收超过50%')
    hardReject = true
  } else if (input.relatedPartySalesToRevenue > 30) {
    flags.push('关联方销售占营收超过30%')
  }

  if (input.externalGuaranteeToEquity > 50) {
    flags.push('对外担保/净资产超过50%')
    hardReject = true
  } else if (input.externalGuaranteeToEquity > 30) {
    flags.push('对外担保/净资产超过30%')
  }

  if (input.inventoryTurnoverTrend > 30 && input.arTurnoverTrend > 30) {
    flags.push('存货与应收周转天数近3年累计上升超过30%')
  }

  if (payoutRatio > 0.7 && dividendCashWeak) {
    flags.push('分红支付率超过70%且现金流覆盖偏弱')
  } else if (payoutRatio > 0.7) {
    flags.push('分红支付率超过70%，需关注可持续性')
  }

  const blocked = hardReject
  const scorePenalty = blocked ? Math.min(35, flags.length * 12) : 0
  return { blocked, hardReject, scorePenalty, flags }
}

type WarningArgs = {
  input: FormState
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
  dataCoverage: DataCoverageResult
  redFlags: RedFlagResult
}

export function collectWarnings(args: WarningArgs): string[] {
  function appendModelWarning(label: string, model: ModelResult, enabled = true): void {
    if (enabled && !model.valid) {
      warnings.push(`${label} 未采用：${model.reason}`)
    }
  }

  const warnings: string[] = []
  const { input, dcf, roepb, rel, grh, cape, fcfev, sotp, qualityScore, confidence, industryName, dataCoverage, redFlags } = args
  const payoutRatio = input.eps > 0 ? input.dividend0 / input.eps : 0

  appendModelWarning('DCF', dcf)
  appendModelWarning('ROE-PB', roepb)
  appendModelWarning('相对估值', rel)
  appendModelWarning('Graham 公式', grh)
  appendModelWarning('CAPE', cape, industryName === '强周期')
  appendModelWarning('FCF/EV', fcfev, industryName === '重资产基建')
  appendModelWarning('SOTP', sotp, industryName === '科技/平台')
  if (qualityScore < 60) warnings.push('质量评分偏低：建议提高安全边际阈值。')
  if (confidence < 0.6) warnings.push('置信度偏低：建议补充数据后再评估。')
  if (dataCoverage.level === 'low') warnings.push(`数据充分度偏低（${dataCoverage.score}%）：建议先补齐关键字段。`)
  if (input.listedYears > 0 && input.listedYears < 1) {
    warnings.push('上市不足1年：估值不确定性极高，仅建议观察。')
  } else if (input.listedYears > 0 && input.listedYears < 5) {
    warnings.push('上市不足5年：估值样本不足，系统已自动下调置信度。')
  }
  if (input.isPolicySensitive > 0) {
    warnings.push('政策敏感行业：需重点关注监管节奏与政策波动风险。')
  }
  if (input.isFinancialSector > 0) {
    warnings.push('金融行业口径：OCF/NI 指标参考意义有限，建议结合资本充足率与资产质量。')
    const currentPb = input.bvps > 0 ? input.price / input.bvps : 0
    if (currentPb > 0 && currentPb < 0.7) {
      warnings.push('金融股提示：PB低于0.7倍也可能因资产质量风险而不安全，需结合不良与拨备覆盖审视。')
    }
  }
  if (payoutRatio > 1) {
    warnings.push('股息支付率超过100%：当前分红可能依赖资产负债表或一次性项目。')
  }
  if (redFlags.blocked) {
    warnings.push('触发硬性财务红旗：Do Not Invest。')
  }
  if (redFlags.hardReject) {
    for (const flag of redFlags.flags) {
      warnings.push(`红旗：${flag}`)
    }
  } else if (redFlags.flags.length > 0) {
    for (const flag of redFlags.flags) {
      warnings.push(`提示：${flag}`)
    }
  }
  if (!warnings.length) warnings.push('无明显模型警告，但仍需结合行业与治理实地研究。')

  return warnings
}

export function computeConfidenceAdjusted(
  confidence: number,
  input: FormState,
  redFlags: RedFlagResult,
): number {
  const ipoPenalty = input.listedYears > 0 && input.listedYears < 1 ? 0.6 : input.listedYears > 0 && input.listedYears < 5 ? 0.8 : 1
  return clamp(
    confidence * ipoPenalty * (redFlags.blocked ? 0.1 : 1) * (1 - redFlags.scorePenalty / 200),
    0.05,
    0.98,
  )
}

export function buildConformanceChecks(args: {
  input: FormState
  redFlags: RedFlagResult
  growthBoardHighRisk: boolean
  marketCycleAdjustment: number
}): NonNullable<AnalysisResult['conformanceChecks']> {
  const { input, redFlags, growthBoardHighRisk, marketCycleAdjustment } = args
  const checks: NonNullable<AnalysisResult['conformanceChecks']> = []

  checks.push({
    key: 'st',
    label: 'ST过滤',
    status: input.isST > 0 ? 'block' : 'on',
    detail: input.isST > 0 ? 'ST触发硬性限制' : '未触发',
  })

  checks.push({
    key: 'ipo',
    label: '上市年限',
    status: input.listedYears > 0 && input.listedYears < 1 ? 'warn' : input.listedYears > 0 && input.listedYears < 5 ? 'warn' : 'on',
    detail: input.listedYears > 0 ? `${input.listedYears.toFixed(1)}年` : '未知',
  })

  checks.push({
    key: 'growthBoard',
    label: '成长板风险',
    status: growthBoardHighRisk ? 'warn' : input.isGrowthBoard > 0 ? 'on' : 'off',
    detail: growthBoardHighRisk ? '小市值未盈利触发评分上限' : input.isGrowthBoard > 0 ? '已启用' : '未触发',
  })

  checks.push({
    key: 'policy',
    label: '政策敏感',
    status: input.isPolicySensitive > 0 ? 'warn' : 'off',
    detail: input.isPolicySensitive > 0 ? '需关注监管波动' : '未触发',
  })

  checks.push({
    key: 'financial',
    label: '金融行业口径',
    status: input.isFinancialSector > 0 ? 'on' : 'off',
    detail: input.isFinancialSector > 0 ? '已排除OCF/NI硬否决' : '标准口径',
  })

  checks.push({
    key: 'redFlags',
    label: '硬性红旗',
    status: redFlags.hardReject ? 'block' : redFlags.flags.length > 0 ? 'warn' : 'on',
    detail: redFlags.flags.length ? redFlags.flags[0] : '未触发',
  })

  checks.push({
    key: 'relatedPartyRisk',
    label: '关联方/担保风险',
    status: input.relatedPartySalesToRevenue > 50 || input.externalGuaranteeToEquity > 50
      ? 'block'
      : input.relatedPartySalesToRevenue > 30 || input.externalGuaranteeToEquity > 30
        ? 'warn'
        : 'off',
    detail: `关联销售${input.relatedPartySalesToRevenue.toFixed(1)}%，对外担保${input.externalGuaranteeToEquity.toFixed(1)}%`,
  })

  checks.push({
    key: 'marketCycle',
    label: '市场周期修正',
    status: marketCycleAdjustment === 0 ? 'off' : 'on',
    detail: marketCycleAdjustment > 0 ? `+${marketCycleAdjustment}` : `${marketCycleAdjustment}`,
  })

  return checks
}
