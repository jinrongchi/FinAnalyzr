export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

export function averagePositive(values: number[]): number {
  const valid = values.filter((v) => Number.isFinite(v) && v > 0)
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : 0
}

export function scoreFromThreshold(value: number, bands: Array<[number, number]>): number {
  for (const [limit, score] of bands) {
    if (value >= limit) return score
  }
  return 20
}
