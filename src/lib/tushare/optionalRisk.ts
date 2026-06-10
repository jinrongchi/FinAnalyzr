import type { FieldSources, FormState } from '../../types'
import type { OptionalRiskRow } from './rows'
import { getFieldValue, normalizeNumber } from './utils'

function getFirstNumericByFields(row: OptionalRiskRow | undefined, fields: string[], candidates: string[]): number {
  if (!row || !fields.length) return 0
  for (const key of candidates) {
    const value = getFieldValue<number | null>(row, fields, key)
    const n = normalizeNumber(value, 0)
    if (n > 0) return n
  }
  return 0
}

export function deriveOptionalRiskRatios(args: {
  relatedTradeTable: { items: OptionalRiskRow[]; fields: string[] }
  guaranteeTable: { items: OptionalRiskRow[]; fields: string[] }
  current: FormState
  fieldSources: FieldSources
  addFieldNote: (field: keyof FormState, message: string) => void
}): {
  relatedPartySalesToRevenue: number
  externalGuaranteeToEquity: number
} {
  const { relatedTradeTable, guaranteeTable, current, fieldSources, addFieldNote } = args

  let relatedPartySalesToRevenue = current.relatedPartySalesToRevenue
  const relatedRow = relatedTradeTable.items[0]
  if (relatedRow && relatedTradeTable.fields.length) {
    const relatedSales = getFirstNumericByFields(relatedRow, relatedTradeTable.fields, ['related_sales', 'related_amt', 'trade_amt', 'amount'])
    const revenue = getFirstNumericByFields(relatedRow, relatedTradeTable.fields, ['revenue', 'total_revenue', 'oper_revenue', 'biz_revenue'])
    const ratio = revenue > 0 ? (relatedSales / revenue) * 100 : 0
    if (ratio > 0) {
      relatedPartySalesToRevenue = ratio
      fieldSources.relatedPartySalesToRevenue = 'derived'
      addFieldNote('relatedPartySalesToRevenue', '由可选相关方交易表自动换算：关联销售额/营收')
    }
  }

  let externalGuaranteeToEquity = current.externalGuaranteeToEquity
  const guaranteeRow = guaranteeTable.items[0]
  if (guaranteeRow && guaranteeTable.fields.length) {
    const guaranteeAmount = getFirstNumericByFields(guaranteeRow, guaranteeTable.fields, ['guarantee_amt', 'guarantee_balance', 'out_guarantee', 'amount'])
    const netAssets = getFirstNumericByFields(guaranteeRow, guaranteeTable.fields, ['net_assets', 'equity', 'total_hldr_eqy_exc_min_int'])
    const ratio = netAssets > 0 ? (guaranteeAmount / netAssets) * 100 : 0
    if (ratio > 0) {
      externalGuaranteeToEquity = ratio
      fieldSources.externalGuaranteeToEquity = 'derived'
      addFieldNote('externalGuaranteeToEquity', '由可选对外担保表自动换算：担保余额/净资产')
    }
  }

  return { relatedPartySalesToRevenue, externalGuaranteeToEquity }
}