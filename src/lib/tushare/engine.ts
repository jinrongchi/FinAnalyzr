import type { FieldNotes, FieldSources, FormState, TushareLoadResult } from '../../types'
import { TUSHARE_CACHE_TTL_MS } from '../../config'
import { logger } from '../logger'
import { getStorage, getStorageKey } from '../storage'
import { toTsCode, tushareCall, tushareCallSafe, type TushareTable } from '../tushareClient'
import {
  average,
  deriveMoatScore,
  getFieldValue,
  meanStd,
  normalizeNumber,
  percentileRank,
  roundNumber,
} from '../tushareUtils'

export { getTushareHealthUrl } from '../tushareClient'

const STORAGE = getStorage()
const CACHE_PREFIX = getStorageKey('tushare.v4')
const TTL_MS = TUSHARE_CACHE_TTL_MS

// China 10-yr government bond yield (approximate constant)
const RF_RATE = 2.5
// A-share equity risk premium (academic consensus)
const ERP = 6.5
// Default beta when stk_factor is unavailable
const DEFAULT_BETA = 1.0

type DailyBasicRow = [
  string,   // ts_code
  string,   // trade_date
  number | null, // close
  number | null, // pe_ttm
  number | null, // pb
  number | null, // dv_ttm
  number | null  // total_share (万股)
]

type IndexDailyBasicRow = [
  string,
  string,
  number | null, // pe_ttm
]

type DailyPcfRow = [
  string,
  string,
  number | null, // pcf_ncf_ttm
]

// Fields: ts_code,end_date,eps,bps,ebitda,roic,debt_to_assets,ocf_to_or,n_income_attr_p
type FinaIndicatorRow = [
  string,
  string,
  number | null, // eps
  number | null, // bps
  number | null, // ebitda (万元)
  number | null, // roic
  number | null, // debt_to_assets
  number | null, // ocf_to_or
  number | null, // n_income_attr_p (万元)
  number | null, // inv_turn
  number | null  // ar_turn
]

type CashflowRow = [
  string,
  string,
  number | null, // n_cashflow_act
  number | null, // n_cashflow_inv_act
  number | null  // free_cashflow
]

type StockBasicRow = [string, string]

type BalanceSheetRow = [
  string,
  string,
  number | null, // monetary_cap
  number | null, // total_cur_liab
  number | null, // total_ncl
  number | null, // goodwill
  number | null, // oth_receiv
  number | null  // total_hldr_eqy_exc_min_int
]

type IncomeRow = [
  string,
  string,
  number | null, // n_income_attr_p
]

type StkFactorRow = [
  string,        // ts_code
  string,        // trade_date
  number | null  // beta
]

type CnCpiRow = [
  string | null, // month
  number | null, // nt_yoy
  number | null  // nt_val
]

function readCache<T>(key: string): T | null {
  const raw = STORAGE.getItem(key)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { expiresAt: number; value: T }
    if (Date.now() > parsed.expiresAt) {
      STORAGE.removeItem(key)
      return null
    }
    return parsed.value
  } catch {
    STORAGE.removeItem(key)
    return null
  }
}

function writeCache<T>(key: string, value: T): void {
  STORAGE.setItem(key, JSON.stringify({ expiresAt: Date.now() + TTL_MS, value }))
}

