import type { ChangeEvent } from 'react'
import { useMemo, useState } from 'react'
import { NumberField } from '../../NumberField'
import { formatMaybeNumber, formatMaybePct, formatMaybeYuan } from '../../../lib/displayFormat'
import { buildSnapshotName } from '../../../lib/historyDate'
import { formatPct } from '../../../lib/valuation/index'
import type { AnalysisResult, FieldNotes, FieldSources, FormState, ModelResult } from '../../../types'
import { ANALYZER_TABS, capeMethodFor, formulaFor, type AnalyzerTab } from './analyzerMeta'
import { completenessCount, marginSafetyClass, spreadPercentileFromZ, warningLabel, warningSeverity } from './analyzerHelpers'

type AnalyzerViewProps = {
  form: FormState
  canUseTushare: boolean
  loadingTushare: boolean
  syncStatus: string
  snapshotDraftName: string
  snapshotDraftTags: string
  snapshotMessage: string
  currentSourceTradeDate?: string
  activeStockName: string
  result: AnalysisResult
  finalGrade: { cls: string; label: string }
  sensitivityMax: number
  fieldSources: FieldSources
  fieldNotes: FieldNotes
  onInputChange: (event: ChangeEvent<HTMLInputElement>) => void
  onUpdateField: (name: keyof FormState, value: string) => void
  onFetchTushare: (forceRefresh?: boolean) => void
  onSnapshotDraftNameChange: (value: string) => void
  onSnapshotDraftTagsChange: (value: string) => void
  onSaveSnapshot: () => void
}

function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="section-block">
      <button
        type="button"
        className="section-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>{title}</span>
        <span className="section-arrow">{open ? '▲' : '▼'}</span>
      </button>
      {open ? <div className="section-content">{children}</div> : null}
    </div>
  )
}

function ModelBox({ model }: { model?: ModelResult }) {
  if (!model) return null
  return (
    <div className={`system-result-card ${model.valid ? '' : 'card-inactive'}`}>
      <div className="row">
        <strong>{model.name}</strong>
        <span className="tag">{model.valid ? `置信度 ${formatPct(model.confidence || 0)}` : '未采用'}</span>
      </div>
      {model.valid ? (
        <>
          <div className="system-result-value">{formatMaybeYuan(model.value || 0)}</div>
          {model.weight !== undefined ? (
            <div className="system-result-meta">权重 {(model.weight * 100).toFixed(0)}% · 贡献 {formatMaybeYuan(model.contribution || 0)}</div>
          ) : null}
          <div className="card-assumptions">{model.assumptions}</div>
        </>
      ) : <div className="card-reason">{model.reason}</div>}
    </div>
  )
}

