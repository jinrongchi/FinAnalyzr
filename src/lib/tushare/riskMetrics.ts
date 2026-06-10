import type { FieldSources, FormState } from '../../types'
import type { CashflowRow, CnCpiRow, DailyBasicRow, FinaIndicatorRow, IndexDailyBasicRow, IncomeRow, StkFactorRow } from './rows'
import { average, deriveMoatScore, getFieldValue, meanStd, normalizeNumber } from './utils'

const RF_RATE = 2.5
const ERP = 6.5
const DEFAULT_BETA = 1.0

export function deriveRiskMacroAndQualityData(args: {
  cashTable: { items: CashflowRow[]; fields: string[] }
  cashFields: string[]
  incomeTable: { items: IncomeRow[]; fields: string[] }
  incomeFields: string[]
  finaTable: { items: FinaIndicatorRow[]; fields: string[] }
  finaFields: string[]
  finaInvTurn: number | null | undefined
  finaArTurn: number | null | undefined
  indexDailyBasicTable: { items: IndexDailyBasicRow[]; fields: string[] }
  indexDailyFields: string[]
  stkFactorTable: { items: StkFactorRow[]; fields: string[] }
  stkFactorFields: string[]
  cpiTable: { items: CnCpiRow[]; fields: string[] }
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
  inventoryTurnoverDays: number
  arTurnoverDays: number
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
  const { cashTable, cashFields, incomeTable, incomeFields, finaTable, finaFields, finaInvTurn, finaArTurn, indexDailyBasicTable, indexDailyFields, stkFactorTable, stkFactorFields, cpiTable, latestDaily, dailyFields, current, close, peTtm, dvTtm, totalShareWan, sharesYi, eps, bvps, roic, fcfYi, derivedFcfGrowth, derivedNetDebt, balanceGoodwill, balanceOtherReceivables, balanceEquity, fieldSources, notes, addFieldNote } = args

  const ocfSeriesYi = cashTable.items.slice(0, 3).map((row) => normalizeNumber(getFieldValue<number | null>(row, cashFields, 'n_cashflow_act'), 0) / 100000000)
  const niSeriesYi = incomeTable.items.slice(0, 3).map((row) => normalizeNumber(getFieldValue<number | null>(row, incomeFields, 'n_income_attr_p'), 0) / 100000000)
  const ocfToNi3yAvg = ocfSeriesYi.length === 3 && niSeriesYi.length === 3 ? (() => {
    const ratios = ocfSeriesYi.map((ocf, i) => {
      const ni = niSeriesYi[i]
      return ni > 0 ? ocf / ni : 0
    }).filter((v) => Number.isFinite(v) && v > 0)
    return ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : current.ocfToNi3yAvg
  })() : current.ocfToNi3yAvg
  if (ocfSeriesYi.length === 3 && niSeriesYi.length === 3) fieldSources.ocfToNi3yAvg = 'derived'

  const goodwillToEquity = balanceEquity && balanceEquity > 0 ? (normalizeNumber(balanceGoodwill, 0) / balanceEquity) * 100 : current.goodwillToEquity
  const otherReceivablesToEquity = balanceEquity && balanceEquity > 0 ? (normalizeNumber(balanceOtherReceivables, 0) / balanceEquity) * 100 : current.otherReceivablesToEquity
  if (balanceEquity && balanceEquity > 0) {
    fieldSources.goodwillToEquity = 'derived'
    fieldSources.otherReceivablesToEquity = 'derived'
  }

  const invTurnSeries = finaTable.items.slice(0, 3).map((row) => normalizeNumber(getFieldValue<number | null>(row, finaFields, 'inv_turn'), 0))
  const arTurnSeries = finaTable.items.slice(0, 3).map((row) => normalizeNumber(getFieldValue<number | null>(row, finaFields, 'ar_turn'), 0))
  const invDaysSeries = invTurnSeries.map((turn) => (turn > 0 ? 365 / turn : 0)).filter((d) => d > 0)
  const arDaysSeries = arTurnSeries.map((turn) => (turn > 0 ? 365 / turn : 0)).filter((d) => d > 0)
  const inventoryTurnoverDays = invDaysSeries.length ? invDaysSeries[0] : current.inventoryTurnoverDays
  const arTurnoverDays = arDaysSeries.length ? arDaysSeries[0] : current.arTurnoverDays
  const inventoryTurnoverTrend = invDaysSeries.length >= 2 && invDaysSeries[invDaysSeries.length - 1] > 0
    ? ((invDaysSeries[0] - invDaysSeries[invDaysSeries.length - 1]) / invDaysSeries[invDaysSeries.length - 1]) * 100
    : current.inventoryTurnoverTrend
  const arTurnoverTrend = arDaysSeries.length >= 2 && arDaysSeries[arDaysSeries.length - 1] > 0
    ? ((arDaysSeries[0] - arDaysSeries[arDaysSeries.length - 1]) / arDaysSeries[arDaysSeries.length - 1]) * 100
    : current.arTurnoverTrend
  if (finaInvTurn !== null && finaInvTurn !== undefined) fieldSources.inventoryTurnoverTrend = 'derived'
  if (finaArTurn !== null && finaArTurn !== undefined) fieldSources.arTurnoverTrend = 'derived'
  if (invDaysSeries.length) fieldSources.inventoryTurnoverDays = 'derived'
  if (arDaysSeries.length) fieldSources.arTurnoverDays = 'derived'

  const latestIndex = indexDailyBasicTable.items[0]
  const indexPeTtm = normalizeNumber(getFieldValue<number | null>(latestIndex, indexDailyFields, 'pe_ttm'), 0)
  const indexEpSeries = indexDailyBasicTable.items.map((row) => normalizeNumber(getFieldValue<number | null>(row, indexDailyFields, 'pe_ttm'), 0)).filter((v) => v > 0).map((pe) => 100 / pe)
  const csi300EarningsYield = current.csi300EarningsYield > 0 ? current.csi300EarningsYield : indexPeTtm > 0 ? 100 / indexPeTtm : peTtm > 0 ? 100 / peTtm : 0
  const cn10yYield = current.cn10yYield > 0 ? current.cn10yYield : RF_RATE
  if (current.csi300EarningsYield === 0 && csi300EarningsYield > 0) {
    fieldSources.csi300EarningsYield = 'derived'
    addFieldNote('csi300EarningsYield', indexPeTtm > 0 ? '按沪深300指数 E/P 计算' : '暂无指数接口时按个股 E/P 近似，请后续替换为沪深300口径')
  }
  if (current.cn10yYield === 0) fieldSources.cn10yYield = 'default'

  const spreadSeries = indexEpSeries.map((ep) => ep - cn10yYield)
  const spreadStats = meanStd(spreadSeries)
  const equityBondSpreadMean10y = current.equityBondSpreadMean10y !== 0 ? current.equityBondSpreadMean10y : spreadStats.mean
  const equityBondSpreadStd10y = current.equityBondSpreadStd10y !== 0 ? current.equityBondSpreadStd10y : spreadStats.std
  if (current.equityBondSpreadMean10y === 0 && spreadStats.mean !== 0) fieldSources.equityBondSpreadMean10y = 'derived'
  if (current.equityBondSpreadStd10y === 0 && spreadStats.std !== 0) fieldSources.equityBondSpreadStd10y = 'derived'

  const fcfYield = current.fcfYield > 0 ? current.fcfYield : (() => { const ev = close * sharesYi + derivedNetDebt; return ev > 0 ? (fcfYi / ev) * 100 : 0 })()
  if (current.fcfYield === 0 && fcfYield > 0) fieldSources.fcfYield = 'derived'

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
    notes.push('永续增长率 g：默认 3%（长期GDP共识），建议按行业调整。')
  }

  const dividend0 = dvTtm > 0 ? close * (dvTtm / 100) : current.dividend0
  const dailyDvTtm = getFieldValue<number | null>(latestDaily, dailyFields, 'dv_ttm')
  if (dailyDvTtm !== null && dailyDvTtm !== undefined && dvTtm > 0) fieldSources.dividend0 = 'auto'

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
  const peg = current.peg > 0 ? current.peg : peTtm > 0 && pegGrowth > 0.5 ? peTtm / pegGrowth : 0
  if (current.peg === 0 && peg > 0) {
    fieldSources.peg = 'derived'
    addFieldNote('peg', `PEG=PE(${peTtm.toFixed(2)})/增长率(${pegGrowth.toFixed(2)}%)`)
  }

  const incomeSeries = incomeTable.items.map((row) => { const endDateRaw = String(getFieldValue<string | null>(row, incomeFields, 'end_date') || ''); const ni = normalizeNumber(getFieldValue<number | null>(row, incomeFields, 'n_income_attr_p'), 0); return { endDate: endDateRaw, ni } }).filter((x) => x.ni > 0 && x.endDate.length >= 8)
  const annualIncome10y = (() => {
    const byYear = new Map<string, number>()
    for (const item of incomeSeries) {
      const year = item.endDate.slice(0, 4)
      if (!byYear.has(year) && item.endDate.endsWith('1231')) byYear.set(year, item.ni)
    }
    const out = Array.from(byYear.entries()).sort((a, b) => Number(b[0]) - Number(a[0])).slice(0, 10).map(([, v]) => v)
    if (out.length >= 6) return out
    return incomeSeries.slice(0, 10).map((x) => x.ni)
  })()

  const cpiFields = cpiTable.fields
  const cpiYoySeries = cpiTable.items.map((row) => {
    const yoy = getFieldValue<number | null>(row, cpiFields, 'nt_yoy')
    if (Number.isFinite(yoy) && yoy !== null) return Number(yoy)
    const idxValue = getFieldValue<number | null>(row, cpiFields, 'nt_val')
    if (idxValue === null || idxValue === undefined || !Number.isFinite(idxValue) || idxValue <= 0) return 0
    return Number(idxValue) - 100
  }).filter((v) => Number.isFinite(v))

  const inflation = average(cpiYoySeries) / 100
  const realIncome10y = annualIncome10y.map((ni, i) => ni * Math.pow(1 + inflation, i))
  const avgRealIncome = average(realIncome10y)
  const sharesWanForCape = totalShareWan > 0 ? totalShareWan : current.sharesOutstanding * 10000
  const realEps10y = sharesWanForCape > 0 ? (avgRealIncome * 10000) / sharesWanForCape : 0
  const cape = current.cape > 0 ? current.cape : realEps10y > 0 && close > 0 ? close / realEps10y : 0

  if (current.cape === 0 && cape > 0) {
    fieldSources.cape = 'derived'
    if (cpiYoySeries.length) addFieldNote('cape', `按近10年利润并以CPI均值${(inflation * 100).toFixed(2)}%进行通胀调整估算`)
    else addFieldNote('cape', 'CPI不可用，按近10年名义利润均值估算CAPE（建议手工校准）')
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
    notes.push('治理评分：默认值 60，建议按信息披露质量手工评估。')
  }

  return { ocfToNi3yAvg, goodwillToEquity, otherReceivablesToEquity, inventoryTurnoverDays, arTurnoverDays, inventoryTurnoverTrend, arTurnoverTrend, csi300EarningsYield, cn10yYield, equityBondSpreadMean10y, equityBondSpreadStd10y, fcfYield, discountRate, terminalGrowth, dividend0, dividendGrowth, peg, cape, moatScore, governanceScore, beta }
}