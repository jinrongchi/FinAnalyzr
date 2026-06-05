import { COMPARISON_FIELDS } from '../../lib/comparisonFields'
import { formatMaybeNumber, formatMaybePct, formatMaybeYuan } from '../../lib/displayFormat'
import type { AttributionResult, BacktestPoint, Snapshot } from '../../types'

type ReviewViewProps = {
  snapshots: Snapshot[]
  compareA?: Snapshot
  compareB?: Snapshot
  compareAId: string
  compareBId: string
  backtestSeries: BacktestPoint[]
  attribution: AttributionResult | null
  backtestMax: number
  attributionMax: number
  onDeleteSnapshot: (id: string) => void
  onCompareAIdChange: (id: string) => void
  onCompareBIdChange: (id: string) => void
}

export function ReviewView(props: ReviewViewProps) {
  return (
    <main className="layout review-layout">
      <section className="panel">
        <h2>历史快照</h2>
        {props.snapshots.length === 0 ? <p>暂无快照，请先在估值页保存。</p> : (
          <div className="snapshots-list">
            {props.snapshots.map((s) => (
              <div className="snapshot-item" key={s.id}>
                <div>
                  <strong>{s.label}</strong>
                  <div>{new Date(s.createdAt).toLocaleString('zh-CN')}</div>
                  <div>{s.form.ticker} · 价值 {formatMaybeYuan(s.result.intrinsicValue)}</div>
                </div>
                <button type="button" onClick={() => props.onDeleteSnapshot(s.id)}>删除</button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <h2>参数版本对比</h2>
        <div className="form-grid">
          <label>
            版本 A
            <select value={props.compareAId || ''} onChange={(e) => props.onCompareAIdChange(e.target.value)}>
              {props.snapshots.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
          <label>
            版本 B
            <select value={props.compareBId || ''} onChange={(e) => props.onCompareBIdChange(e.target.value)}>
              {props.snapshots.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
        </div>

        {!props.compareA || !props.compareB ? <p>至少保存 2 个快照后可进行对比。</p> : (
          <div className="compare-table">
            <div className="compare-row head">
              <div>字段</div>
              <div>{props.compareA.label}</div>
              <div>{props.compareB.label}</div>
              <div>变化</div>
            </div>
            {COMPARISON_FIELDS.map((f) => {
              const a = Number(props.compareA?.form[f.key])
              const b = Number(props.compareB?.form[f.key])
              const delta = b - a
              return (
                <div className="compare-row" key={f.key}>
                  <div>{f.label}</div>
                  <div>{formatMaybeNumber(a)}</div>
                  <div>{formatMaybeNumber(b)}</div>
                  <div className={delta >= 0 ? 'delta-up' : 'delta-down'}>{formatMaybeNumber(delta)}</div>
                </div>
              )
            })}
            <div className="compare-row emphasis">
              <div>内在价值</div>
              <div>{formatMaybeYuan(props.compareA.result.intrinsicValue)}</div>
              <div>{formatMaybeYuan(props.compareB.result.intrinsicValue)}</div>
              <div className={props.compareB.result.intrinsicValue - props.compareA.result.intrinsicValue >= 0 ? 'delta-up' : 'delta-down'}>
                {formatMaybeYuan(props.compareB.result.intrinsicValue - props.compareA.result.intrinsicValue)}
              </div>
            </div>
            <div className="compare-row emphasis">
              <div>安全边际</div>
              <div>{formatMaybePct(props.compareA.result.marginSafety)}</div>
              <div>{formatMaybePct(props.compareB.result.marginSafety)}</div>
              <div className={props.compareB.result.marginSafety - props.compareA.result.marginSafety >= 0 ? 'delta-up' : 'delta-down'}>
                {formatMaybePct(props.compareB.result.marginSafety - props.compareA.result.marginSafety)}
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>估值回测图</h2>
        <p className="sub">基于相邻快照对比“当时预测收益率”与“后续实际收益率”。</p>
        {props.backtestSeries.length === 0 ? <p>至少保存 2 个快照后可生成回测图。</p> : (
          <div className="metric-chart">
            {props.backtestSeries.map((point) => (
              <div className="metric-group" key={`${point.fromId}-${point.toId}`}>
                <div className="metric-label">{point.fromLabel} → {point.toLabel}</div>
                <div className="metric-row">
                  <span>预测</span>
                  <div className="metric-track">
                    <div
                      className={`metric-fill ${point.predictedReturn >= 0 ? 'metric-up' : 'metric-down'}`}
                      style={{ width: `${(Math.abs(point.predictedReturn) / props.backtestMax) * 100}%` }}
                    ></div>
                  </div>
                  <strong>{formatMaybePct(point.predictedReturn)}</strong>
                </div>
                <div className="metric-row">
                  <span>实际</span>
                  <div className="metric-track">
                    <div
                      className={`metric-fill ${point.realizedReturn >= 0 ? 'metric-up' : 'metric-down'}`}
                      style={{ width: `${(Math.abs(point.realizedReturn) / props.backtestMax) * 100}%` }}
                    ></div>
                  </div>
                  <strong>{formatMaybePct(point.realizedReturn)}</strong>
                </div>
                <div className="metric-row">
                  <span>偏差</span>
                  <div className="metric-track">
                    <div
                      className={`metric-fill ${point.predictionError >= 0 ? 'metric-up' : 'metric-down'}`}
                      style={{ width: `${(Math.abs(point.predictionError) / props.backtestMax) * 100}%` }}
                    ></div>
                  </div>
                  <strong>{formatMaybePct(point.predictionError)}</strong>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <h2>假设偏差归因图</h2>
        <p className="sub">展示 A 版本到 B 版本内在价值变化中，各核心假设的贡献。</p>
        {!props.attribution ? <p>请先选择两个版本进行归因。</p> : (
          <>
            <div className="kpi attribution-kpi">
              <div className="item"><div>总变化</div><div className="v">{formatMaybeYuan(props.attribution.totalDelta)}</div></div>
              <div className="item"><div>已解释</div><div className="v">{formatMaybeYuan(props.attribution.explainedDelta)}</div></div>
              <div className="item"><div>残差</div><div className="v">{formatMaybeYuan(props.attribution.residualDelta)}</div></div>
            </div>

            <div className="metric-chart attribution-chart">
              {props.attribution.items.map((item) => (
                <div className="metric-row" key={item.key}>
                  <span>{item.label}</span>
                  <div className="metric-track">
                    <div
                      className={`metric-fill ${item.contribution >= 0 ? 'metric-up' : 'metric-down'}`}
                      style={{ width: `${(Math.abs(item.contribution) / props.attributionMax) * 100}%` }}
                    ></div>
                  </div>
                  <strong>{formatMaybeYuan(item.contribution)}</strong>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  )
}
