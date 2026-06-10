import type { FormState } from '../../../types'

export function completenessCount(form: FormState): { filled: number; total: number } {
  const numericKeys = Object.keys(form).filter((k) => k !== 'ticker') as Array<keyof FormState>
  const filled = numericKeys.filter((k) => {
    const v = form[k]
    return typeof v === 'number' ? v !== 0 : Boolean(v)
  }).length
  return { filled, total: numericKeys.length }
}

export function marginSafetyClass(m: number): string {
  if (m >= 0.3) return 'ms-great'
  if (m >= 0.1) return 'ms-good'
  if (m >= 0) return 'ms-neutral'
  return 'ms-bad'
}

export function warningSeverity(text: string): 'high' | 'medium' | 'info' {
  if (text.includes('Do Not Invest') || text.includes('红旗')) return 'high'
  if (text.includes('提示') || text.includes('偏低') || text.includes('下调')) return 'medium'
  return 'info'
}

export function warningLabel(level: 'high' | 'medium' | 'info'): string {
  if (level === 'high') return '高风险'
  if (level === 'medium') return '关注'
  return '信息'
}

export function spreadPercentileFromZ(zScore: number): number {
  const p = ((zScore + 3) / 6) * 100
  return Math.round(Math.max(0, Math.min(100, p)))
}