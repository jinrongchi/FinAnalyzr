export function normalizeNumber(value: number | null | undefined, fallback: number): number {
  return Number.isFinite(value) && value !== null ? Number(value) : fallback
}

export function roundNumber(value: number, digits: number): number {
  if (!Number.isFinite(value)) return value
  const factor = Math.pow(10, digits)
  return Math.round(value * factor) / factor
}

export function percentileRank(currentValue: number, samples: number[]): number {
  const valid = samples.filter((v) => Number.isFinite(v) && v > 0)
  if (!Number.isFinite(currentValue) || currentValue <= 0 || valid.length === 0) return 0
  const lessOrEqual = valid.filter((v) => v <= currentValue).length
  return (lessOrEqual / valid.length) * 100
}

export function meanStd(values: number[]): { mean: number; std: number } {
  const valid = values.filter((v) => Number.isFinite(v))
  if (!valid.length) return { mean: 0, std: 0 }
  const mean = valid.reduce((a, b) => a + b, 0) / valid.length
  const variance = valid.reduce((acc, v) => acc + (v - mean) ** 2, 0) / valid.length
  return { mean, std: Math.sqrt(variance) }
}

export function average(values: number[]): number {
  const valid = values.filter((v) => Number.isFinite(v))
  if (!valid.length) return 0
  return valid.reduce((a, b) => a + b, 0) / valid.length
}

export function getFieldValue<T>(
  row: unknown[] | undefined,
  fields: string[],
  fieldName: string,
): T | undefined {
  if (!row || fields.length === 0) return undefined
  const idx = fields.indexOf(fieldName)
  if (idx < 0) return undefined
  return row[idx] as T | undefined
}

export function deriveMoatScore(roic: number): number {
  if (roic >= 25) return 80
  if (roic >= 20) return 65
  if (roic >= 15) return 50
  if (roic >= 10) return 35
  return 20
}
