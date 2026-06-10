import type { FormState } from '../../types'
import { DATA_COVERAGE_CHECKS } from './config'

export type DataCoverageResult = {
  score: number
  level: 'high' | 'medium' | 'low'
  missingCoreFields: string[]
}

export function computeDataCoverage(input: FormState): DataCoverageResult {
  const missingCoreFields = DATA_COVERAGE_CHECKS
    .filter((c) => Number(input[c.key]) <= 0)
    .map((c) => c.label)
  const score = Math.round(((DATA_COVERAGE_CHECKS.length - missingCoreFields.length) / DATA_COVERAGE_CHECKS.length) * 100)
  const level = score >= 80 ? 'high' as const : score >= 55 ? 'medium' as const : 'low' as const
  return { score, level, missingCoreFields }
}
