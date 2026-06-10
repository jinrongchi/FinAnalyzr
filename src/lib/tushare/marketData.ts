import type { FieldSources, FormState } from '../../types'
import type { DailyBasicRow, DailyPcfRow } from './rows'
import { getFieldValue, normalizeNumber, percentileRank } from './utils'

export function parseListedYears(listDate: string | null | undefined, asOf: Date): number {
  if (!listDate || !/^\d{8}$/.test(listDate)) return 0
  const year = Number(listDate.slice(0, 4))
  const month = Number(listDate.slice(4, 6))
  const day = Number(listDate.slice(6, 8))
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return 0
  const listedAt = new Date(year, month - 1, day)
  if (Number.isNaN(listedAt.getTime()) || listedAt > asOf) return 0
  return (asOf.getTime() - listedAt.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
}

export function detectSTByName(stockName: string): boolean {
  const normalized = stockName.replace(/\s+/g, '').toUpperCase()
  return normalized.startsWith('*ST') || normalized.startsWith('ST')
}

export function detectGrowthBoard(tsCode: string, market: string | null | undefined): boolean {
  const marketText = (market || '').replace(/\s+/g, '')
  if (marketText.includes('创业') || marketText.includes('科创')) return true
  const normalized = tsCode.toUpperCase()
  return normalized.startsWith('300') || normalized.startsWith('688')
}

export function detectPolicySensitiveIndustry(industry: string | null | undefined): boolean {
  const text = (industry || '').replace(/\s+/g, '')
  if (!text) return false
  return text.includes('房地产') || text.includes('教育') || text.includes('医药') || text.includes('医疗') || text.includes('生物')
}

export function detectFinancialSector(industry: string | null | undefined): boolean {
  const text = (industry || '').replace(/\s+/g, '')
  if (!text) return false
  return text.includes('银行') || text.includes('非银') || text.includes('保险') || text.includes('证券') || text.includes('券商')
}

export function mapIndustryOverrideFromShenwan(industry: string | null | undefined): number {
  const text = (industry || '').replace(/\s+/g, '')
  if (!text) return 0

  if (text.includes('银行') || text.includes('非银') || text.includes('房地产')) return 1
  if (text.includes('食品饮料') || text.includes('医药') || text.includes('生物') || text.includes('家用电器')) return 2
  if (text.includes('钢铁') || text.includes('化工') || text.includes('有色') || text.includes('采掘') || text.includes('建材') || text.includes('建筑材料')) return 3
  if (text.includes('公用事业') || text.includes('交通运输') || text.includes('公路') || text.includes('铁路') || text.includes('港口')) return 4
  if (text.includes('电子') || text.includes('计算机') || text.includes('通信') || text.includes('传媒')) return 5
  return 0
}

export function deriveMarketData(args: {
  latestDaily: DailyBasicRow
  dailyFields: string[]
  dailyBasic10yTable: { items: DailyBasicRow[]; fields: string[] }
  daily10yFields: string[]
  dailyPcf10yTable: { items: DailyPcfRow[]; fields: string[] }
  dailyPcfFields: string[]
  current: FormState
  fieldSources: FieldSources
}): {
  close: number
  peTtm: number
  dvTtm: number
  totalShareWan: number
  sharesYi: number
  pcf: number
  pePercentile5y: number
  pbPercentile5y: number
  pcfPercentile5y: number
  pePercentile10y: number
  pbPercentile10y: number
  pcfPercentile10y: number
} {
  const { latestDaily, dailyFields, dailyBasic10yTable, daily10yFields, dailyPcf10yTable, dailyPcfFields, current, fieldSources } = args

  const dailyClose = getFieldValue<number | null>(latestDaily, dailyFields, 'close')
  const dailyPeTtm = getFieldValue<number | null>(latestDaily, dailyFields, 'pe_ttm')
  const dailyDvTtm = getFieldValue<number | null>(latestDaily, dailyFields, 'dv_ttm')
  const dailyTotalShareWan = getFieldValue<number | null>(latestDaily, dailyFields, 'total_share')

  const close = normalizeNumber(dailyClose, current.price)
  const peTtm = normalizeNumber(dailyPeTtm, current.industryPE)
  const dvTtm = normalizeNumber(dailyDvTtm, 0)
  const totalShareWan = normalizeNumber(dailyTotalShareWan, current.sharesOutstanding * 10000)
  const sharesYi = totalShareWan / 10000

  if (dailyClose !== null && dailyClose !== undefined) fieldSources.price = 'auto'
  if (dailyTotalShareWan !== null && dailyTotalShareWan !== undefined) fieldSources.sharesOutstanding = 'auto'

  const peHistory = dailyBasic10yTable.items
    .map((row) => getFieldValue<number | null>(row, daily10yFields, 'pe_ttm'))
    .map((v) => normalizeNumber(v, 0))
    .filter((v) => v > 0)
  const peHistory5y = peHistory.slice(0, Math.max(1, Math.floor(peHistory.length / 2)))

  const pbHistory = dailyBasic10yTable.items
    .map((row) => getFieldValue<number | null>(row, daily10yFields, 'pb'))
    .map((v) => normalizeNumber(v, 0))
    .filter((v) => v > 0)
  const pbHistory5y = pbHistory.slice(0, Math.max(1, Math.floor(pbHistory.length / 2)))

  const pePercentile5y = current.pePercentile5y > 0 ? current.pePercentile5y : percentileRank(peTtm, peHistory5y)
  const pePercentile10y = current.pePercentile10y > 0 ? current.pePercentile10y : percentileRank(peTtm, peHistory)

  const pbCurrent = normalizeNumber(getFieldValue<number | null>(latestDaily, dailyFields, 'pb'), current.industryPB)
  const pbPercentile5y = current.pbPercentile5y > 0 ? current.pbPercentile5y : percentileRank(pbCurrent, pbHistory5y)
  const pbPercentile10y = current.pbPercentile10y > 0 ? current.pbPercentile10y : percentileRank(pbCurrent, pbHistory)

  const pcfHistory = dailyPcf10yTable.items
    .map((row) => getFieldValue<number | null>(row, dailyPcfFields, 'pcf_ncf_ttm'))
    .map((v) => normalizeNumber(v, 0))
    .filter((v) => v > 0)
  const pcfHistory5y = pcfHistory.slice(0, Math.max(1, Math.floor(pcfHistory.length / 2)))
  const pcfCurrent = pcfHistory.length ? pcfHistory[0] : current.pcf
  const pcf = current.pcf > 0 ? current.pcf : pcfCurrent

  const pcfPercentile5y = current.pcfPercentile5y > 0 ? current.pcfPercentile5y : percentileRank(pcfCurrent, pcfHistory5y)
  const pcfPercentile10y = current.pcfPercentile10y > 0 ? current.pcfPercentile10y : percentileRank(pcfCurrent, pcfHistory)

  if (current.pePercentile5y === 0 && pePercentile5y > 0) fieldSources.pePercentile5y = 'derived'
  if (current.pbPercentile5y === 0 && pbPercentile5y > 0) fieldSources.pbPercentile5y = 'derived'
  if (current.pcfPercentile5y === 0 && pcfPercentile5y > 0) fieldSources.pcfPercentile5y = 'derived'
  if (current.pePercentile10y === 0 && pePercentile10y > 0) fieldSources.pePercentile10y = 'derived'
  if (current.pbPercentile10y === 0 && pbPercentile10y > 0) fieldSources.pbPercentile10y = 'derived'
  if (current.pcfPercentile10y === 0 && pcfPercentile10y > 0) fieldSources.pcfPercentile10y = 'derived'
  if (current.pcf === 0 && pcf > 0) fieldSources.pcf = 'auto'

  return { close, peTtm, dvTtm, totalShareWan, sharesYi, pcf, pePercentile5y, pbPercentile5y, pcfPercentile5y, pePercentile10y, pbPercentile10y, pcfPercentile10y }
}