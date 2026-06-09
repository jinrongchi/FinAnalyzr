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
  roic: number
  deRatio: number
  fcfConversion: number
  governanceScore: number
  moatScore: number
  // Red-flag inputs and extended long-term metrics (0 means unknown/unset)
  ocfToNi3yAvg: number
  goodwillToEquity: number
  otherReceivablesToEquity: number
  inventoryTurnoverTrend: number
  arTurnoverTrend: number
  csi300EarningsYield: number
  cn10yYield: number
  peg: number
  cape: number
  pcf: number
  pePercentile5y: number
  pbPercentile5y: number
  pcfPercentile5y: number
  pePercentile10y: number
  pbPercentile10y: number
  pcfPercentile10y: number
  fcfYield: number
  industryOverride: number
  sotpPerShare: number
  sotpSegmentCorePerShare: number
  sotpSegmentGrowthPerShare: number
  sotpSegmentInvestmentPerShare: number
  sotpSegmentNetCashPerShare: number
  rndCapitalizationAdjPerShare: number
  equityBondSpreadMean10y: number
  equityBondSpreadStd10y: number
}

export type ModelResult = {
  key: 'DCF' | 'REL' | 'GRH' | 'ROEPB' | 'CAPE' | 'FCFEV' | 'SOTP'
  name: string
  valid: boolean
  value?: number
  confidence?: number
  weight?: number
  contribution?: number
  assumptions?: string
  reason?: string
  range?: {
    bear: number
    base: number
    bull: number
  }
}

export type RedFlagResult = {
  blocked: boolean
  scorePenalty: number
  flags: string[]
}

export type LongTermReturnBreakdown = {
  annualDividend: number
  annualGrowth: number
  annualValuationChange: number
  annualTotal: number
  horizonYears: number
}

export type PercentileCloudPoint = {
  metric: 'PE' | 'PB' | 'PCF'
  percentile5y?: number
  percentile10y: number
}

export type ValuationThermometer = {
  spread: number
  zScore: number
  status: 'cold' | 'neutral' | 'hot'
}

export type DataCoverage = {
  score: number
  level: 'high' | 'medium' | 'low'
  missingCoreFields: string[]
}

export type AnalysisResult = {
  intrinsicValue: number
  intrinsicRange?: {
    bear: number
    base: number
    bull: number
    conservative: number
  }
  marginSafety: number
  conservativeMarginSafety?: number
  confidence: number
  qualityScore: number
  safetyScore?: number
  models: ModelResult[]
  sensitivity: { label: string; value: number }[]
  warnings: string[]
  companyEVEBITDA?: number
  industryProfile?: string
  redFlags?: RedFlagResult
  longTermReturn?: LongTermReturnBreakdown
  percentileCloud?: PercentileCloudPoint[]
  thermometer?: ValuationThermometer
  dataCoverage?: DataCoverage
}

export type FieldSource = 'auto' | 'derived' | 'default' | 'manual'
export type FieldSources = Partial<Record<keyof FormState, FieldSource>>
export type FieldNotes = Partial<Record<keyof FormState, string>>

export type TushareLoadResult = {
  patch: Partial<FormState>
  fieldSources: FieldSources
  fieldNotes: FieldNotes
  notes: string[]
  sourceTradeDate?: string
  stockName?: string
  fetchedAt: string
}

export type Snapshot = {
  id: string
  createdAt: string
  sourceTradeDate?: string
  tags: string[]
  label: string
  form: FormState
  result: AnalysisResult
  fieldSources?: FieldSources
  fieldNotes?: FieldNotes
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
  id: string // ticker only - stable identity
  ticker: string
  stockName: string
  sourceTradeDate?: string // data field, not part of identity
  createdAt: string // when entry was first added
  updatedAt: string // when entry was last refreshed
  form: FormState
}
