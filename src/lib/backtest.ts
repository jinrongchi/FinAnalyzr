import type {
  AttributionResult,
  BacktestPoint,
  FormState,
  Snapshot,
} from '../types'
import { analyze } from './valuation'

type AttributionField = { key: keyof FormState; label: string }

export function buildBacktestSeries(snapshots: Snapshot[]): BacktestPoint[] {
  if (snapshots.length < 2) return []

  const sorted = [...snapshots].sort((a, b) =>
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  )

  const points: BacktestPoint[] = []
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const left = sorted[i]
    const right = sorted[i + 1]

    const basePrice = left.form.price
    const predictedReturn = basePrice > 0
      ? (left.result.intrinsicValue - basePrice) / basePrice
      : 0
    const realizedReturn = basePrice > 0
      ? (right.form.price - basePrice) / basePrice
      : 0

    points.push({
      fromId: left.id,
      toId: right.id,
      fromLabel: left.label,
      toLabel: right.label,
      predictedReturn,
      realizedReturn,
      predictionError: realizedReturn - predictedReturn,
    })
  }

  return points
}

export function computeAssumptionAttribution(
  base: Snapshot,
  target: Snapshot,
  fields: AttributionField[],
): AttributionResult {
  const baseIntrinsic = analyze(base.form).intrinsicValue
  const targetIntrinsic = analyze(target.form).intrinsicValue

  let runningForm: FormState = { ...base.form }
  let runningIntrinsic = baseIntrinsic

  const items = fields.map((field) => {
    const nextForm: FormState = {
      ...runningForm,
      [field.key]: target.form[field.key],
    }
    const nextIntrinsic = analyze(nextForm).intrinsicValue
    const contribution = nextIntrinsic - runningIntrinsic

    runningForm = nextForm
    runningIntrinsic = nextIntrinsic

    return {
      key: field.key,
      label: field.label,
      contribution,
    }
  })

  const totalDelta = targetIntrinsic - baseIntrinsic
  const explainedDelta = items.reduce((sum, item) => sum + item.contribution, 0)
  const residualDelta = totalDelta - explainedDelta

  return {
    baseIntrinsic,
    targetIntrinsic,
    totalDelta,
    explainedDelta,
    residualDelta,
    items: [
      ...items,
      {
        key: 'residual',
        label: '其余因素/交互项',
        contribution: residualDelta,
      },
    ],
  }
}
