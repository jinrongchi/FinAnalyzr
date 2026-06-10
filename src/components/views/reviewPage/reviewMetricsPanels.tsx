import { formatMaybePct, formatMaybeYuan } from '../../../lib/displayFormat'
import type { AttributionResult, BacktestPoint } from '../../../types'

type BacktestPanelProps = {
  backtestSeries: BacktestPoint[]
  backtestMax: number
}

export function BacktestPanel(props: BacktestPanelProps) {
  return (
    <section className="panel">
      <h2>估值回测图</h2>
      <p className="sub">仅展示当前 A/B 选择下的对比结果。</p>
      {props.backtestSeries.length === 0 ? <p>请先选择两个不同版本后查看回测结果。</p> : (
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
  )
}

type AttributionPanelProps = {
  attribution: AttributionResult | null
  attributionMax: number
}

export function AttributionPanel(props: AttributionPanelProps) {
  return (
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
  )
}