function toYmd(value: Date): string {
  const y = value.getFullYear()
  const m = String(value.getMonth() + 1).padStart(2, '0')
  const d = String(value.getDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

function deriveMarketData(args: {
  latestDaily: DailyBasicRow
  dailyFields: string[]
  dailyBasic10yTable: TushareTable<DailyBasicRow>
  daily10yFields: string[]
  dailyPcf10yTable: TushareTable<DailyPcfRow>
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

  const pePercentile5y = current.pePercentile5y > 0
    ? current.pePercentile5y
    : percentileRank(peTtm, peHistory5y)

  const pePercentile10y = current.pePercentile10y > 0
    ? current.pePercentile10y
    : percentileRank(peTtm, peHistory)

  const pbCurrent = normalizeNumber(getFieldValue<number | null>(latestDaily, dailyFields, 'pb'), current.industryPB)
  const pbPercentile5y = current.pbPercentile5y > 0
    ? current.pbPercentile5y
    : percentileRank(pbCurrent, pbHistory5y)
  const pbPercentile10y = current.pbPercentile10y > 0
    ? current.pbPercentile10y
    : percentileRank(pbCurrent, pbHistory)

  const pcfHistory = dailyPcf10yTable.items
    .map((row) => getFieldValue<number | null>(row, dailyPcfFields, 'pcf_ncf_ttm'))
    .map((v) => normalizeNumber(v, 0))
    .filter((v) => v > 0)
  const pcfHistory5y = pcfHistory.slice(0, Math.max(1, Math.floor(pcfHistory.length / 2)))
  const pcfCurrent = pcfHistory.length ? pcfHistory[0] : current.pcf
  const pcf = current.pcf > 0 ? current.pcf : pcfCurrent

  const pcfPercentile5y = current.pcfPercentile5y > 0
    ? current.pcfPercentile5y
    : percentileRank(pcfCurrent, pcfHistory5y)
  const pcfPercentile10y = current.pcfPercentile10y > 0
    ? current.pcfPercentile10y
    : percentileRank(pcfCurrent, pcfHistory)

  if (current.pePercentile5y === 0 && pePercentile5y > 0) fieldSources.pePercentile5y = 'derived'
  if (current.pbPercentile5y === 0 && pbPercentile5y > 0) fieldSources.pbPercentile5y = 'derived'
  if (current.pcfPercentile5y === 0 && pcfPercentile5y > 0) fieldSources.pcfPercentile5y = 'derived'
  if (current.pePercentile10y === 0 && pePercentile10y > 0) fieldSources.pePercentile10y = 'derived'
  if (current.pbPercentile10y === 0 && pbPercentile10y > 0) fieldSources.pbPercentile10y = 'derived'
  if (current.pcfPercentile10y === 0 && pcfPercentile10y > 0) fieldSources.pcfPercentile10y = 'derived'
  if (current.pcf === 0 && pcf > 0) {
    fieldSources.pcf = 'auto'
  }

  return {
    close,
    peTtm,
    dvTtm,
    totalShareWan,
    sharesYi,
    pcf,
    pePercentile5y,
    pbPercentile5y,
    pcfPercentile5y,
    pePercentile10y,
    pbPercentile10y,
    pcfPercentile10y,
  }
}

function deriveFundamentalCashflowData(args: {
  latestFina: FinaIndicatorRow | undefined
  finaFields: string[]
  latestCash: CashflowRow | undefined
  previousCash: CashflowRow | undefined
  cashFields: string[]
  latestBalance: BalanceSheetRow | undefined
  balanceFields: string[]
  current: FormState
  close: number
  peTtm: number
  totalShareWan: number
  fieldSources: FieldSources
  notes: string[]
  addFieldNote: (field: keyof FormState, message: string) => void
}): {
  eps: number
  bvps: number
  roic: number
  deRatio: number
  ocfToRevenue: number
  netIncomeWan: number
  finaInvTurn: number | null | undefined
  finaArTurn: number | null | undefined
  ebitdaPerShare: number
  fcfYi: number
  fcfConversion: number
  derivedFcfGrowth: number
  derivedNetDebt: number
  balanceGoodwill: number | null | undefined
  balanceOtherReceivables: number | null | undefined
  balanceEquity: number | null | undefined
} {
  const {
    latestFina,
    finaFields,
    latestCash,
    previousCash,
    cashFields,
    latestBalance,
    balanceFields,
    current,
    close,
    peTtm,
    totalShareWan,
    fieldSources,
    notes,
    addFieldNote,
  } = args

  const epsFromPe = peTtm > 0 ? close / peTtm : current.eps

  const finaEps = getFieldValue<number | null>(latestFina, finaFields, 'eps')
  const finaBps = getFieldValue<number | null>(latestFina, finaFields, 'bps')
  const finaEbitda = getFieldValue<number | null>(latestFina, finaFields, 'ebitda')
  const finaRoic = getFieldValue<number | null>(latestFina, finaFields, 'roic')
  const finaDebtToAssets = getFieldValue<number | null>(latestFina, finaFields, 'debt_to_assets')
  const finaOcfToOr = getFieldValue<number | null>(latestFina, finaFields, 'ocf_to_or')
  const finaNetIncomeAttrP = getFieldValue<number | null>(latestFina, finaFields, 'n_income_attr_p')
  const finaInvTurn = getFieldValue<number | null>(latestFina, finaFields, 'inv_turn')
  const finaArTurn = getFieldValue<number | null>(latestFina, finaFields, 'ar_turn')

  const eps = latestFina ? normalizeNumber(finaEps, epsFromPe) : epsFromPe
  const bvps = latestFina ? normalizeNumber(finaBps, current.bvps) : current.bvps
  const ebitdaWan = latestFina ? normalizeNumber(finaEbitda, 0) : 0
  const roic = latestFina ? normalizeNumber(finaRoic, current.roic) : current.roic
  const debtToAssets = latestFina ? normalizeNumber(finaDebtToAssets, 50) : 50
  const ocfToRevenue = latestFina ? normalizeNumber(finaOcfToOr, current.fcfConversion) : current.fcfConversion
  const netIncomeWan = latestFina ? normalizeNumber(finaNetIncomeAttrP, 0) : 0

  if (finaEps !== null && finaEps !== undefined) {
    fieldSources.eps = 'auto'
  } else if (peTtm > 0 && close > 0) {
    fieldSources.eps = 'derived'
    addFieldNote('eps', 'EPS 由股价/PE 反推得到，建议后续以财报值覆盖')
  }

  if (finaBps !== null && finaBps !== undefined) {
    fieldSources.bvps = 'auto'
  }

  if (finaRoic !== null && finaRoic !== undefined) {
    fieldSources.roic = 'auto'
  }

  const deRatio = debtToAssets >= 99
    ? current.deRatio
    : (debtToAssets / 100) / Math.max(0.01, 1 - debtToAssets / 100)
  if (finaDebtToAssets !== null && finaDebtToAssets !== undefined && debtToAssets < 99) {
    fieldSources.deRatio = 'derived'
    addFieldNote('deRatio', '由资产负债率换算得到 D/E：D/E=(资产负债率)/(1-资产负债率)')
  }

  const ebitdaPerShare = ebitdaWan > 0 && totalShareWan > 0
    ? (ebitdaWan * 10000) / (totalShareWan * 10000)
    : (close * 0.15)
  if (ebitdaWan > 0) {
    fieldSources.ebitdaPerShare = 'auto'
  } else {
    const msg = 'fina_indicator 未返回 ebitda，已用股价×15%近似，建议手工校正'
    notes.push(`ebitdaPerShare：${msg}。`)
    addFieldNote('ebitdaPerShare', msg)
    fieldSources.ebitdaPerShare = 'derived'
  }

  const cashNcfOperate = getFieldValue<number | null>(latestCash, cashFields, 'n_cashflow_act')
  const cashNcfInvest = getFieldValue<number | null>(latestCash, cashFields, 'n_cashflow_inv_act')
  const cashFreeCashflow = getFieldValue<number | null>(latestCash, cashFields, 'free_cashflow')
  const prevCashNcfOperate = getFieldValue<number | null>(previousCash, cashFields, 'n_cashflow_act')
  const prevCashNcfInvest = getFieldValue<number | null>(previousCash, cashFields, 'n_cashflow_inv_act')
  const prevCashFreeCashflow = getFieldValue<number | null>(previousCash, cashFields, 'free_cashflow')

  const freeCashflow = latestCash
    ? normalizeNumber(cashFreeCashflow, normalizeNumber(cashNcfOperate, 0) - normalizeNumber(cashNcfInvest, 0))
    : 0
  const previousFreeCashflow = previousCash
    ? normalizeNumber(prevCashFreeCashflow, normalizeNumber(prevCashNcfOperate, 0) - normalizeNumber(prevCashNcfInvest, 0))
    : 0

  const hasCashflowData = Boolean(
    latestCash
      && (cashNcfOperate !== null || cashNcfInvest !== null || cashFreeCashflow !== null)
      && (cashNcfOperate !== undefined || cashNcfInvest !== undefined || cashFreeCashflow !== undefined),
  )
  const fcfYi = hasCashflowData ? freeCashflow / 100000000 : current.fcf0
  if (hasCashflowData) {
    fieldSources.fcf0 = 'auto'
  } else {
    notes.push('cashflow 数据中的自由现金流不可用，保留当前 FCF 输入值。')
  }

  const derivedFcfGrowth = previousFreeCashflow > 0 && freeCashflow > 0
    ? ((freeCashflow - previousFreeCashflow) / previousFreeCashflow) * 100
    : current.fcfGrowth
  if (previousFreeCashflow > 0 && freeCashflow > 0) {
    fieldSources.fcfGrowth = 'derived'
  }

  const balanceMonetaryCap = getFieldValue<number | null>(latestBalance, balanceFields, 'monetary_cap')
  const balanceCurLiab = getFieldValue<number | null>(latestBalance, balanceFields, 'total_cur_liab')
  const balanceNonCurLiab = getFieldValue<number | null>(latestBalance, balanceFields, 'total_ncl')
  const balanceGoodwill = getFieldValue<number | null>(latestBalance, balanceFields, 'goodwill')
  const balanceOtherReceivables = getFieldValue<number | null>(latestBalance, balanceFields, 'oth_receiv')
  const balanceEquity = getFieldValue<number | null>(latestBalance, balanceFields, 'total_hldr_eqy_exc_min_int')

  const balanceLiabilities = latestBalance
    ? normalizeNumber(balanceCurLiab, 0) + normalizeNumber(balanceNonCurLiab, 0)
    : 0
  const balanceCash = latestBalance ? normalizeNumber(balanceMonetaryCap, 0) : 0
  const derivedNetDebt = balanceLiabilities > 0 || balanceCash > 0
    ? (balanceLiabilities - balanceCash) / 100000000
    : current.netDebt

  const hasBalanceData = Boolean(
    latestBalance
      && (balanceMonetaryCap !== undefined || balanceCurLiab !== undefined || balanceNonCurLiab !== undefined)
      && (balanceMonetaryCap !== null || balanceCurLiab !== null || balanceNonCurLiab !== null),
  )
  if (hasBalanceData) {
    fieldSources.netDebt = 'derived'
    addFieldNote('netDebt', '净负债=流动负债+非流动负债-货币资金（单位换算为亿元）')
    if (balanceMonetaryCap === null || balanceMonetaryCap === undefined) {
      addFieldNote('netDebt', 'balancesheet 未返回货币资金，已按 0 估算，建议手工校正')
    }
  }

  const netIncomeYi = netIncomeWan / 10000
  const fcfConversion = netIncomeYi > 0 && fcfYi !== 0
    ? (fcfYi / netIncomeYi) * 100
    : ocfToRevenue
  if (netIncomeYi > 0 && fcfYi !== 0) {
    fieldSources.fcfConversion = 'derived'
    const msg = 'FCF转化率=自由现金流/归母净利润×100%'
    notes.push(`${msg}。`)
    addFieldNote('fcfConversion', msg)
  } else if (finaOcfToOr !== null && finaOcfToOr !== undefined) {
    fieldSources.fcfConversion = 'derived'
    const msg = '使用 OCF/营收 近似，net_income 数据缺失'
    notes.push(`FCF 转化率${msg}。`)
    addFieldNote('fcfConversion', msg)
  }

  return {
    eps,
    bvps,
    roic,
    deRatio,
    ocfToRevenue,
    netIncomeWan,
    finaInvTurn,
    finaArTurn,
    ebitdaPerShare,
    fcfYi,
    fcfConversion,
    derivedFcfGrowth,
    derivedNetDebt,
    balanceGoodwill,
    balanceOtherReceivables,
    balanceEquity,
  }
}

function deriveRiskMacroAndQualityData(args: {
  cashTable: TushareTable<CashflowRow>
  cashFields: string[]
  incomeTable: TushareTable<IncomeRow>
  incomeFields: string[]
  finaTable: TushareTable<FinaIndicatorRow>
  finaFields: string[]
  finaInvTurn: number | null | undefined
  finaArTurn: number | null | undefined
  indexDailyBasicTable: TushareTable<IndexDailyBasicRow>
  indexDailyFields: string[]
  stkFactorTable: TushareTable<StkFactorRow>
  stkFactorFields: string[]
  cpiTable: TushareTable<CnCpiRow>
  latestDaily: DailyBasicRow
  dailyFields: string[]
  current: FormState
  close: number
  peTtm: number
  dvTtm: number
  totalShareWan: number
  sharesYi: number
  eps: number
  bvps: number
  roic: number
  fcfYi: number
  derivedFcfGrowth: number
  derivedNetDebt: number
  balanceGoodwill: number | null | undefined
  balanceOtherReceivables: number | null | undefined
  balanceEquity: number | null | undefined
  fieldSources: FieldSources
  notes: string[]
  addFieldNote: (field: keyof FormState, message: string) => void
}): {
  ocfToNi3yAvg: number
  goodwillToEquity: number
  otherReceivablesToEquity: number
  inventoryTurnoverTrend: number
  arTurnoverTrend: number
  csi300EarningsYield: number
  cn10yYield: number
  equityBondSpreadMean10y: number
  equityBondSpreadStd10y: number
  fcfYield: number
  discountRate: number
  terminalGrowth: number
  dividend0: number
  dividendGrowth: number
  peg: number
  cape: number
  moatScore: number
  governanceScore: number
  beta: number
} {
  const {
    cashTable,
    cashFields,
    incomeTable,
    incomeFields,
    finaTable,
    finaFields,
    finaInvTurn,
    finaArTurn,
    indexDailyBasicTable,
    indexDailyFields,
    stkFactorTable,
    stkFactorFields,
    cpiTable,
    latestDaily,
    dailyFields,
    current,
    close,
    peTtm,
    dvTtm,
    totalShareWan,
    sharesYi,
    eps,
    bvps,
    roic,
    fcfYi,
    derivedFcfGrowth,
    derivedNetDebt,
    balanceGoodwill,
    balanceOtherReceivables,
    balanceEquity,
    fieldSources,
    notes,
    addFieldNote,
  } = args

  const ocfSeriesYi = cashTable.items.slice(0, 3).map((row) => {
    const ocf = getFieldValue<number | null>(row, cashFields, 'n_cashflow_act')
    return normalizeNumber(ocf, 0) / 100000000
  })
  const niSeriesYi = incomeTable.items.slice(0, 3).map((row) => {
    const ni = getFieldValue<number | null>(row, incomeFields, 'n_income_attr_p')
    return normalizeNumber(ni, 0) / 100000000
  })
  const ocfToNi3yAvg = ocfSeriesYi.length === 3 && niSeriesYi.length === 3
    ? (() => {
        const ratios = ocfSeriesYi.map((ocf, i) => {
          const ni = niSeriesYi[i]
          return ni > 0 ? ocf / ni : 0
        }).filter((v) => Number.isFinite(v) && v > 0)
        return ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : current.ocfToNi3yAvg
      })()
    : current.ocfToNi3yAvg
  if (ocfSeriesYi.length === 3 && niSeriesYi.length === 3) {
    fieldSources.ocfToNi3yAvg = 'derived'
  }

  const goodwillToEquity = balanceEquity && balanceEquity > 0
    ? (normalizeNumber(balanceGoodwill, 0) / balanceEquity) * 100
    : current.goodwillToEquity
  const otherReceivablesToEquity = balanceEquity && balanceEquity > 0
    ? (normalizeNumber(balanceOtherReceivables, 0) / balanceEquity) * 100
    : current.otherReceivablesToEquity
  if (balanceEquity && balanceEquity > 0) {
    fieldSources.goodwillToEquity = 'derived'
    fieldSources.otherReceivablesToEquity = 'derived'
  }

  const invTurnSeries = finaTable.items.slice(0, 3).map((row) => normalizeNumber(getFieldValue<number | null>(row, finaFields, 'inv_turn'), 0))
  const arTurnSeries = finaTable.items.slice(0, 3).map((row) => normalizeNumber(getFieldValue<number | null>(row, finaFields, 'ar_turn'), 0))
  const inventoryTurnoverTrend = invTurnSeries.length >= 2 && invTurnSeries[invTurnSeries.length - 1] > 0
    ? ((invTurnSeries[0] - invTurnSeries[invTurnSeries.length - 1]) / invTurnSeries[invTurnSeries.length - 1]) * 100
    : current.inventoryTurnoverTrend
  const arTurnoverTrend = arTurnSeries.length >= 2 && arTurnSeries[arTurnSeries.length - 1] > 0
    ? ((arTurnSeries[0] - arTurnSeries[arTurnSeries.length - 1]) / arTurnSeries[arTurnSeries.length - 1]) * 100
    : current.arTurnoverTrend
  if (finaInvTurn !== null && finaInvTurn !== undefined) fieldSources.inventoryTurnoverTrend = 'derived'
  if (finaArTurn !== null && finaArTurn !== undefined) fieldSources.arTurnoverTrend = 'derived'

  const latestIndex = indexDailyBasicTable.items[0]
  const indexPeTtm = normalizeNumber(getFieldValue<number | null>(latestIndex, indexDailyFields, 'pe_ttm'), 0)
  const indexEpSeries = indexDailyBasicTable.items
    .map((row) => normalizeNumber(getFieldValue<number | null>(row, indexDailyFields, 'pe_ttm'), 0))
    .filter((v) => v > 0)
    .map((pe) => 100 / pe)
  const csi300EarningsYield = current.csi300EarningsYield > 0
    ? current.csi300EarningsYield
    : indexPeTtm > 0 ? 100 / indexPeTtm : peTtm > 0 ? 100 / peTtm : 0
  const cn10yYield = current.cn10yYield > 0 ? current.cn10yYield : RF_RATE
  if (current.csi300EarningsYield === 0 && csi300EarningsYield > 0) {
    fieldSources.csi300EarningsYield = 'derived'
    addFieldNote('csi300EarningsYield', indexPeTtm > 0 ? '按沪深300指数 E/P 计算' : '暂无指数接口时按个股 E/P 近似，请后续替换为沪深300口径')
  }
  if (current.cn10yYield === 0) {
    fieldSources.cn10yYield = 'default'
  }

  const spreadSeries = indexEpSeries.map((ep) => ep - cn10yYield)
  const spreadStats = meanStd(spreadSeries)
  const equityBondSpreadMean10y = current.equityBondSpreadMean10y !== 0
    ? current.equityBondSpreadMean10y
    : spreadStats.mean
  const equityBondSpreadStd10y = current.equityBondSpreadStd10y !== 0
    ? current.equityBondSpreadStd10y
    : spreadStats.std
  if (current.equityBondSpreadMean10y === 0 && spreadStats.mean !== 0) {
    fieldSources.equityBondSpreadMean10y = 'derived'
  }
  if (current.equityBondSpreadStd10y === 0 && spreadStats.std !== 0) {
    fieldSources.equityBondSpreadStd10y = 'derived'
  }

  const fcfYield = current.fcfYield > 0
    ? current.fcfYield
    : (() => {
        const ev = close * sharesYi + derivedNetDebt
        return ev > 0 ? (fcfYi / ev) * 100 : 0
      })()
  if (current.fcfYield === 0 && fcfYield > 0) {
    fieldSources.fcfYield = 'derived'
  }

  const betaRow = stkFactorTable.items[0]
  const betaValue = getFieldValue<number | null>(betaRow, stkFactorFields, 'beta')
  const beta = betaRow ? normalizeNumber(betaValue, DEFAULT_BETA) : DEFAULT_BETA
  const betaSource = betaRow && betaValue !== null && betaValue !== undefined ? 'stk_factor' : 'fallback β=1.0'

  if (!betaRow || betaValue === null || betaValue === undefined) {
    const msg = `Beta 数据不可用（${betaSource}），折现率按 β=1.0 估算，建议补充`
    notes.push(`${msg}。`)
    addFieldNote('discountRate', msg)
  }

  const capmRate = Math.min(15, Math.max(7, RF_RATE + beta * ERP))
  const discountRate = current.discountRate > 0 ? current.discountRate : capmRate
  if (current.discountRate === 0) {
    fieldSources.discountRate = 'derived'
    const msg = `CAPM: ${RF_RATE}% + β(${beta.toFixed(2)})×${ERP}% = ${capmRate.toFixed(1)}%`
    notes.push(`折现率 r：${msg}（来源：${betaSource}）。`)
    addFieldNote('discountRate', msg)
  }

  const terminalGrowth = current.terminalGrowth !== 0 ? current.terminalGrowth : 3.0
  if (current.terminalGrowth === 0) {
    fieldSources.terminalGrowth = 'default'
    const msg = '默认 3%（长期GDP共识），建议按行业调整'
    notes.push(`永续增长率 g：${msg}。`)
  }

  const dividend0 = dvTtm > 0 ? close * (dvTtm / 100) : current.dividend0
  const dailyDvTtm = getFieldValue<number | null>(latestDaily, dailyFields, 'dv_ttm')
  if (dailyDvTtm !== null && dailyDvTtm !== undefined && dvTtm > 0) {
    fieldSources.dividend0 = 'auto'
  }

  let dividendGrowth = current.dividendGrowth
  if (dividendGrowth === 0 && eps > 0 && bvps > 0 && dividend0 > 0) {
    const roe = eps / bvps
    const payoutRatio = Math.min(1, Math.max(0, dividend0 / eps))
    dividendGrowth = roe * (1 - payoutRatio) * 100
    fieldSources.dividendGrowth = 'derived'
    const msg = `ROE×(1-股息支付率)=${dividendGrowth.toFixed(1)}%`
    notes.push(`股息增长率 g1：${msg}。`)
    addFieldNote('dividendGrowth', msg)
  }

  const pegGrowth = dividendGrowth > 0 ? dividendGrowth : derivedFcfGrowth > 0 ? derivedFcfGrowth : 0
  const peg = current.peg > 0
    ? current.peg
    : peTtm > 0 && pegGrowth > 0.5
      ? peTtm / pegGrowth
      : 0
  if (current.peg === 0 && peg > 0) {
    fieldSources.peg = 'derived'
    addFieldNote('peg', `PEG=PE(${peTtm.toFixed(2)})/增长率(${pegGrowth.toFixed(2)}%)`)
  }

  const incomeSeries = incomeTable.items
    .map((row) => {
      const endDateRaw = String(getFieldValue<string | null>(row, incomeFields, 'end_date') || '')
      const ni = normalizeNumber(getFieldValue<number | null>(row, incomeFields, 'n_income_attr_p'), 0)
      return { endDate: endDateRaw, ni }
    })
    .filter((x) => x.ni > 0 && x.endDate.length >= 8)

  const annualIncome10y = (() => {
    const byYear = new Map<string, number>()
    for (const item of incomeSeries) {
      const year = item.endDate.slice(0, 4)
      if (!byYear.has(year) && item.endDate.endsWith('1231')) {
        byYear.set(year, item.ni)
      }
    }
    const out = Array.from(byYear.entries())
      .sort((a, b) => Number(b[0]) - Number(a[0]))
      .slice(0, 10)
      .map(([, v]) => v)

    if (out.length >= 6) return out
    return incomeSeries.slice(0, 10).map((x) => x.ni)
  })()

  const cpiFields = cpiTable.fields
  const cpiYoySeries = cpiTable.items
    .map((row) => {
      const yoy = getFieldValue<number | null>(row, cpiFields, 'nt_yoy')
      if (Number.isFinite(yoy) && yoy !== null) return Number(yoy)
      const idx = getFieldValue<number | null>(row, cpiFields, 'nt_val')
      if (!Number.isFinite(idx) || idx === null || idx <= 0) return 0
      return Number(idx) - 100
    })
    .filter((v) => Number.isFinite(v))

  const inflation = average(cpiYoySeries) / 100
  const realIncome10y = annualIncome10y.map((ni, i) => ni * Math.pow(1 + inflation, i))
  const avgRealIncome = average(realIncome10y)
  const sharesWanForCape = totalShareWan > 0 ? totalShareWan : current.sharesOutstanding * 10000
  const realEps10y = sharesWanForCape > 0 ? (avgRealIncome * 10000) / sharesWanForCape : 0
  const cape = current.cape > 0
    ? current.cape
    : realEps10y > 0 && close > 0
      ? close / realEps10y
      : 0

  if (current.cape === 0 && cape > 0) {
    fieldSources.cape = 'derived'
    if (cpiYoySeries.length) {
      addFieldNote('cape', `按近10年利润并以CPI均值${(inflation * 100).toFixed(2)}%进行通胀调整估算`)
    } else {
      addFieldNote('cape', 'CPI不可用，按近10年名义利润均值估算CAPE（建议手工校准）')
    }
  }

  const moatScore = current.moatScore > 0 ? current.moatScore : deriveMoatScore(roic)
  if (current.moatScore === 0) {
    fieldSources.moatScore = 'derived'
    const msg = `按 ROIC(${roic.toFixed(1)}%) 启发式推算=${moatScore}，建议手工校准`
    notes.push(`护城河评分：${msg}。`)
    addFieldNote('moatScore', msg)
  }

  const governanceScore = current.governanceScore > 0 ? current.governanceScore : 60
  if (current.governanceScore === 0) {
    fieldSources.governanceScore = 'default'
    const msg = '默认值 60，建议按信息披露质量手工评估'
    notes.push(`治理评分：${msg}。`)
  }

  return {
    ocfToNi3yAvg,
    goodwillToEquity,
    otherReceivablesToEquity,
    inventoryTurnoverTrend,
    arTurnoverTrend,
    csi300EarningsYield,
    cn10yYield,
    equityBondSpreadMean10y,
    equityBondSpreadStd10y,
    fcfYield,
    discountRate,
    terminalGrowth,
    dividend0,
    dividendGrowth,
    peg,
    cape,
    moatScore,
    governanceScore,
    beta,
  }
}

export async function loadFromTushare(
  token: string,
  ticker: string,
  current: FormState,
  options?: { forceRefresh?: boolean },
): Promise<TushareLoadResult> {
  const trimmedToken = token.trim()
  const forceRefresh = options?.forceRefresh === true

  const tsCode = toTsCode(ticker)
  const cacheKey = `${CACHE_PREFIX}:${tsCode}`
  const cached = forceRefresh ? null : readCache<TushareLoadResult>(cacheKey)
  if (cached) {
    logger.info('TuShare cache hit', { tsCode, cacheKey })
    return {
      ...cached,
      fieldSources: cached.fieldSources || {},
      fieldNotes: cached.fieldNotes || {},
      stockName: cached.stockName || tsCode,
      fetchedAt: cached.fetchedAt || new Date().toISOString(),
    }
  }

  logger.info('TuShare fetch start', { tsCode, forceRefresh })

  const notes: string[] = []
  const fieldSources: FieldSources = {}
  const fieldNotes: FieldNotes = {}

  function addFieldNote(field: keyof FormState, message: string): void {
    fieldNotes[field] = fieldNotes[field] ? `${fieldNotes[field]}；${message}` : message
  }

  const endDate = toYmd(new Date())
  const startDate = toYmd(new Date(Date.now() - 3650 * 24 * 60 * 60 * 1000))

  // Fetch all APIs in parallel; extra history/index calls use safe variant for graceful degradation.
  const startMonth = `${startDate.slice(0, 4)}01`
  const endMonth = `${endDate.slice(0, 4)}12`

  const [dailyBasicTable, dailyBasic10yTable, dailyPcf10yTable, indexDailyBasicTable, finaTable, cashTable, stockBasicTable, balanceTable, stkFactorTable, incomeTable, cpiTable] = await Promise.all([
    tushareCall<DailyBasicRow>(
      trimmedToken,
      'daily_basic',
      { ts_code: tsCode },
      'ts_code,trade_date,close,pe_ttm,pb,dv_ttm,total_share',
    ),
    tushareCallSafe<DailyBasicRow>(
      trimmedToken,
      'daily_basic',
      { ts_code: tsCode, start_date: startDate, end_date: endDate },
      'ts_code,trade_date,close,pe_ttm,pb,dv_ttm,total_share',
    ),
    tushareCallSafe<DailyPcfRow>(
      trimmedToken,
      'daily_basic',
      { ts_code: tsCode, start_date: startDate, end_date: endDate },
      'ts_code,trade_date,pcf_ncf_ttm',
    ),
    tushareCallSafe<IndexDailyBasicRow>(
      trimmedToken,
      'index_dailybasic',
      { ts_code: '000300.SH', start_date: startDate, end_date: endDate },
      'ts_code,trade_date,pe_ttm',
    ),
    tushareCall<FinaIndicatorRow>(
      trimmedToken,
      'fina_indicator',
      { ts_code: tsCode },
      'ts_code,end_date,eps,bps,ebitda,roic,debt_to_assets,ocf_to_or,n_income_attr_p,inv_turn,ar_turn',
    ),
    tushareCall<CashflowRow>(
      trimmedToken,
      'cashflow',
      { ts_code: tsCode },
      'ts_code,end_date,n_cashflow_act,n_cashflow_inv_act,free_cashflow',
    ),
    tushareCall<StockBasicRow>(
      trimmedToken,
      'stock_basic',
      { ts_code: tsCode },
      'ts_code,name',
    ),
    tushareCall<BalanceSheetRow>(
      trimmedToken,
      'balancesheet',
      { ts_code: tsCode },
      'ts_code,end_date,monetary_cap,total_cur_liab,total_ncl,goodwill,oth_receiv,total_hldr_eqy_exc_min_int',
    ),
    tushareCallSafe<StkFactorRow>(
      trimmedToken,
      'stk_factor',
      { ts_code: tsCode, fields: 'ts_code,trade_date,beta' },
      'ts_code,trade_date,beta',
    ),
    tushareCallSafe<IncomeRow>(
      trimmedToken,
      'income',
      { ts_code: tsCode },
      'ts_code,end_date,n_income_attr_p',
    ),
    tushareCallSafe<CnCpiRow>(
      trimmedToken,
      'cn_cpi',
      { start_m: startMonth, end_m: endMonth },
      'month,nt_yoy,nt_val',
    ),
  ])

  const latestDaily = dailyBasicTable.items[0]
  const latestFina = finaTable.items[0]
  const latestCash = cashTable.items[0]
  let latestStockBasic = stockBasicTable.items[0]
  const latestBalance = balanceTable.items[0]
  const previousCash = cashTable.items[1]

  const dailyFields = dailyBasicTable.fields
  const finaFields = finaTable.fields
  const cashFields = cashTable.fields
  const stockBasicFields = stockBasicTable.fields
  const balanceFields = balanceTable.fields
  const stkFactorFields = stkFactorTable.fields
  const incomeFields = incomeTable.fields
  const daily10yFields = dailyBasic10yTable.fields
  const dailyPcfFields = dailyPcf10yTable.fields
  const indexDailyFields = indexDailyBasicTable.fields

  if (!latestStockBasic) {
    const fallbackStockTable = await tushareCall<StockBasicRow>(
      trimmedToken,
      'stock_basic',
      { symbol: ticker.trim() },
      'ts_code,name',
    )
    latestStockBasic = fallbackStockTable.items[0]
    if (latestStockBasic) {
      notes.push('stock_basic 已通过 symbol 回退查询股票名称。')
    }
  }

  if (!latestDaily) {
    throw new Error(`未查询到 ${tsCode} 的 daily_basic 数据`)
  }

  // ── Market data ────────────────────────────────────────────────────────────
  const {
    close,
    peTtm,
    dvTtm,
    totalShareWan,
    sharesYi,
    pcf,
    pePercentile5y,
    pbPercentile5y,
    pcfPercentile5y,
    pePercentile10y,
    pbPercentile10y,
    pcfPercentile10y,
  } = deriveMarketData({
    latestDaily,
    dailyFields,
    dailyBasic10yTable,
    daily10yFields,
    dailyPcf10yTable,
    dailyPcfFields,
    current,
    fieldSources,
  })



  // ── Fundamental indicators ─────────────────────────────────────────────────
  const {
    eps,
    bvps,
    roic,
    deRatio,
    finaInvTurn,
    finaArTurn,
    ebitdaPerShare,
    fcfYi,
    fcfConversion,
    derivedFcfGrowth,
    derivedNetDebt,
    balanceGoodwill,
    balanceOtherReceivables,
    balanceEquity,
  } = deriveFundamentalCashflowData({
    latestFina,
    finaFields,
    latestCash,
    previousCash,
    cashFields,
    latestBalance,
    balanceFields,
    current,
    close,
    peTtm,
    totalShareWan,
    fieldSources,
    notes,
    addFieldNote,
  })

  const {
    ocfToNi3yAvg,
    goodwillToEquity,
    otherReceivablesToEquity,
    inventoryTurnoverTrend,
    arTurnoverTrend,
    csi300EarningsYield,
    cn10yYield,
    equityBondSpreadMean10y,
    equityBondSpreadStd10y,
    fcfYield,
    discountRate,
    terminalGrowth,
    dividend0,
    dividendGrowth,
    peg,
    cape,
    moatScore,
    governanceScore,
    beta,
  } = deriveRiskMacroAndQualityData({
    cashTable,
    cashFields,
    incomeTable,
    incomeFields,
    finaTable,
    finaFields,
    finaInvTurn,
    finaArTurn,
    indexDailyBasicTable,
    indexDailyFields,
    stkFactorTable,
    stkFactorFields,
    cpiTable,
    latestDaily,
    dailyFields,
    current,
    close,
    peTtm,
    dvTtm,
    totalShareWan,
    sharesYi,
    eps,
    bvps,
    roic,
    fcfYi,
    derivedFcfGrowth,
    derivedNetDebt,
    balanceGoodwill,
    balanceOtherReceivables,
    balanceEquity,
    fieldSources,
    notes,
    addFieldNote,
  })

  const stockName = getFieldValue<string>(latestStockBasic, stockBasicFields, 'name') || tsCode

  if (import.meta.env.VITE_TUSHARE_PROXY_URL) {
    notes.push('当前通过代理接口访问 TuShare。')
  } else {
    notes.push('当前通过本地 /api/tushare/proxy 访问 TuShare。')
  }

  const result: TushareLoadResult = {
    patch: {
      ticker: tsCode,
      price: roundNumber(close, 2),
      eps: roundNumber(eps, 4),
      bvps: roundNumber(bvps, 4),
      sharesOutstanding: roundNumber(sharesYi, 6),
      fcf0: roundNumber(fcfYi, 4),
      fcfGrowth: roundNumber(derivedFcfGrowth, 2),
      discountRate: roundNumber(discountRate, 2),
      terminalGrowth: roundNumber(terminalGrowth, 2),
      industryPE: current.industryPE,
      industryPB: current.industryPB,
      netDebt: roundNumber(derivedNetDebt, 4),
      ebitdaPerShare: roundNumber(ebitdaPerShare, 4),
      roic: roundNumber(roic, 4),
      deRatio: roundNumber(deRatio, 4),
      fcfConversion: roundNumber(fcfConversion, 4),
      dividend0: roundNumber(dividend0, 4),
      dividendGrowth: roundNumber(dividendGrowth, 2),
      moatScore: roundNumber(moatScore, 0),
      governanceScore: roundNumber(governanceScore, 0),
      ocfToNi3yAvg: roundNumber(ocfToNi3yAvg, 4),
      goodwillToEquity: roundNumber(goodwillToEquity, 4),
      otherReceivablesToEquity: roundNumber(otherReceivablesToEquity, 4),
      inventoryTurnoverTrend: roundNumber(inventoryTurnoverTrend, 4),
      arTurnoverTrend: roundNumber(arTurnoverTrend, 4),
      csi300EarningsYield: roundNumber(csi300EarningsYield, 4),
      cn10yYield: roundNumber(cn10yYield, 4),
      peg: roundNumber(peg, 4),
      cape: roundNumber(cape, 4),
      pcf: roundNumber(pcf, 4),
      pePercentile5y: roundNumber(pePercentile5y, 2),
      pbPercentile5y: roundNumber(pbPercentile5y, 2),
      pcfPercentile5y: roundNumber(pcfPercentile5y, 2),
      pePercentile10y: roundNumber(pePercentile10y, 2),
      pbPercentile10y: roundNumber(pbPercentile10y, 2),
      pcfPercentile10y: roundNumber(pcfPercentile10y, 2),
      fcfYield: roundNumber(fcfYield, 4),
      equityBondSpreadMean10y: roundNumber(equityBondSpreadMean10y, 4),
      equityBondSpreadStd10y: roundNumber(equityBondSpreadStd10y, 4),
    },
    fieldSources,
    fieldNotes,
    notes,
    sourceTradeDate: getFieldValue<string>(latestDaily, dailyFields, 'trade_date') || '',
    stockName,
    fetchedAt: new Date().toISOString(),
  }

  writeCache(cacheKey, result)
  logger.info('TuShare fetch completed', {
    tsCode,
    sourceTradeDate: result.sourceTradeDate,
    stockName: result.stockName,
    discountRate,
    terminalGrowth,
    beta,
  })
  return result
}
