import type { ChangeEvent } from 'react'
import { NumberField } from '../NumberField'
import { formatMaybePct, formatMaybeYuan } from '../../lib/displayFormat'
import { buildSnapshotName } from '../../lib/historyDate'
import { formatPct } from '../../lib/valuation'
import type { AnalysisResult, FormState } from '../../types'

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
  onInputChange: (event: ChangeEvent<HTMLInputElement>) => void
  onUpdateField: (name: keyof FormState, value: string) => void
  onFetchTushare: (forceRefresh?: boolean) => void
  onSnapshotDraftNameChange: (value: string) => void
  onSnapshotDraftTagsChange: (value: string) => void
  onSaveSnapshot: () => void
}

export function AnalyzerView(props: AnalyzerViewProps) {
  return (
    <main className="layout">
      <section className="panel input-panel">
        <h2>输入参数</h2>
        <p className="sub">支持 TuShare 一键加载与手工补录。</p>

        <div className="form-grid primary-grid">
          <label>
            股票代码
            <input name="ticker" value={props.form.ticker} onChange={props.onInputChange} />
          </label>
          <NumberField label="当前股价（元）" name="price" step={0.01} value={props.form.price} emptyIfZero onChange={props.onUpdateField} />
          <button
            type="button"
            className={!props.canUseTushare ? 'muted-action' : ''}
            disabled={props.loadingTushare || !props.canUseTushare}
            title={!props.canUseTushare ? '请先保存 TuShare Token' : ''}
            onClick={() => props.onFetchTushare(false)}
          >
            {props.loadingTushare ? '同步中...' : 'Load from TuShare'}
          </button>
        </div>

        {props.syncStatus ? <p className="status-note">{props.syncStatus}</p> : null}

        <h3>DCF 参数</h3>
        <div className="form-grid">
          <NumberField label="基准自由现金流 FCF0（亿元）" name="fcf0" value={props.form.fcf0} emptyIfZero onChange={props.onUpdateField} />
          <NumberField label="预测年数" name="forecastYears" min={3} max={20} step={1} value={props.form.forecastYears} onChange={props.onUpdateField} />
          <NumberField label="FCF 增长率（%）" name="fcfGrowth" value={props.form.fcfGrowth} emptyIfZero onChange={props.onUpdateField} />
          <NumberField label="折现率 r（%）" name="discountRate" value={props.form.discountRate} emptyIfZero onChange={props.onUpdateField} />
          <NumberField label="永续增长率 g（%）" name="terminalGrowth" value={props.form.terminalGrowth} emptyIfZero onChange={props.onUpdateField} />
          <NumberField label="净负债（亿元，净现金填负）" name="netDebt" value={props.form.netDebt} emptyIfZero onChange={props.onUpdateField} />
          <NumberField label="总股本（亿股）" name="sharesOutstanding" value={props.form.sharesOutstanding} emptyIfZero onChange={props.onUpdateField} />
        </div>

        <h3>相对估值参数</h3>
        <div className="form-grid">
          <NumberField label="每股收益 EPS（元）" name="eps" value={props.form.eps} emptyIfZero onChange={props.onUpdateField} />
          <NumberField label="每股净资产 BVPS（元）" name="bvps" value={props.form.bvps} emptyIfZero onChange={props.onUpdateField} />
          <NumberField label="每股 EBITDA（元）" name="ebitdaPerShare" value={props.form.ebitdaPerShare} emptyIfZero onChange={props.onUpdateField} />
          <NumberField label="行业中位 PE" name="industryPE" value={props.form.industryPE} emptyIfZero onChange={props.onUpdateField} />
          <NumberField label="行业中位 PB" name="industryPB" value={props.form.industryPB} emptyIfZero onChange={props.onUpdateField} />
          <NumberField label="行业中位 EV/EBITDA" name="industryEVEBITDA" value={props.form.industryEVEBITDA} emptyIfZero onChange={props.onUpdateField} />
        </div>

        <h3>DDM 参数</h3>
        <div className="form-grid">
          <NumberField label="每股分红 D0（元）" name="dividend0" value={props.form.dividend0} emptyIfZero onChange={props.onUpdateField} />
          <NumberField label="阶段增长率 g1（%）" name="dividendGrowth" value={props.form.dividendGrowth} emptyIfZero onChange={props.onUpdateField} />
          <NumberField label="阶段年数" name="ddmYears" min={1} max={20} step={1} value={props.form.ddmYears} emptyIfZero onChange={props.onUpdateField} />
          <NumberField label="必要回报率 k（%）" name="requiredReturn" value={props.form.requiredReturn} emptyIfZero onChange={props.onUpdateField} />
          <NumberField label="稳定增长率 g2（%）" name="stableGrowth" value={props.form.stableGrowth} emptyIfZero onChange={props.onUpdateField} />
        </div>

        <h3>质量评分（0-100）</h3>
        <div className="form-grid">
          <NumberField label="ROIC（%）" name="roic" value={props.form.roic} emptyIfZero onChange={props.onUpdateField} />
          <NumberField label="资产负债率替代：D/E" name="deRatio" value={props.form.deRatio} emptyIfZero onChange={props.onUpdateField} />
          <NumberField label="FCF 转化率（%）" name="fcfConversion" value={props.form.fcfConversion} emptyIfZero onChange={props.onUpdateField} />
          <NumberField label="治理评分" name="governanceScore" min={0} max={100} step={1} value={props.form.governanceScore} emptyIfZero onChange={props.onUpdateField} />
          <NumberField label="护城河评分" name="moatScore" min={0} max={100} step={1} value={props.form.moatScore} emptyIfZero onChange={props.onUpdateField} />
        </div>

        <h3>快照</h3>
        <div className="form-grid snapshot-grid">
          <label>
            快照名称
            <input
              value={props.snapshotDraftName}
              onChange={(e) => props.onSnapshotDraftNameChange(e.target.value)}
              placeholder={buildSnapshotName(props.activeStockName, props.form.ticker, props.currentSourceTradeDate)}
            />
          </label>
          <label>
            快照标签（逗号分隔）
            <input
              value={props.snapshotDraftTags}
              onChange={(e) => props.onSnapshotDraftTagsChange(e.target.value)}
              placeholder="例如：白马, 半导体, 低估"
            />
          </label>
          <button type="button" onClick={props.onSaveSnapshot}>保存当前快照</button>
        </div>
        {props.snapshotMessage ? <p className="snapshot-note">{props.snapshotMessage}</p> : null}
      </section>

      <section className="panel result-panel">
        <h2>评估结果</h2>
        <div className="overview">
          <div className="row">
            <strong>{props.activeStockName}</strong>
            <span className={`tag ${props.finalGrade.cls}`}>{props.finalGrade.label}</span>
          </div>
          <div className="kpi">
            <div className="item"><div>当前价格</div><div className="v">{formatMaybeYuan(props.form.price)}</div></div>
            <div className="item"><div>内在价值</div><div className="v">{formatMaybeYuan(props.result.intrinsicValue)}</div></div>
            <div className="item"><div>安全边际</div><div className="v">{formatMaybePct(props.result.marginSafety)}</div></div>
            <div className="item"><div>质量评分</div><div className="v">{props.result.qualityScore}</div></div>
            <div className="item"><div>结果置信度</div><div className="v">{formatPct(props.result.confidence)}</div></div>
          </div>
        </div>

        <div className="cards">
          {props.result.models.map((m) => (
            <div className="card" key={m.key}>
              <div className="row">
                <strong>{m.name}</strong>
                <span className="tag">{m.valid ? `置信度 ${formatPct(m.confidence || 0)}` : '未采用'}</span>
              </div>
              {m.valid ? (
                <>
                  <div>估值：<strong>{formatMaybeYuan(m.value || 0)}</strong></div>
                  <div>假设：{m.assumptions}</div>
                </>
              ) : (
                <div>{m.reason}</div>
              )}
            </div>
          ))}
        </div>

        <div className="sensitivity">
          <h3>DCF 敏感性分析</h3>
          {props.result.sensitivity.length ? props.result.sensitivity.map((s) => (
            <div className="bar" key={s.label}>
              <div>{s.label}</div>
              <div className="track"><div className="fill" style={{ width: `${(s.value / props.sensitivityMax) * 100}%` }}></div></div>
              <div>{formatMaybeYuan(s.value)}</div>
            </div>
          )) : <p>DCF 不可用，无法生成敏感性分析。</p>}
        </div>

        <div className="warnings">
          {props.result.warnings.map((w) => <div key={w} className="warn-item">{w}</div>)}
        </div>
        <p className="disclaimer">免责声明：本工具仅用于学习研究，不构成任何投资建议。市场有风险，决策需独立判断。</p>
      </section>
    </main>
  )
}
