import type { FormState, TushareLoadResult } from '../types'

const DEFAULT_TUSHARE_URL = '/api/tushare/proxy'
const CACHE_PREFIX = 'finanalyzr.tushare.v1'
const TTL_MS = 1000 * 60 * 60 * 6

type TushareResponse<T> = {
  code: number
  msg: string
  data?: {
    fields: string[]
    items: T[]
  }
}

type DailyBasicRow = [
  string,
  string,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null
]

type FinaIndicatorRow = [
  string,
  string,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null
]

type CashflowRow = [
  string,
  string,
  number | null,
  number | null,
  number | null
]

type IncomeRow = [
  string,
  string,
  number | null
]

type StockBasicRow = [string, string]

type BalanceSheetRow = [
  string,
  string,
  number | null,
  number | null,
  number | null
]

function getApiUrl(): string {
  return import.meta.env.VITE_TUSHARE_PROXY_URL || DEFAULT_TUSHARE_URL
}

function toTsCode(raw: string): string {
  const clean = raw.trim().toUpperCase()
  if (clean.includes('.')) return clean
  if (clean.startsWith('6')) return `${clean}.SH`
  return `${clean}.SZ`
}

function readCache<T>(key: string): T | null {
  const raw = localStorage.getItem(key)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { expiresAt: number; value: T }
    if (Date.now() > parsed.expiresAt) {
      localStorage.removeItem(key)
      return null
    }
    return parsed.value
  } catch {
    localStorage.removeItem(key)
    return null
  }
}

function writeCache<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify({ expiresAt: Date.now() + TTL_MS, value }))
}

async function tushareCall<T>(
  token: string,
  apiName: string,
  params: Record<string, string>,
  fields: string,
): Promise<T[]> {
  console.info('[FinAnalyzr] TuShare call triggered', { apiName, params, fields })

  const body = {
    api_name: apiName,
    token,
    params,
    fields,
  }

  const response = await fetch(getApiUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`TuShare 请求失败: HTTP ${response.status}`)
  }

  const json = (await response.json()) as TushareResponse<T>
  if (json.code !== 0) {
    throw new Error(`TuShare 返回错误: ${json.msg || json.code}`)
  }

  console.info('[FinAnalyzr] TuShare call response', {
    apiName,
    code: json.code,
    rows: json.data?.items?.length || 0,
  })

  return json.data?.items || []
}

