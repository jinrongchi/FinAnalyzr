export type FormState = {
  ticker: string
  price: number
  fcf0: number
  forecastYears: number
  fcfGrowth: number
  discountRate: number
  terminalGrowth: number
  netDebt: number
  sharesOutstanding: number
  eps: number
  bvps: number
  ebitdaPerShare: number
  industryPE: number
  industryPB: number
  industryEVEBITDA: number
  dividend0: number
  dividendGrowth: number
  ddmYears: number
  requiredReturn: number
  stableGrowth: number
  roic: number
  deRatio: number
  fcfConversion: number
  governanceScore: number
  moatScore: number
}

export type ModelResult = {
  key: 'DCF' | 'REL' | 'DDM'
  name: string
  valid: boolean
  value?: number
  confidence?: number
  assumptions?: string
  reason?: string
}

export type AnalysisResult = {
  intrinsicValue: number
  marginSafety: number
  confidence: number
  qualityScore: number
  models: ModelResult[]
  sensitivity: { label: string; value: number }[]
  warnings: string[]
}

export type TushareLoadResult = {
  patch: Partial<FormState>
  notes: string[]
  sourceTradeDate?: string
  stockName?: string
  fetchedAt: string
}

export type Snapshot = {
  id: string
  createdAt: string
  label: string
  form: FormState
  result: AnalysisResult
}

export type BacktestPoint = {
  fromId: string
  toId: string
  fromLabel: string
  toLabel: string
  predictedReturn: number
  realizedReturn: number
  predictionError: number
}

export type AttributionItem = {
  key: keyof FormState | 'residual'
  label: string
  contribution: number
}

export type AttributionResult = {
  baseIntrinsic: number
  targetIntrinsic: number
  totalDelta: number
  explainedDelta: number
  residualDelta: number
  items: AttributionItem[]
}

export type SearchHistoryEntry = {
  id: string
  ticker: string
  stockName: string
  sourceTradeDate?: string
  fetchedAt: string
  form: FormState
}
