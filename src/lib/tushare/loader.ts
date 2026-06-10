import type { FieldNotes, FieldSources, FormState, TushareLoadResult } from '../../types'
import { TUSHARE_CACHE_TTL_MS } from '../../config'
import { logger } from '../logger'
import { getStorage, getStorageKey } from '../storage'
import { toTsCode, tushareCall, tushareCallSafe } from './client'
import type {
  BalanceSheetRow,
  CashflowRow,
  CnCpiRow,
  DailyBasicRow,
  DailyPcfRow,
  FinaIndicatorRow,
  IncomeRow,
  IndexDailyBasicRow,
  OptionalRiskRow,
  StkFactorRow,
  StockBasicRow,
} from './rows'
import { deriveFundamentalCashflowData } from './fundamentals'
import { deriveMarketData, detectFinancialSector, detectGrowthBoard, detectPolicySensitiveIndustry, detectSTByName, mapIndustryOverrideFromShenwan, parseListedYears } from './marketData'
import { deriveOptionalRiskRatios } from './optionalRisk'
import { deriveRiskMacroAndQualityData } from './riskMetrics'
import { roundNumber } from './utils'

export { getTushareHealthUrl } from './client'

const STORAGE = getStorage()
const CACHE_PREFIX = getStorageKey('tushare.v4')
const TTL_MS = TUSHARE_CACHE_TTL_MS

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
  const startMonth = `${startDate.slice(0, 4)}01`
  const endMonth = `${endDate.slice(0, 4)}12`

  const [dailyBasicTable, dailyBasic10yTable, dailyPcf10yTable, indexDailyBasicTable, finaTable, cashTable, stockBasicTable, balanceTable, stkFactorTable, incomeTable, cpiTable, relatedTradeTable, guaranteeTable] = await Promise.all([
    tushareCall<DailyBasicRow>(trimmedToken, 'daily_basic', { ts_code: tsCode }, 'ts_code,trade_date,close,pe_ttm,pb,dv_ttm,total_share'),
    tushareCallSafe<DailyBasicRow>(trimmedToken, 'daily_basic', { ts_code: tsCode, start_date: startDate, end_date: endDate }, 'ts_code,trade_date,close,pe_ttm,pb,dv_ttm,total_share'),
    tushareCallSafe<DailyPcfRow>(trimmedToken, 'daily_basic', { ts_code: tsCode, start_date: startDate, end_date: endDate }, 'ts_code,trade_date,pcf_ncf_ttm'),
    tushareCallSafe<IndexDailyBasicRow>(trimmedToken, 'index_dailybasic', { ts_code: '000300.SH', start_date: startDate, end_date: endDate }, 'ts_code,trade_date,pe_ttm'),
    tushareCall<FinaIndicatorRow>(trimmedToken, 'fina_indicator', { ts_code: tsCode }, 'ts_code,end_date,eps,bps,ebitda,roic,debt_to_assets,ocf_to_or,n_income_attr_p,inv_turn,ar_turn'),
    tushareCall<CashflowRow>(trimmedToken, 'cashflow', { ts_code: tsCode }, 'ts_code,end_date,n_cashflow_act,n_cashflow_inv_act,free_cashflow'),
    tushareCall<StockBasicRow>(trimmedToken, 'stock_basic', { ts_code: tsCode }, 'ts_code,name,list_date,industry,market'),
    tushareCall<BalanceSheetRow>(trimmedToken, 'balancesheet', { ts_code: tsCode }, 'ts_code,end_date,monetary_cap,total_cur_liab,total_ncl,goodwill,oth_receiv,notes_receiv,total_hldr_eqy_exc_min_int'),
    tushareCallSafe<StkFactorRow>(trimmedToken, 'stk_factor', { ts_code: tsCode, fields: 'ts_code,trade_date,beta' }, 'ts_code,trade_date,beta'),
    tushareCallSafe<IncomeRow>(trimmedToken, 'income', { ts_code: tsCode }, 'ts_code,end_date,n_income_attr_p'),
    tushareCallSafe<CnCpiRow>(trimmedToken, 'cn_cpi', { start_m: startMonth, end_m: endMonth }, 'month,nt_yoy,nt_val'),
    tushareCallSafe<OptionalRiskRow>(trimmedToken, 'related_trade', { ts_code: tsCode }, 'ts_code,end_date,related_sales,related_amt,revenue,total_revenue'),
    tushareCallSafe<OptionalRiskRow>(trimmedToken, 'guarantee', { ts_code: tsCode }, 'ts_code,end_date,guarantee_amt,guarantee_balance,net_assets,total_hldr_eqy_exc_min_int'),
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
  const balanceFields = balanceTable.fields
  const stkFactorFields = stkFactorTable.fields
  const incomeFields = incomeTable.fields
  const daily10yFields = dailyBasic10yTable.fields
  const dailyPcfFields = dailyPcf10yTable.fields
  const indexDailyFields = indexDailyBasicTable.fields

  if (!latestStockBasic) {
    const fallbackStockTable = await tushareCall<StockBasicRow>(trimmedToken, 'stock_basic', { symbol: ticker.trim() }, 'ts_code,name,list_date,industry,market')
    latestStockBasic = fallbackStockTable.items[0]
    if (latestStockBasic) notes.push('stock_basic 已通过 symbol 回退查询股票名称。')
  }
  if (!latestDaily) throw new Error(`未查询到 ${tsCode} 的 daily_basic 数据`)

  const { close, peTtm, dvTtm, totalShareWan, sharesYi, pcf, pePercentile5y, pbPercentile5y, pcfPercentile5y, pePercentile10y, pbPercentile10y, pcfPercentile10y } = deriveMarketData({ latestDaily, dailyFields, dailyBasic10yTable, daily10yFields, dailyPcf10yTable, dailyPcfFields, current, fieldSources })

  const { eps, bvps, roic, deRatio, finaInvTurn, finaArTurn, ebitdaPerShare, fcfYi, fcfConversion, derivedFcfGrowth, derivedNetDebt, balanceGoodwill, balanceOtherReceivables, balanceEquity } = deriveFundamentalCashflowData({ latestFina, finaFields, latestCash, previousCash, cashFields, latestBalance, balanceFields, current, close, peTtm, totalShareWan, fieldSources, notes, addFieldNote })

  const { ocfToNi3yAvg, goodwillToEquity, otherReceivablesToEquity, inventoryTurnoverDays, arTurnoverDays, inventoryTurnoverTrend, arTurnoverTrend, csi300EarningsYield, cn10yYield, equityBondSpreadMean10y, equityBondSpreadStd10y, fcfYield, discountRate, terminalGrowth, dividend0, dividendGrowth, peg, cape, moatScore, governanceScore, beta } = deriveRiskMacroAndQualityData({ cashTable, cashFields, incomeTable, incomeFields, finaTable, finaFields, finaInvTurn, finaArTurn, indexDailyBasicTable, indexDailyFields, stkFactorTable, stkFactorFields, cpiTable, latestDaily, dailyFields, current, close, peTtm, dvTtm, totalShareWan, sharesYi, eps, bvps, roic, fcfYi, derivedFcfGrowth, derivedNetDebt, balanceGoodwill, balanceOtherReceivables, balanceEquity, fieldSources, notes, addFieldNote })

  const { relatedPartySalesToRevenue, externalGuaranteeToEquity } = deriveOptionalRiskRatios({ relatedTradeTable, guaranteeTable, current, fieldSources, addFieldNote })

  const stockName = latestStockBasic ? String((latestStockBasic[1] || '').trim() || tsCode) : tsCode
  const listDate = latestStockBasic ? latestStockBasic[2] : null
  const industry = latestStockBasic ? latestStockBasic[3] : null
  const market = latestStockBasic ? latestStockBasic[4] : null
  const listedYears = parseListedYears(listDate, new Date())
  const isST = detectSTByName(stockName) ? 1 : 0
  const isGrowthBoard = detectGrowthBoard(tsCode, market) ? 1 : 0
  const isPolicySensitive = detectPolicySensitiveIndustry(industry) ? 1 : 0
  const isFinancialSector = detectFinancialSector(industry) ? 1 : 0
  const autoIndustryOverride = mapIndustryOverrideFromShenwan(industry)
  const industryOverride = current.industryOverride > 0 ? current.industryOverride : autoIndustryOverride
  const boardRiskPremium = isGrowthBoard > 0 ? 1 : 0
  const adjustedDiscountRate = fieldSources.discountRate === 'derived' ? Math.min(15, discountRate + boardRiskPremium) : discountRate

  if (isST > 0) { notes.push('检测到 ST/*ST 风险标签，系统将按投机标的进行评分限制。'); fieldSources.isST = 'derived' }
  if (isGrowthBoard > 0) {
    notes.push('检测到创业板/科创板标的，系统将提高风险提示敏感度。')
    fieldSources.isGrowthBoard = 'derived'
    if (fieldSources.discountRate === 'derived') {
      notes.push(`成长板风险溢价：折现率在CAPM基础上上调 ${boardRiskPremium.toFixed(1)}%。`)
      addFieldNote('discountRate', `成长板风险溢价 +${boardRiskPremium.toFixed(1)}%（创业板/科创板）`)
    }
  }
  if (isPolicySensitive > 0) { notes.push('检测到政策敏感行业，建议额外关注监管变化风险。'); fieldSources.isPolicySensitive = 'derived' }
  if (isFinancialSector > 0) { notes.push('检测到金融行业，OCF/NI现金流指标将不作为硬性否决条件。'); fieldSources.isFinancialSector = 'derived' }
  if (current.industryOverride <= 0 && autoIndustryOverride > 0) { fieldSources.industryOverride = 'derived'; addFieldNote('industryOverride', `按申万行业“${industry || '未知'}”自动映射为模板${autoIndustryOverride}`) }
  if (listedYears > 0) {
    fieldSources.listedYears = 'derived'
    if (listedYears < 1) { notes.push('上市不足1年，估值不确定性极高。'); addFieldNote('listedYears', '上市不足1年，建议仅作跟踪不作核心估值依据') }
    else if (listedYears < 5) { notes.push('上市不足5年，将触发置信度惩罚。'); addFieldNote('listedYears', '上市不足5年，系统按规范下调置信度20%') }
  }

  notes.push(import.meta.env.VITE_TUSHARE_PROXY_URL ? '当前通过代理接口访问 TuShare。' : '当前通过本地 /api/tushare/proxy 访问 TuShare。')

  const result: TushareLoadResult = {
    patch: {
      ticker: tsCode,
      isST,
      isGrowthBoard,
      isPolicySensitive,
      isFinancialSector,
      industryOverride,
      listedYears: roundNumber(listedYears, 2),
      price: roundNumber(close, 2),
      eps: roundNumber(eps, 4),
      bvps: roundNumber(bvps, 4),
      sharesOutstanding: roundNumber(sharesYi, 6),
      fcf0: roundNumber(fcfYi, 4),
      fcfGrowth: roundNumber(derivedFcfGrowth, 2),
      discountRate: roundNumber(adjustedDiscountRate, 2),
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
      relatedPartySalesToRevenue: roundNumber(relatedPartySalesToRevenue, 4),
      externalGuaranteeToEquity: roundNumber(externalGuaranteeToEquity, 4),
      inventoryTurnoverDays: roundNumber(inventoryTurnoverDays, 4),
      arTurnoverDays: roundNumber(arTurnoverDays, 4),
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
    sourceTradeDate: String(dailyFields.includes('trade_date') ? latestDaily[1] : '') || '',
    stockName,
    fetchedAt: new Date().toISOString(),
  }

  writeCache(cacheKey, result)
  logger.info('TuShare fetch completed', { tsCode, sourceTradeDate: result.sourceTradeDate, stockName: result.stockName, discountRate: adjustedDiscountRate, terminalGrowth, beta })
  return result
}
