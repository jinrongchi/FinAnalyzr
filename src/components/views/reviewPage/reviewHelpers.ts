import type { Snapshot } from '../../../types'

export function tagColorClass(tag: string): string {
  const hash = tag.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0)
  return `tag-chip--${hash % 6}`
}

export function formatThermometerStatus(value?: 'cold' | 'neutral' | 'hot'): string {
  if (!value) return 'N/A'
  if (value === 'cold') return '偏冷'
  if (value === 'hot') return '偏热'
  return '中性'
}

export function formatCapeMethod(snapshot?: Snapshot): string {
  if (!snapshot) return 'N/A'
  const source = snapshot.fieldSources?.cape
  const note = snapshot.fieldNotes?.cape || ''
  if (source === 'manual') return '手工输入'
  if (note.includes('CPI不可用')) return '名义利润(降级)'
  if (note.includes('CPI均值')) return '通胀调整'
  if ((snapshot.form.cape || 0) > 0) return '已提供'
  return 'N/A'
}

export function snapshotRiskBadge(snapshot: Snapshot): { text: string; cls: string; reasons: string[] } {
  const redFlagCount = snapshot.result.redFlags?.flags.length || 0
  const hot = snapshot.result.thermometer?.status === 'hot'
  const lowConfidence = snapshot.result.confidence < 0.6
  const reasons: string[] = []
  if (redFlagCount > 0) reasons.push(`红旗 ${redFlagCount} 项`)
  if (hot) reasons.push('估值温度偏热')
  if (lowConfidence) reasons.push('估值置信度偏低')
  if (redFlagCount > 0) return { text: '高风险', cls: 'risk-high', reasons }
  if (hot || lowConfidence) return { text: '中风险', cls: 'risk-mid', reasons }
  return { text: '低风险', cls: 'risk-low', reasons: ['当前未触发明显风险信号'] }
}