export function AnalyzerView(props: AnalyzerViewProps) {
  const [activeTab, setActiveTab] = useState<AnalyzerTab>('dcf')
  const { filled, total } = completenessCount(props.form)
  const completeness = Math.round((filled / total) * 100)
  const fs = props.fieldSources
  const fn = props.fieldNotes
  const sotpSegmentSum =
    props.form.sotpSegmentCorePerShare
    + props.form.sotpSegmentGrowthPerShare
    + props.form.sotpSegmentInvestmentPerShare
    + props.form.sotpSegmentNetCashPerShare

  const capeNote = fn.cape || ''
  const capeMethod = capeMethodFor(props.form, fs, fn)

  const modelMap = useMemo(() => {
    const lookup: Partial<Record<ModelResult['key'], ModelResult>> = {}
    for (const model of props.result.models) {
      lookup[model.key] = model
    }
    return lookup
  }, [props.result.models])

  const dcfModel = modelMap.DCF
  const roepbModel = modelMap.ROEPB
  const relModel = modelMap.REL
  const grhModel = modelMap.GRH
  const capeModel = modelMap.CAPE
  const fcfevModel = modelMap.FCFEV
  const sotpModel = modelMap.SOTP

  function helperFor(field: keyof FormState): string | undefined {
    return fn[field]
  }

  return (
    <main className="layout analyzer-redesign-layout">
      <section className="panel analyzer-shell">
        <div className="analyzer-top-head">
          <div>
            <h2>{props.activeStockName || '估值总览'}</h2>
            <h3 className="analyzer-legacy-title">输入参数</h3>
            <p className="sub">先看总报告，再按估值系统逐项填参与校验。</p>
          </div>
          <div className="completeness-wrap">
            <div className="completeness-label">数据完整度 {completeness}%</div>
            <div className="completeness-track">
              <div
                className="completeness-fill"
                style={{ width: `${completeness}%`, background: completeness >= 80 ? '#16a34a' : completeness >= 50 ? '#d97706' : '#dc2626' }}
              />
            </div>
          </div>
        </div>

        <div className="analyzer-top-controls">
          <label>
            股票代码
            <input name="ticker" value={props.form.ticker} placeholder="例如 600519" onChange={props.onInputChange} />
          </label>
          <NumberField label="当前股价（元）" name="price" step={0.01} value={props.form.price} emptyIfZero source={fs.price} onChange={props.onUpdateField} />
          <button
            type="button"
            className={!props.canUseTushare ? 'muted-action tushare-load-btn' : 'tushare-load-btn'}
            disabled={props.loadingTushare || !props.canUseTushare}
            title={!props.canUseTushare ? '请先保存 TuShare Token' : ''}
            onClick={() => props.onFetchTushare(false)}
          >
            {props.loadingTushare ? '同步中...' : '加载 TuShare'}
          </button>
        </div>

        {props.syncStatus ? <p className="status-note">{props.syncStatus}</p> : null}

        <div className="overview">
          <div className="row">
            <strong>总评估报告</strong>
            <span className={`tag ${props.finalGrade.cls}`}>{props.finalGrade.label}</span>
          </div>
          {props.result.industryProfile ? <p className="sub">行业模板：{props.result.industryProfile}</p> : null}
          <div className="kpi">
            <div className="item"><div>当前价格</div><div className="v">{formatMaybeYuan(props.form.price)}</div></div>
            <div className="item"><div>内在价值</div><div className="v">{formatMaybeYuan(props.result.intrinsicValue)}</div></div>
            <div className="item"><div>价值区间</div><div className="v">{props.result.intrinsicRange ? `${formatMaybeYuan(props.result.intrinsicRange.bear)} - ${formatMaybeYuan(props.result.intrinsicRange.bull)}` : '-'}</div></div>
            <div className={`item ${marginSafetyClass(props.result.marginSafety)}`}><div>安全边际</div><div className="v">{formatMaybePct(props.result.marginSafety)}</div></div>
            <div className="item"><div>结果置信度</div><div className="v">{formatPct(props.result.confidence)}</div></div>
            <div className="item"><div>质量评分</div><div className="v">{props.result.qualityScore}</div></div>
            {props.result.safetyScore !== undefined ? <div className="item"><div>安全边际评分</div><div className="v">{props.result.safetyScore}</div></div> : null}
            {props.result.marketCycleAdjustment !== undefined ? <div className="item"><div>市场周期修正</div><div className="v">{props.result.marketCycleAdjustment > 0 ? `+${props.result.marketCycleAdjustment}` : props.result.marketCycleAdjustment}</div></div> : null}
            {props.result.dataCoverage ? <div className="item"><div>数据充分度</div><div className="v">{props.result.dataCoverage.score} ({props.result.dataCoverage.level === 'high' ? '高' : props.result.dataCoverage.level === 'medium' ? '中' : '低'})</div></div> : null}
            {capeMethod ? <div className="item" title={capeNote || 'CAPE 数据口径'}><div>CAPE口径</div><div className="v">{capeMethod}</div></div> : null}
          </div>
          {props.result.longTermReturn ? (
            <div className="kpi expected-return-kpi">
              <div className="item"><div>长期回报(总)</div><div className="v">{formatMaybePct(props.result.longTermReturn.annualTotal)}</div></div>
              <div className="item"><div>分红贡献</div><div className="v">{formatMaybePct(props.result.longTermReturn.annualDividend)}</div></div>
              <div className="item"><div>增长贡献</div><div className="v">{formatMaybePct(props.result.longTermReturn.annualGrowth)}</div></div>
              <div className="item"><div>估值回归贡献</div><div className="v">{formatMaybePct(props.result.longTermReturn.annualValuationChange)}</div></div>
            </div>
          ) : null}
          {props.result.conformanceChecks?.length ? (
            <div className="conformance-panel">
              <div className="conformance-title">规范对齐检查</div>
              <div className="conformance-list">
                {props.result.conformanceChecks.map((c) => (
                  <div key={c.key} className={`conformance-item conformance-item--${c.status}`}>
                    <div className="conformance-head">
                      <span>{c.label}</span>
                      <span className="conformance-badge">{c.status === 'block' ? '阻断' : c.status === 'warn' ? '预警' : c.status === 'on' ? '启用' : '未触发'}</span>
                    </div>
                    {c.detail ? <div className="conformance-detail">{c.detail}</div> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="system-tabs" role="tablist" aria-label="估值系统切换">
          {ANALYZER_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`system-tab-btn ${activeTab === tab.key ? 'is-active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="system-panel">
          {activeTab === 'dcf' ? (
            <div className="system-grid">
              <div>
                <h3>DCF 输入参数</h3>
                <div className="form-grid">
                  <NumberField label="基准自由现金流 FCF0（亿元）" name="fcf0" value={props.form.fcf0} emptyIfZero source={fs.fcf0} helperText={helperFor('fcf0')} helperFormula={formulaFor('fcf0')} onChange={props.onUpdateField} />
                  <NumberField label="预测年数" name="forecastYears" min={3} max={20} step={1} value={props.form.forecastYears} onChange={props.onUpdateField} />
                  <NumberField label="FCF 增长率（%）" name="fcfGrowth" value={props.form.fcfGrowth} emptyIfZero source={fs.fcfGrowth} helperText={helperFor('fcfGrowth')} helperFormula={formulaFor('fcfGrowth')} onChange={props.onUpdateField} />
                  <NumberField label="折现率 r（%）" name="discountRate" value={props.form.discountRate} emptyIfZero source={fs.discountRate} helperText={helperFor('discountRate')} helperFormula={formulaFor('discountRate')} onChange={props.onUpdateField} />
                  <NumberField label="永续增长率 g（%）" name="terminalGrowth" value={props.form.terminalGrowth} emptyIfZero source={fs.terminalGrowth} helperText={helperFor('terminalGrowth')} helperFormula={formulaFor('terminalGrowth')} onChange={props.onUpdateField} />
                  <NumberField label="净负债（亿元，净现金填负）" name="netDebt" value={props.form.netDebt} emptyIfZero source={fs.netDebt} helperText={helperFor('netDebt')} helperFormula={formulaFor('netDebt')} onChange={props.onUpdateField} />
                  <NumberField label="总股本（亿股）" name="sharesOutstanding" value={props.form.sharesOutstanding} emptyIfZero source={fs.sharesOutstanding} helperText={helperFor('sharesOutstanding')} helperFormula={formulaFor('sharesOutstanding')} onChange={props.onUpdateField} />
                </div>
              </div>
              <div>
                <ModelBox model={dcfModel} />
                <div className="sensitivity">
                  <h3>DCF 敏感性分析</h3>
                  {props.result.sensitivity.length ? props.result.sensitivity.map((s) => (
                    <div className="bar" key={s.label}>
                      <div className="bar-label">{s.label}</div>
                      <div className="track"><div className="fill" style={{ width: `${props.sensitivityMax > 0 ? (s.value / props.sensitivityMax) * 100 : 0}%` }} /></div>
                      <div className="bar-value">{formatMaybeYuan(s.value)}</div>
                    </div>
                  )) : <p>DCF 不可用，无法生成敏感性分析。</p>}
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === 'roepb' ? (
            <div className="system-grid">
              <div>
                <h3>ROE-PB 输入参数</h3>
                <div className="form-grid">
                  <NumberField label="每股收益 EPS（元）" name="eps" value={props.form.eps} emptyIfZero source={fs.eps} helperText={helperFor('eps')} helperFormula={formulaFor('eps')} onChange={props.onUpdateField} />
                  <NumberField label="每股净资产 BVPS（元）" name="bvps" value={props.form.bvps} emptyIfZero source={fs.bvps} helperText={helperFor('bvps')} helperFormula={formulaFor('bvps')} onChange={props.onUpdateField} />
                  <NumberField label="折现率 r（%）" name="discountRate" value={props.form.discountRate} emptyIfZero source={fs.discountRate} helperText={helperFor('discountRate')} helperFormula={formulaFor('discountRate')} onChange={props.onUpdateField} />
                  <NumberField label="永续增长率 g（%）" name="terminalGrowth" value={props.form.terminalGrowth} emptyIfZero source={fs.terminalGrowth} helperText={helperFor('terminalGrowth')} helperFormula={formulaFor('terminalGrowth')} onChange={props.onUpdateField} />
                  <NumberField label="行业中位 PB" name="industryPB" value={props.form.industryPB} emptyIfZero source={fs.industryPB} helperText={helperFor('industryPB')} helperFormula={formulaFor('industryPB')} onChange={props.onUpdateField} />
                </div>
              </div>
              <div><ModelBox model={roepbModel} /></div>
            </div>
          ) : null}

          {activeTab === 'relative' ? (
            <div className="system-grid">
              <div>
                <h3>相对估值输入参数（PE/PB/PCF/PEG）</h3>
                <div className="form-grid">
                  <NumberField label="每股收益 EPS（元）" name="eps" value={props.form.eps} emptyIfZero source={fs.eps} helperText={helperFor('eps')} helperFormula={formulaFor('eps')} onChange={props.onUpdateField} />
                  <NumberField label="每股净资产 BVPS（元）" name="bvps" value={props.form.bvps} emptyIfZero source={fs.bvps} helperText={helperFor('bvps')} helperFormula={formulaFor('bvps')} onChange={props.onUpdateField} />
                  <NumberField label="行业中位 PE" name="industryPE" value={props.form.industryPE} emptyIfZero source={fs.industryPE} helperText={helperFor('industryPE')} helperFormula={formulaFor('industryPE')} onChange={props.onUpdateField} />
                  <NumberField label="行业中位 PB" name="industryPB" value={props.form.industryPB} emptyIfZero source={fs.industryPB} helperText={helperFor('industryPB')} helperFormula={formulaFor('industryPB')} onChange={props.onUpdateField} />
                  <NumberField label="当前 PCF（TTM）" name="pcf" value={props.form.pcf} emptyIfZero source={fs.pcf} helperText={helperFor('pcf')} helperFormula={formulaFor('pcf')} onChange={props.onUpdateField} />
                  <NumberField label="PEG" name="peg" step={0.01} value={props.form.peg} emptyIfZero source={fs.peg} helperText={helperFor('peg')} helperFormula={formulaFor('peg')} onChange={props.onUpdateField} />
                </div>
              </div>
              <div>
                <ModelBox model={relModel} />
                {props.result.valuationAverages?.length ? (
                  <div className="valuation-avg-card">
                    <div className="valuation-avg-head">
                      <h3>估值均值柱状图</h3>
                      <span className="valuation-avg-subhead">6M / 1Y / 3Y</span>
                    </div>
                    <div className="valuation-avg-list">
                      {props.result.valuationAverages.map((point) => {
                        const metricMax = Math.max(point.avg6m, point.avg1y, point.avg3y, 1)
                        const bars = [
                          { label: '6M', value: point.avg6m, cls: 'is-6m' },
                          { label: '1Y', value: point.avg1y, cls: 'is-1y' },
                          { label: '3Y', value: point.avg3y, cls: 'is-3y' },
                        ]

                        return (
                          <div key={point.metric} className="valuation-avg-metric">
                            <div className="valuation-avg-metric-label">{point.metric}</div>
                            <div className="valuation-avg-bars">
                              {bars.map((bar) => (
                                <div key={bar.label} className="valuation-avg-row">
                                  <div className="valuation-avg-term">{bar.label}</div>
                                  <div className="valuation-avg-track">
                                    <div className={`valuation-avg-fill ${bar.cls}`} style={{ width: `${(bar.value / metricMax) * 100}%` }} />
                                  </div>
                                  <div className="valuation-avg-value">{formatMaybeNumber(bar.value, 2)}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {activeTab === 'cashflow' ? (
            <div className="system-grid">
              <div>
                <h3>CAPE 与现金回报输入参数</h3>
                <div className="form-grid">
                  <NumberField label="CAPE" name="cape" value={props.form.cape} emptyIfZero source={fs.cape} helperText={helperFor('cape')} helperFormula={formulaFor('cape')} onChange={props.onUpdateField} />
                  <NumberField label="FCF/EV 回报率（%）" name="fcfYield" step={0.01} value={props.form.fcfYield} emptyIfZero source={fs.fcfYield} helperText={helperFor('fcfYield')} helperFormula={formulaFor('fcfYield')} onChange={props.onUpdateField} />
                  <NumberField label="每股分红 D0（元）" name="dividend0" value={props.form.dividend0} emptyIfZero source={fs.dividend0} helperText={helperFor('dividend0')} helperFormula={formulaFor('dividend0')} onChange={props.onUpdateField} />
                  <NumberField label="阶段增长率 g1（%）" name="dividendGrowth" value={props.form.dividendGrowth} emptyIfZero source={fs.dividendGrowth} helperText={helperFor('dividendGrowth')} helperFormula={formulaFor('dividendGrowth')} onChange={props.onUpdateField} />
                </div>
              </div>
              <div className="system-results-stack">
                <ModelBox model={capeModel} />
                <ModelBox model={fcfevModel} />
                <ModelBox model={grhModel} />
              </div>
            </div>
          ) : null}

          {activeTab === 'sotp' ? (
            <div className="system-grid">
              <div>
                <h3>SOTP 输入参数</h3>
                <div className="form-grid">
                  <label>
                    行业模板
                    <select value={String(props.form.industryOverride)} onChange={(e) => props.onUpdateField('industryOverride', e.target.value)}>
                      <option value="0">自动识别</option>
                      <option value="1">金融/地产</option>
                      <option value="2">消费/医药</option>
                      <option value="3">强周期（钢铁/化工等）</option>
                      <option value="4">重资产基建（水电/高速等）</option>
                      <option value="5">科技/平台</option>
                    </select>
                    <small className="field-note">{formulaFor('industryOverride')}</small>
                  </label>
                  <NumberField label="SOTP每股估值（元）" name="sotpPerShare" step={0.01} value={props.form.sotpPerShare} emptyIfZero source={fs.sotpPerShare} helperFormula={formulaFor('sotpPerShare')} onChange={props.onUpdateField} />
                  <NumberField label="分部-核心业务（元/股）" name="sotpSegmentCorePerShare" step={0.01} value={props.form.sotpSegmentCorePerShare} emptyIfZero source={fs.sotpSegmentCorePerShare} helperFormula={formulaFor('sotpSegmentCorePerShare')} onChange={props.onUpdateField} />
                  <NumberField label="分部-成长业务（元/股）" name="sotpSegmentGrowthPerShare" step={0.01} value={props.form.sotpSegmentGrowthPerShare} emptyIfZero source={fs.sotpSegmentGrowthPerShare} helperFormula={formulaFor('sotpSegmentGrowthPerShare')} onChange={props.onUpdateField} />
                  <NumberField label="分部-投资资产（元/股）" name="sotpSegmentInvestmentPerShare" step={0.01} value={props.form.sotpSegmentInvestmentPerShare} emptyIfZero source={fs.sotpSegmentInvestmentPerShare} helperFormula={formulaFor('sotpSegmentInvestmentPerShare')} onChange={props.onUpdateField} />
                  <NumberField label="分部-净现金（元/股）" name="sotpSegmentNetCashPerShare" step={0.01} value={props.form.sotpSegmentNetCashPerShare} emptyIfZero source={fs.sotpSegmentNetCashPerShare} helperFormula={formulaFor('sotpSegmentNetCashPerShare')} onChange={props.onUpdateField} />
                  <NumberField label="研发资本化调整（元/股）" name="rndCapitalizationAdjPerShare" step={0.01} value={props.form.rndCapitalizationAdjPerShare} emptyIfZero source={fs.rndCapitalizationAdjPerShare} helperFormula={formulaFor('rndCapitalizationAdjPerShare')} onChange={props.onUpdateField} />
                </div>
                <p className="sub">分部汇总（不含研发资本化调整）：{formatMaybeYuan(sotpSegmentSum)}</p>
              </div>
              <div><ModelBox model={sotpModel} /></div>
            </div>
          ) : null}

          {activeTab === 'risk' ? (
            <div className="system-grid">
              <div>
                <h3>风险过滤与验证参数</h3>
                <div className="form-grid">
                  <NumberField label="ST标记（1是/0否）" name="isST" min={0} max={1} step={1} value={props.form.isST} emptyIfZero source={fs.isST} helperFormula={formulaFor('isST')} onChange={props.onUpdateField} />
                  <NumberField label="成长板标记（1是/0否）" name="isGrowthBoard" min={0} max={1} step={1} value={props.form.isGrowthBoard} emptyIfZero source={fs.isGrowthBoard} helperFormula={formulaFor('isGrowthBoard')} onChange={props.onUpdateField} />
                  <NumberField label="政策敏感标记（1是/0否）" name="isPolicySensitive" min={0} max={1} step={1} value={props.form.isPolicySensitive} emptyIfZero source={fs.isPolicySensitive} helperFormula={formulaFor('isPolicySensitive')} onChange={props.onUpdateField} />
                  <NumberField label="金融行业标记（1是/0否）" name="isFinancialSector" min={0} max={1} step={1} value={props.form.isFinancialSector} emptyIfZero source={fs.isFinancialSector} helperFormula={formulaFor('isFinancialSector')} onChange={props.onUpdateField} />
                  <NumberField label="上市年限（年）" name="listedYears" step={0.1} value={props.form.listedYears} emptyIfZero source={fs.listedYears} helperFormula={formulaFor('listedYears')} onChange={props.onUpdateField} />
                  <NumberField label="近3年OCF/NI均值" name="ocfToNi3yAvg" step={0.01} value={props.form.ocfToNi3yAvg} emptyIfZero source={fs.ocfToNi3yAvg} helperFormula={formulaFor('ocfToNi3yAvg')} onChange={props.onUpdateField} />
                  <NumberField label="商誉/净资产（%）" name="goodwillToEquity" step={0.1} value={props.form.goodwillToEquity} emptyIfZero source={fs.goodwillToEquity} helperFormula={formulaFor('goodwillToEquity')} onChange={props.onUpdateField} />
                  <NumberField label="其他应收款/净资产（%）" name="otherReceivablesToEquity" step={0.1} value={props.form.otherReceivablesToEquity} emptyIfZero source={fs.otherReceivablesToEquity} helperFormula={formulaFor('otherReceivablesToEquity')} onChange={props.onUpdateField} />
                  <NumberField label="关联方销售/营收（%）" name="relatedPartySalesToRevenue" step={0.1} value={props.form.relatedPartySalesToRevenue} emptyIfZero source={fs.relatedPartySalesToRevenue} helperFormula={formulaFor('relatedPartySalesToRevenue')} onChange={props.onUpdateField} />
                  <NumberField label="对外担保/净资产（%）" name="externalGuaranteeToEquity" step={0.1} value={props.form.externalGuaranteeToEquity} emptyIfZero source={fs.externalGuaranteeToEquity} helperFormula={formulaFor('externalGuaranteeToEquity')} onChange={props.onUpdateField} />
                  <NumberField label="存货周转天数" name="inventoryTurnoverDays" step={0.1} value={props.form.inventoryTurnoverDays} emptyIfZero source={fs.inventoryTurnoverDays} helperFormula={formulaFor('inventoryTurnoverDays')} onChange={props.onUpdateField} />
                  <NumberField label="应收周转天数" name="arTurnoverDays" step={0.1} value={props.form.arTurnoverDays} emptyIfZero source={fs.arTurnoverDays} helperFormula={formulaFor('arTurnoverDays')} onChange={props.onUpdateField} />
                  <NumberField label="存货周转率变化（%）" name="inventoryTurnoverTrend" step={0.1} value={props.form.inventoryTurnoverTrend} emptyIfZero source={fs.inventoryTurnoverTrend} helperFormula={formulaFor('inventoryTurnoverTrend')} onChange={props.onUpdateField} />
                  <NumberField label="应收周转率变化（%）" name="arTurnoverTrend" step={0.1} value={props.form.arTurnoverTrend} emptyIfZero source={fs.arTurnoverTrend} helperFormula={formulaFor('arTurnoverTrend')} onChange={props.onUpdateField} />
                  <NumberField label="ROIC（%）" name="roic" value={props.form.roic} emptyIfZero source={fs.roic} helperText={helperFor('roic')} helperFormula={formulaFor('roic')} onChange={props.onUpdateField} />
                  <NumberField label="资产负债率替代：D/E" name="deRatio" value={props.form.deRatio} emptyIfZero source={fs.deRatio} helperText={helperFor('deRatio')} helperFormula={formulaFor('deRatio')} onChange={props.onUpdateField} />
                  <NumberField label="FCF 转化率（%）" name="fcfConversion" value={props.form.fcfConversion} emptyIfZero source={fs.fcfConversion} helperText={helperFor('fcfConversion')} helperFormula={formulaFor('fcfConversion')} onChange={props.onUpdateField} />
                  <NumberField label="治理评分" name="governanceScore" min={0} max={100} step={1} value={props.form.governanceScore} emptyIfZero source={fs.governanceScore} helperText={helperFor('governanceScore')} helperFormula={formulaFor('governanceScore')} onChange={props.onUpdateField} />
                  <NumberField label="护城河评分" name="moatScore" min={0} max={100} step={1} value={props.form.moatScore} emptyIfZero source={fs.moatScore} helperText={helperFor('moatScore')} helperFormula={formulaFor('moatScore')} onChange={props.onUpdateField} />
                  <NumberField label="沪深300盈利收益率E/P（%）" name="csi300EarningsYield" step={0.01} value={props.form.csi300EarningsYield} emptyIfZero source={fs.csi300EarningsYield} helperFormula={formulaFor('csi300EarningsYield')} onChange={props.onUpdateField} />
                  <NumberField label="10年期国债收益率（%）" name="cn10yYield" step={0.01} value={props.form.cn10yYield} emptyIfZero source={fs.cn10yYield} helperFormula={formulaFor('cn10yYield')} onChange={props.onUpdateField} />
                </div>
              </div>
              <div>
                {props.result.thermometer ? (
                  <div className="kpi">
                    <div className="item"><div>股债利差温度计</div><div className="v">{formatMaybePct(props.result.thermometer.spread / 100)}</div></div>
                    <div className="item"><div>标准分</div><div className="v">{props.result.thermometer.zScore.toFixed(2)}</div></div>
                    <div className="item"><div>估值温度</div><div className="v">{props.result.thermometer.status === 'cold' ? '偏冷(性价比高)' : props.result.thermometer.status === 'hot' ? '偏热(性价比低)' : '中性'}</div></div>
                  </div>
                ) : null}
                {props.result.thermometer ? (
                  <p className="sub thermometer-context">
                    当前股债利差约处历史 {spreadPercentileFromZ(props.result.thermometer.zScore)} 分位。
                    {props.result.thermometer.status === 'cold' ? ' 市场偏冷，系统倾向提高安全评分。' : props.result.thermometer.status === 'hot' ? ' 市场偏热，系统倾向降低安全评分。' : ' 市场处于中性区间。'}
                  </p>
                ) : null}
                {props.result.dataCoverage?.missingCoreFields?.length ? (
                  <div className="warn-item warn-item--info">
                    <div className="warn-badge">缺失字段</div>
                    <div>{props.result.dataCoverage.missingCoreFields.join('、')}</div>
                  </div>
                ) : null}
                <div className="warnings">
                  {props.result.warnings.map((w) => {
                    const level = warningSeverity(w)
                    return (
                      <div key={w} className={`warn-item warn-item--${level}`}>
                        <div className={`warn-badge warn-badge--${level}`}>{warningLabel(level)}</div>
                        <div>{w}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <Section title="快照" defaultOpen>
          <div className="form-grid snapshot-grid">
            <label>
              快照名称
              <input value={props.snapshotDraftName} onChange={(e) => props.onSnapshotDraftNameChange(e.target.value)} placeholder={buildSnapshotName(props.activeStockName, props.form.ticker, props.currentSourceTradeDate)} />
            </label>
            <label>
              快照标签（逗号分隔）
              <input value={props.snapshotDraftTags} onChange={(e) => props.onSnapshotDraftTagsChange(e.target.value)} placeholder="例如：茅台, 三季度, 符合预期" />
            </label>
            <button type="button" onClick={props.onSaveSnapshot}>保存当前快照</button>
          </div>
          {props.snapshotMessage ? <p className="snapshot-note">{props.snapshotMessage}</p> : null}
        </Section>

        <p className="disclaimer">免责声明：本工具仅用于学习研究，不构成任何投资建议。市场有风险，决策需独立判断。</p>
      </section>
    </main>
  )
}
