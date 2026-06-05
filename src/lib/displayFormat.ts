import { formatPct, formatYuan } from './valuation'

export function formatMaybeYuan(value: number): string {
  return value === 0 ? 'N/A' : formatYuan(value)
}

export function formatMaybePct(value: number): string {
  return value === 0 ? 'N/A' : formatPct(value)
}

export function formatMaybeNumber(value: number, digits = 2): string {
  return value === 0 ? 'N/A' : value.toFixed(digits)
}
