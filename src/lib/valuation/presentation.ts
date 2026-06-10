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