function normalizeNumber(value: number | null | undefined, fallback: number): number {
  return Number.isFinite(value) && value !== null ? Number(value) : fallback
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
    console.info('[FinAnalyzr] TuShare cache hit', { tsCode, cacheKey })
    return {
      ...cached,
      stockName: cached.stockName || tsCode,
      fetchedAt: cached.fetchedAt || new Date().toISOString(),
    }
  }

  console.info('[FinAnalyzr] TuShare fetch start', { tsCode, forceRefresh })

  const notes: string[] = []

  const [dailyBasicRows, finaRows, cashRows, stockBasicRows, balanceRows, incomeRows] = await Promise.all([
    tushareCall<DailyBasicRow>(
      trimmedToken,
      'daily_basic',
      { ts_code: tsCode },
      'ts_code,trade_date,close,pe_ttm,pb,dv_ttm,total_share',
    ),
    tushareCall<FinaIndicatorRow>(
      trimmedToken,
      'fina_indicator',
      { ts_code: tsCode },
      'ts_code,end_date,eps,bps,ebitda_to_or,roic,debt_to_assets,ocf_to_or',
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
      'ts_code,end_date,monetary_cap,total_cur_liab,total_ncl',
    ),
    tushareCall<IncomeRow>(
      trimmedToken,
      'income',
      { ts_code: tsCode },
      'ts_code,end_date,ebitda',
    ),
  ])

  const latestDaily = dailyBasicRows[0]
  const latestFina = finaRows[0]
  const latestCash = cashRows[0]
  let latestStockBasic = stockBasicRows[0]
  const latestBalance = balanceRows[0]
  const latestIncome = incomeRows[0]
  const previousCash = cashRows[1]

  if (!latestStockBasic) {
    const fallbackStockRows = await tushareCall<StockBasicRow>(
      trimmedToken,
      'stock_basic',
      { symbol: ticker.trim() },
      'ts_code,name',
    )
    latestStockBasic = fallbackStockRows[0]
    if (latestStockBasic) {
      notes.push('stock_basic 已通过 symbol 回退查询股票名称。')
    }
  }

  if (!latestDaily) {
    throw new Error(`未查询到 ${tsCode} 的 daily_basic 数据`)
  }

  const close = normalizeNumber(latestDaily[2], current.price)
  const peTtm = normalizeNumber(latestDaily[3], current.industryPE)
  const pb = normalizeNumber(latestDaily[4], current.industryPB)
  const dvTtm = normalizeNumber(latestDaily[5], 0)
  const totalShareWan = normalizeNumber(latestDaily[6], current.sharesOutstanding * 10000)

  const epsFromPe = peTtm > 0 ? close / peTtm : current.eps
  const sharesYi = totalShareWan / 10000

  const eps = latestFina ? normalizeNumber(latestFina[2], epsFromPe) : epsFromPe
  const bvps = latestFina ? normalizeNumber(latestFina[3], current.bvps) : current.bvps
  const ebitdaMargin = latestFina ? normalizeNumber(latestFina[4], 10) : 10
  const roic = latestFina ? normalizeNumber(latestFina[5], current.roic) : current.roic
  const debtToAssets = latestFina ? normalizeNumber(latestFina[6], 50) : 50
  const ocfToRevenue = latestFina ? normalizeNumber(latestFina[7], current.fcfConversion) : current.fcfConversion

  const deRatio = debtToAssets >= 99
    ? current.deRatio
    : (debtToAssets / 100) / Math.max(0.01, 1 - debtToAssets / 100)

  const freeCashflow = latestCash
    ? normalizeNumber(latestCash[4], normalizeNumber(latestCash[2], 0) - normalizeNumber(latestCash[3], 0))
    : 0

  const previousFreeCashflow = previousCash
    ? normalizeNumber(previousCash[4], normalizeNumber(previousCash[2], 0) - normalizeNumber(previousCash[3], 0))
    : 0

  const derivedFcfGrowth = previousFreeCashflow > 0 && freeCashflow > 0
    ? ((freeCashflow - previousFreeCashflow) / previousFreeCashflow) * 100
    : current.fcfGrowth

  const balanceLiabilities = latestBalance
    ? normalizeNumber(latestBalance[3], 0) + normalizeNumber(latestBalance[4], 0)
    : 0
  const balanceCash = latestBalance ? normalizeNumber(latestBalance[2], 0) : 0
  const derivedNetDebt = balanceLiabilities > 0 || balanceCash > 0
    ? (balanceLiabilities - balanceCash) / 100000000
    : current.netDebt

  const fcfYi = freeCashflow !== 0 ? freeCashflow / 100000000 : current.fcf0
  if (freeCashflow === 0) {
    notes.push('cashflow 数据中的自由现金流不可用，保留当前 FCF 输入值。')
  }

  const stockName = latestStockBasic?.[1] || tsCode
  const ebitdaPerShare = latestIncome && totalShareWan > 0
    ? normalizeNumber(latestIncome[2], 0) / (totalShareWan * 10000)
    : close * (ebitdaMargin / 100)

  if (import.meta.env.VITE_TUSHARE_PROXY_URL) {
    notes.push('当前通过代理接口访问 TuShare。')
  } else {
    notes.push('当前通过本地 /api/tushare/proxy 访问 TuShare。')
  }

  const result: TushareLoadResult = {
    patch: {
      ticker: tsCode,
      price: close,
      eps,
      bvps,
      sharesOutstanding: sharesYi,
      fcf0: fcfYi,
      fcfGrowth: derivedFcfGrowth,
      industryPE: peTtm > 0 ? peTtm : current.industryPE,
      industryPB: pb > 0 ? pb : current.industryPB,
      netDebt: derivedNetDebt,
      dividend0: dvTtm > 0 ? close * (dvTtm / 100) : current.dividend0,
      ebitdaPerShare,
      roic,
      deRatio,
      fcfConversion: ocfToRevenue,
    },
    notes,
    sourceTradeDate: latestDaily[1],
    stockName,
    fetchedAt: new Date().toISOString(),
  }

  if (latestIncome) {
    notes.push('income 数据已用于补充 EBITDA 相关字段。')
  }

  writeCache(cacheKey, result)
  console.info('[FinAnalyzr] TuShare fetch completed', {
    tsCode,
    sourceTradeDate: result.sourceTradeDate,
    stockName: result.stockName,
    derivedNetDebt: result.patch.netDebt,
    derivedFcfGrowth: result.patch.fcfGrowth,
  })
  return result
}
