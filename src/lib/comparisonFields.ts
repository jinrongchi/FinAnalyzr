import type { FormState } from '../types'

export const COMPARISON_FIELDS: Array<{ key: keyof FormState; label: string }> = [
  { key: 'price', label: '当前股价' },
  { key: 'fcf0', label: 'FCF0(亿元)' },
  { key: 'fcfGrowth', label: 'FCF增长率(%)' },
  { key: 'discountRate', label: '折现率(%)' },
  { key: 'terminalGrowth', label: '永续增长率(%)' },
  { key: 'eps', label: 'EPS' },
  { key: 'bvps', label: 'BVPS' },
  { key: 'dividend0', label: 'D0' },
  { key: 'roic', label: 'ROIC(%)' },
  { key: 'deRatio', label: 'D/E' },
]

export const ATTRIBUTION_FIELDS: Array<{ key: keyof FormState; label: string }> = [
  { key: 'fcfGrowth', label: 'FCF增长率' },
  { key: 'discountRate', label: '折现率' },
  { key: 'terminalGrowth', label: '永续增长率' },
  { key: 'eps', label: 'EPS' },
  { key: 'bvps', label: 'BVPS' },
  { key: 'roic', label: 'ROIC' },
]
