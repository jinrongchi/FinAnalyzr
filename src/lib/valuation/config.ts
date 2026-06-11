import type { FormState, ModelResult } from '../../types'

export type ModelKey = ModelResult['key']
export type ModelWeights = Partial<Record<ModelKey, number>>
export type IndustryProfileKey = 'financialRealEstate' | 'consumerHealthcare' | 'cyclical' | 'infraAssetHeavy' | 'technologyPlatform'
export type CoverageCheck = { key: keyof FormState; label: string }

export type IndustryProfile = {
  name: string
  weights: ModelWeights
}

export const MODEL_WEIGHTS: ModelWeights = {
  DCF: 0.3,
  ROEPB: 0.24,
  REL: 0.22,
  GRH: 0.09,
  CAPE: 0.05,
  FCFEV: 0.05,
  SOTP: 0.05,
}

export const INDUSTRY_PROFILES: Record<IndustryProfileKey, IndustryProfile> = {
  financialRealEstate: {
    name: '金融/地产',
    weights: { DCF: 0.12, ROEPB: 0.42, REL: 0.26, GRH: 0.12, FCFEV: 0.08 },
  },
  consumerHealthcare: {
    name: '消费/医药',
    weights: { DCF: 0.38, ROEPB: 0.24, REL: 0.2, GRH: 0.1, FCFEV: 0.08 },
  },
  cyclical: {
    name: '强周期',
    weights: { DCF: 0.16, ROEPB: 0.14, REL: 0.22, CAPE: 0.24, GRH: 0.12, FCFEV: 0.12 },
  },
  infraAssetHeavy: {
    name: '重资产基建',
    weights: { DCF: 0.24, ROEPB: 0.16, REL: 0.2, FCFEV: 0.26, GRH: 0.14 },
  },
  technologyPlatform: {
    name: '科技/平台',
    weights: { DCF: 0.24, ROEPB: 0.2, REL: 0.18, SOTP: 0.24, GRH: 0.06, CAPE: 0.08 },
  },
}

export const INDUSTRY_OVERRIDE_PROFILE: Partial<Record<number, IndustryProfileKey>> = {
  1: 'financialRealEstate',
  2: 'consumerHealthcare',
  3: 'cyclical',
  4: 'infraAssetHeavy',
  5: 'technologyPlatform',
}

export const SENSITIVITY_SCENARIOS: Array<{ label: string; dr: number; dg: number; dfcfg: number }> = [
  { label: '折现率 -1%', dr: -1, dg: 0, dfcfg: 0 },
  { label: '折现率 +1%', dr: 1, dg: 0, dfcfg: 0 },
  { label: '永续增长 -0.5%', dr: 0, dg: -0.5, dfcfg: 0 },
  { label: '永续增长 +0.5%', dr: 0, dg: 0.5, dfcfg: 0 },
  { label: 'FCF增长 -20%', dr: 0, dg: 0, dfcfg: -20 },
  { label: 'FCF增长 +20%', dr: 0, dg: 0, dfcfg: 20 },
]

export const QUALITY_BANDS = {
  roic: [[25, 98], [20, 90], [15, 78], [10, 62], [5, 45]] as Array<[number, number]>,
  de: [[-0.2, 95], [-0.5, 82], [-1.0, 65], [-1.5, 45]] as Array<[number, number]>,
  fcf: [[95, 95], [85, 85], [70, 70], [50, 55]] as Array<[number, number]>,
}

export const DATA_COVERAGE_CHECKS: CoverageCheck[] = [
  { key: 'price', label: '价格' },
  { key: 'fcf0', label: 'FCF' },
  { key: 'discountRate', label: '折现率' },
  { key: 'sharesOutstanding', label: '总股本' },
  { key: 'eps', label: 'EPS' },
  { key: 'bvps', label: 'BVPS' },
  { key: 'industryPE', label: '行业PE' },
  { key: 'industryPB', label: '行业PB' },
  { key: 'pcf', label: 'PCF' },
  { key: 'peg', label: 'PEG' },
  { key: 'dividend0', label: '股息D0' },
  { key: 'csi300EarningsYield', label: '股债利差E/P' },
  { key: 'pePercentile10y', label: 'PE分位(10Y)' },
  { key: 'pbPercentile10y', label: 'PB分位(10Y)' },
  { key: 'pcfPercentile10y', label: 'PCF分位(10Y)' },
]
