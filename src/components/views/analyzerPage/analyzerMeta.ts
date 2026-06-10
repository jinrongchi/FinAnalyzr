import type { FieldNotes, FieldSources, FormState } from '../../../types'

export type AnalyzerTab = 'dcf' | 'roepb' | 'relative' | 'cashflow' | 'sotp' | 'risk'

export const ANALYZER_TABS: Array<{ key: AnalyzerTab; label: string }> = [
  { key: 'dcf', label: 'DCF系统' },
  { key: 'roepb', label: 'ROE-PB系统' },
  { key: 'relative', label: '相对估值系统' },
  { key: 'cashflow', label: 'CAPE/现金回报' },
  { key: 'sotp', label: 'SOTP系统' },
  { key: 'risk', label: '风险与验证' },
]

export const FIELD_FORMULAS: Partial<Record<keyof FormState, string>> = {
  isST: 'ST标记：1=ST/*ST，0=非ST；ST将触发硬性风险限制',
  isGrowthBoard: '成长板标记：1=创业板/科创板，0=其他；高波动且风格偏成长',
  isPolicySensitive: '政策敏感标记：1=房地产/教育/医疗等，0=其他；用于政策风险提示',
  isFinancialSector: '金融行业标记：1=银行/非银/保险/券商；OCF/NI现金流口径不作为硬性否决',
  listedYears: '上市年限：小于1年高风险，小于5年触发置信度惩罚',
  discountRate: 'CAPM: r = Rf + beta × ERP；当前默认 Rf=2.5%, ERP=6.5%，创业板/科创板自动增加风险溢价',
  netDebt: '净负债 = 流动负债 + 非流动负债 - 货币资金（再换算为亿元）',
  deRatio: 'D/E = 资产负债率 / (1 - 资产负债率)',
  ebitdaPerShare: '每股EBITDA = EBITDA(万元) / 总股本(万股)；若缺失则按股价×15%近似',
  fcfGrowth: 'FCF增长率 = (本期FCF - 上期FCF) / 上期FCF × 100%',
  fcfConversion: 'FCF 转化率 = 自由现金流 / 归母净利润 × 100%',
  dividendGrowth: 'g1 = ROE × (1 - 股息支付率)，其中 ROE = EPS/BVPS，股息支付率 = D0/EPS；若支付率>70%需审慎',
  terminalGrowth: '永续增长率 g 默认 3%，代表长期名义增长中枢',
  moatScore: '护城河评分按 ROIC 分段启发式推导：>=25→80，>=20→65，>=15→50，>=10→35，否则20',
  governanceScore: '治理评分默认值=60（中性基线），建议按治理结构与信披质量人工修正',
  industryOverride: '行业模板：0自动识别（优先按TuShare申万行业映射），1金融地产，2消费医药，3强周期，4重资产基建，5科技平台',
  sotpPerShare: 'SOTP每股估值：建议按分部价值加总后折算为每股',
  sotpSegmentCorePerShare: '核心业务分部每股估值',
  sotpSegmentGrowthPerShare: '成长/新业务分部每股估值',
  sotpSegmentInvestmentPerShare: '股权投资及其他资产每股估值',
  sotpSegmentNetCashPerShare: '净现金（净负债为负值）折算每股价值',
  rndCapitalizationAdjPerShare: '研发资本化调整：将研发费用资本化后对每股价值的调整额',
  csi300EarningsYield: '股债利差温度计中的 E/P，优先用沪深300盈利收益率',
  cn10yYield: '10年期国债收益率，默认2.5%',
  pePercentile10y: '该指标当前值在过去10年分布中的百分位（0-100）',
  pbPercentile10y: '该指标当前值在过去10年分布中的百分位（0-100）',
  pcfPercentile10y: '该指标当前值在过去10年分布中的百分位（0-100）',
  pePercentile5y: '该指标当前值在过去5年分布中的百分位（0-100）',
  pbPercentile5y: '该指标当前值在过去5年分布中的百分位（0-100）',
  pcfPercentile5y: '该指标当前值在过去5年分布中的百分位（0-100）',
  peg: 'PEG=PE/盈利增长率，通常 PEG<1 代表估值与增长更匹配',
  pcf: 'PCF（市现率）越低通常越便宜，建议结合现金流质量判断',
  ocfToNi3yAvg: '近3年经营性现金流/净利润均值，低于0.7触发红旗',
  goodwillToEquity: '商誉/净资产比例，超过30%触发红旗',
  otherReceivablesToEquity: '其他应收款/净资产比例，超过20%触发红旗',
  relatedPartySalesToRevenue: '关联方销售占营收比例，超过30%触发预警，超过50%触发硬性红旗',
  externalGuaranteeToEquity: '对外担保占净资产比例，超过30%触发预警，超过50%触发硬性红旗',
  inventoryTurnoverDays: '存货周转天数=365/存货周转率；天数越高通常表示去化压力增加',
  arTurnoverDays: '应收周转天数=365/应收周转率；天数越高通常表示回款效率下降',
  inventoryTurnoverTrend: '近3年存货周转天数累计变化（%）；与应收天数同时上升>30%触发红旗',
  arTurnoverTrend: '近3年应收周转天数累计变化（%）；与存货天数同时上升>30%触发红旗',
}

export function formulaFor(field: keyof FormState): string | undefined {
  return FIELD_FORMULAS[field]
}

export function capeMethodFor(form: FormState, sources: FieldSources, notes: FieldNotes): string | undefined {
  const capeNote = notes.cape || ''
  if (sources.cape === 'manual') return '手工输入'
  if (capeNote.includes('CPI不可用')) return '名义利润(降级)'
  if (capeNote.includes('CPI均值')) return '通胀调整'
  if (form.cape > 0) return '已提供'
  return undefined
}
