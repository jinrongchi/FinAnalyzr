import type { FieldSources, FormState } from '../../types'
import type { BalanceSheetRow, CashflowRow, FinaIndicatorRow } from './rows'
import { getFieldValue, normalizeNumber } from './utils'

export function deriveFundamentalCashflowData(args: {
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
  const { latestFina, finaFields, latestCash, previousCash, cashFields, latestBalance, balanceFields, current, close, peTtm, totalShareWan, fieldSources, notes, addFieldNote } = args

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

  if (finaBps !== null && finaBps !== undefined) fieldSources.bvps = 'auto'
  if (finaRoic !== null && finaRoic !== undefined) fieldSources.roic = 'auto'

  const deRatio = debtToAssets >= 99
    ? current.deRatio
    : (debtToAssets / 100) / Math.max(0.01, 1 - debtToAssets / 100)
  if (finaDebtToAssets !== null && finaDebtToAssets !== undefined && debtToAssets < 99) {
    fieldSources.deRatio = 'derived'
    addFieldNote('deRatio', '由资产负债率换算得到 D/E：D/E=(资产负债率)/(1-资产负债率)')
  }

  const ebitdaPerShare = ebitdaWan > 0 && totalShareWan > 0 ? (ebitdaWan * 10000) / (totalShareWan * 10000) : (close * 0.15)
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

  const freeCashflow = latestCash ? normalizeNumber(cashFreeCashflow, normalizeNumber(cashNcfOperate, 0) - normalizeNumber(cashNcfInvest, 0)) : 0
  const previousFreeCashflow = previousCash ? normalizeNumber(prevCashFreeCashflow, normalizeNumber(prevCashNcfOperate, 0) - normalizeNumber(prevCashNcfInvest, 0)) : 0

  const hasCashflowData = Boolean(latestCash && (cashNcfOperate !== null || cashNcfInvest !== null || cashFreeCashflow !== null) && (cashNcfOperate !== undefined || cashNcfInvest !== undefined || cashFreeCashflow !== undefined))
  const fcfYi = hasCashflowData ? freeCashflow / 100000000 : current.fcf0
  if (hasCashflowData) fieldSources.fcf0 = 'auto'
  else notes.push('cashflow 数据中的自由现金流不可用，保留当前 FCF 输入值。')

  const derivedFcfGrowth = previousFreeCashflow > 0 && freeCashflow > 0 ? ((freeCashflow - previousFreeCashflow) / previousFreeCashflow) * 100 : current.fcfGrowth
  if (previousFreeCashflow > 0 && freeCashflow > 0) fieldSources.fcfGrowth = 'derived'

  const balanceMonetaryCap = getFieldValue<number | null>(latestBalance, balanceFields, 'monetary_cap')
  const balanceCurLiab = getFieldValue<number | null>(latestBalance, balanceFields, 'total_cur_liab')
  const balanceNonCurLiab = getFieldValue<number | null>(latestBalance, balanceFields, 'total_ncl')
  const balanceGoodwill = getFieldValue<number | null>(latestBalance, balanceFields, 'goodwill')
  const balanceOtherReceivables = getFieldValue<number | null>(latestBalance, balanceFields, 'oth_receiv')
  const balanceEquity = getFieldValue<number | null>(latestBalance, balanceFields, 'total_hldr_eqy_exc_min_int')

  const balanceLiabilities = latestBalance ? normalizeNumber(balanceCurLiab, 0) + normalizeNumber(balanceNonCurLiab, 0) : 0
  const balanceCash = latestBalance ? normalizeNumber(balanceMonetaryCap, 0) : 0
  const derivedNetDebt = balanceLiabilities > 0 || balanceCash > 0 ? (balanceLiabilities - balanceCash) / 100000000 : current.netDebt

  const hasBalanceData = Boolean(latestBalance && (balanceMonetaryCap !== undefined || balanceCurLiab !== undefined || balanceNonCurLiab !== undefined) && (balanceMonetaryCap !== null || balanceCurLiab !== null || balanceNonCurLiab !== null))
  if (hasBalanceData) {
    fieldSources.netDebt = 'derived'
    addFieldNote('netDebt', '净负债=流动负债+非流动负债-货币资金（单位换算为亿元）')
    if (balanceMonetaryCap === null || balanceMonetaryCap === undefined) {
      addFieldNote('netDebt', 'balancesheet 未返回货币资金，已按 0 估算，建议手工校正')
    }
  }

  const netIncomeYi = netIncomeWan / 10000
  const fcfConversion = netIncomeYi > 0 && fcfYi !== 0 ? (fcfYi / netIncomeYi) * 100 : ocfToRevenue
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

  return { eps, bvps, roic, deRatio, ocfToRevenue, netIncomeWan, finaInvTurn, finaArTurn, ebitdaPerShare, fcfYi, fcfConversion, derivedFcfGrowth, derivedNetDebt, balanceGoodwill, balanceOtherReceivables, balanceEquity }
}