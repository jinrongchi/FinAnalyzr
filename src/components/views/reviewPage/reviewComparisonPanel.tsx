import { useEffect, useMemo, useState } from 'react'
import { COMPARISON_FIELDS } from '../../../lib/comparisonFields'
import { formatMaybeNumber, formatMaybePct, formatMaybeYuan } from '../../../lib/displayFormat'
import type { Snapshot } from '../../../types'
import { formatCapeMethod, formatThermometerStatus } from './reviewHelpers'

type ReviewComparisonPanelProps = {
  snapshots: Snapshot[]
  compareA?: Snapshot
  compareB?: Snapshot
  compareAId: string
  compareBId: string
  onCompareAIdChange: (id: string) => void
  onCompareBIdChange: (id: string) => void
}

export function ReviewComparisonPanel(props: ReviewComparisonPanelProps) {
  const {
    snapshots,
    compareA,
    compareB,
    compareAId,
    compareBId,
    onCompareAIdChange,
    onCompareBIdChange,
  } = props

  const [showOtherStocksForB, setShowOtherStocksForB] = useState(false)
  const [showAdvancedComparison, setShowAdvancedComparison] = useState(false)
  const [showRiskOnlyComparison, setShowRiskOnlyComparison] = useState(false)
  const [showWorseningOnlyComparison, setShowWorseningOnlyComparison] = useState(false)

  const aOptions = useMemo(() => snapshots, [snapshots])
  const selectedATicker = compareA?.form.ticker
  const bOptions = useMemo(() => {
    return snapshots.filter((s) => {
      if (s.id === compareAId) return false
      if (showOtherStocksForB || !selectedATicker) return true
      return s.form.ticker === selectedATicker
    })
  }, [snapshots, compareAId, showOtherStocksForB, selectedATicker])

  useEffect(() => {
    if (showOtherStocksForB || !compareAId) return
    if (!compareBId) return
    if (bOptions.some((s) => s.id === compareBId)) return

    onCompareBIdChange(bOptions[0]?.id || '')
  }, [showOtherStocksForB, compareAId, compareBId, bOptions, onCompareBIdChange])

  function canShowAdvancedRow(isRiskRow: boolean, isWorsening = false): boolean {
    const riskPass = !showRiskOnlyComparison || isRiskRow
    const worseningPass = !showWorseningOnlyComparison || isWorsening
    return riskPass && worseningPass
  }

  return (
    <section className="panel">
      <h2>参数版本对比</h2>
      <div className="compare-controls">
        <button
          type="button"
          className="history-btn-secondary"
          onClick={() => setShowAdvancedComparison((v) => !v)}
        >
          {showAdvancedComparison ? '收起矩阵扩展项' : '展开矩阵扩展项'}
        </button>
        <label className="compare-risk-only-toggle">
          <input
            type="checkbox"
            checked={showRiskOnlyComparison}
            onChange={(e) => setShowRiskOnlyComparison(e.target.checked)}
          />
          仅看风险变化
        </label>
        <label className="compare-risk-only-toggle">
          <input
            type="checkbox"
            checked={showWorseningOnlyComparison}
            onChange={(e) => setShowWorseningOnlyComparison(e.target.checked)}
          />
          仅看风险恶化
        </label>
      </div>
      <div className="form-grid">
        <label>
          版本 A
          <select value={compareAId || ''} onChange={(e) => onCompareAIdChange(e.target.value)}>
            <option value="" disabled>请选择版本 A</option>
            {aOptions.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label>
          版本 B
          <select value={compareBId || ''} onChange={(e) => onCompareBIdChange(e.target.value)}>
            <option value="" disabled>请选择版本 B</option>
            {bOptions.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <span className="compare-b-scope">
            <input
              type="checkbox"
              checked={showOtherStocksForB}
              onChange={(e) => setShowOtherStocksForB(e.target.checked)}
            />
            显示其他股票
          </span>
        </label>
      </div>

      {!compareA || !compareB ? <p>至少保存 2 个快照后可进行对比。</p> : (
        <div className="compare-table">
          <div className="compare-row head">
            <div>字段</div>
            <div>{compareA.label}</div>
            <div>{compareB.label}</div>
            <div>变化</div>
          </div>
          {COMPARISON_FIELDS.map((f) => {
            const a = Number(compareA?.form[f.key])
            const b = Number(compareB?.form[f.key])
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
            <div>{formatMaybeYuan(compareA.result.intrinsicValue)}</div>
            <div>{formatMaybeYuan(compareB.result.intrinsicValue)}</div>
            <div className={compareB.result.intrinsicValue - compareA.result.intrinsicValue >= 0 ? 'delta-up' : 'delta-down'}>
              {formatMaybeYuan(compareB.result.intrinsicValue - compareA.result.intrinsicValue)}
            </div>
          </div>
          <div className="compare-row emphasis">
            <div>安全边际</div>
            <div>{formatMaybePct(compareA.result.marginSafety)}</div>
            <div>{formatMaybePct(compareB.result.marginSafety)}</div>
            <div className={compareB.result.marginSafety - compareA.result.marginSafety >= 0 ? 'delta-up' : 'delta-down'}>
              {formatMaybePct(compareB.result.marginSafety - compareA.result.marginSafety)}
            </div>
          </div>
          {showAdvancedComparison ? (
            <>
              {canShowAdvancedRow(((compareB.result.intrinsicRange?.conservative || 0) - (compareA.result.intrinsicRange?.conservative || 0)) < 0, ((compareB.result.intrinsicRange?.conservative || 0) - (compareA.result.intrinsicRange?.conservative || 0)) < 0) ? (
                <div className={`compare-row emphasis ${((compareB.result.intrinsicRange?.conservative || 0) - (compareA.result.intrinsicRange?.conservative || 0)) < 0 ? 'compare-row-risk' : 'compare-row-good'}`}>
                  <div>保守内在价值</div>
                  <div>{formatMaybeYuan(compareA.result.intrinsicRange?.conservative || 0)}</div>
                  <div>{formatMaybeYuan(compareB.result.intrinsicRange?.conservative || 0)}</div>
                  <div className={(compareB.result.intrinsicRange?.conservative || 0) - (compareA.result.intrinsicRange?.conservative || 0) >= 0 ? 'delta-up' : 'delta-down'}>
                    {formatMaybeYuan((compareB.result.intrinsicRange?.conservative || 0) - (compareA.result.intrinsicRange?.conservative || 0))}
                  </div>
                </div>
              ) : null}
              {canShowAdvancedRow((((compareB.result.intrinsicRange?.bull || 0) - (compareB.result.intrinsicRange?.bear || 0)) - ((compareA.result.intrinsicRange?.bull || 0) - (compareA.result.intrinsicRange?.bear || 0))) > 0, (((compareB.result.intrinsicRange?.bull || 0) - (compareB.result.intrinsicRange?.bear || 0)) - ((compareA.result.intrinsicRange?.bull || 0) - (compareA.result.intrinsicRange?.bear || 0))) > 0) ? (
                <div className="compare-row">
                  <div>估值区间(悲观-乐观)</div>
                  <div>
                    {formatMaybeYuan(compareA.result.intrinsicRange?.bear || 0)} - {formatMaybeYuan(compareA.result.intrinsicRange?.bull || 0)}
                  </div>
                  <div>
                    {formatMaybeYuan(compareB.result.intrinsicRange?.bear || 0)} - {formatMaybeYuan(compareB.result.intrinsicRange?.bull || 0)}
                  </div>
                  <div className={((compareB.result.intrinsicRange?.bull || 0) - (compareB.result.intrinsicRange?.bear || 0)) - ((compareA.result.intrinsicRange?.bull || 0) - (compareA.result.intrinsicRange?.bear || 0)) >= 0 ? 'delta-up' : 'delta-down'}>
                    {formatMaybeYuan(((compareB.result.intrinsicRange?.bull || 0) - (compareB.result.intrinsicRange?.bear || 0)) - ((compareA.result.intrinsicRange?.bull || 0) - (compareA.result.intrinsicRange?.bear || 0)))}
                  </div>
                </div>
              ) : null}
              {canShowAdvancedRow(((compareB.result.conservativeMarginSafety || 0) - (compareA.result.conservativeMarginSafety || 0)) < 0, ((compareB.result.conservativeMarginSafety || 0) - (compareA.result.conservativeMarginSafety || 0)) < 0) ? (
                <div className="compare-row">
                  <div>保守安全边际</div>
                  <div>{formatMaybePct(compareA.result.conservativeMarginSafety || 0)}</div>
                  <div>{formatMaybePct(compareB.result.conservativeMarginSafety || 0)}</div>
                  <div className={(compareB.result.conservativeMarginSafety || 0) - (compareA.result.conservativeMarginSafety || 0) >= 0 ? 'delta-up' : 'delta-down'}>
                    {formatMaybePct((compareB.result.conservativeMarginSafety || 0) - (compareA.result.conservativeMarginSafety || 0))}
                  </div>
                </div>
              ) : null}
              {canShowAdvancedRow(((compareB.result.thermometer?.spread || 0) - (compareA.result.thermometer?.spread || 0)) < 0, ((compareB.result.thermometer?.spread || 0) - (compareA.result.thermometer?.spread || 0)) < 0) ? (
                <div className="compare-row">
                  <div>股债利差(%)</div>
                  <div>{formatMaybeNumber(compareA.result.thermometer?.spread || 0)}</div>
                  <div>{formatMaybeNumber(compareB.result.thermometer?.spread || 0)}</div>
                  <div className={(compareB.result.thermometer?.spread || 0) - (compareA.result.thermometer?.spread || 0) >= 0 ? 'delta-up' : 'delta-down'}>
                    {formatMaybeNumber((compareB.result.thermometer?.spread || 0) - (compareA.result.thermometer?.spread || 0))}
                  </div>
                </div>
              ) : null}
              {canShowAdvancedRow(compareA.result.thermometer?.status !== 'hot' && compareB.result.thermometer?.status === 'hot', compareA.result.thermometer?.status !== 'hot' && compareB.result.thermometer?.status === 'hot') ? (
                <div className="compare-row">
                  <div>温度计状态</div>
                  <div>{formatThermometerStatus(compareA.result.thermometer?.status)}</div>
                  <div>{formatThermometerStatus(compareB.result.thermometer?.status)}</div>
                  <div className={compareA.result.thermometer?.status !== 'hot' && compareB.result.thermometer?.status === 'hot' ? 'delta-down' : compareA.result.thermometer?.status !== 'cold' && compareB.result.thermometer?.status === 'cold' ? 'delta-up' : ''}>
                    {formatThermometerStatus(compareA.result.thermometer?.status)} → {formatThermometerStatus(compareB.result.thermometer?.status)}
                  </div>
                </div>
              ) : null}
              {canShowAdvancedRow(((compareB.result.redFlags?.flags.length || 0) - (compareA.result.redFlags?.flags.length || 0)) > 0, ((compareB.result.redFlags?.flags.length || 0) - (compareA.result.redFlags?.flags.length || 0)) > 0) ? (
                <div className={`compare-row ${((compareB.result.redFlags?.flags.length || 0) - (compareA.result.redFlags?.flags.length || 0)) > 0 ? 'compare-row-risk' : 'compare-row-good'}`}>
                  <div>红旗数量</div>
                  <div>{compareA.result.redFlags?.flags.length || 0}</div>
                  <div>{compareB.result.redFlags?.flags.length || 0}</div>
                  <div className={(compareB.result.redFlags?.flags.length || 0) - (compareA.result.redFlags?.flags.length || 0) <= 0 ? 'delta-up' : 'delta-down'}>
                    {(compareB.result.redFlags?.flags.length || 0) - (compareA.result.redFlags?.flags.length || 0)}
                  </div>
                </div>
              ) : null}
              {canShowAdvancedRow(((compareB.result.longTermReturn?.annualTotal || 0) - (compareA.result.longTermReturn?.annualTotal || 0)) < -0.01, ((compareB.result.longTermReturn?.annualTotal || 0) - (compareA.result.longTermReturn?.annualTotal || 0)) < -0.01) ? (
                <div className={`compare-row ${((compareB.result.longTermReturn?.annualTotal || 0) - (compareA.result.longTermReturn?.annualTotal || 0)) < -0.01 ? 'compare-row-risk' : 'compare-row-good'}`}>
                  <div>长期年化回报</div>
                  <div>{formatMaybePct(compareA.result.longTermReturn?.annualTotal || 0)}</div>
                  <div>{formatMaybePct(compareB.result.longTermReturn?.annualTotal || 0)}</div>
                  <div className={(compareB.result.longTermReturn?.annualTotal || 0) - (compareA.result.longTermReturn?.annualTotal || 0) >= 0 ? 'delta-up' : 'delta-down'}>
                    {formatMaybePct((compareB.result.longTermReturn?.annualTotal || 0) - (compareA.result.longTermReturn?.annualTotal || 0))}
                  </div>
                </div>
              ) : null}
              {canShowAdvancedRow(formatCapeMethod(compareA) !== formatCapeMethod(compareB), formatCapeMethod(compareA) !== formatCapeMethod(compareB)) ? (
                <div className="compare-row">
                  <div>CAPE口径</div>
                  <div>{formatCapeMethod(compareA)}</div>
                  <div>{formatCapeMethod(compareB)}</div>
                  <div>{formatCapeMethod(compareA)} → {formatCapeMethod(compareB)}</div>
                </div>
              ) : null}
              {canShowAdvancedRow(((compareB.result.percentileCloud?.find((p) => p.metric === 'PE')?.percentile10y || 0) - (compareA.result.percentileCloud?.find((p) => p.metric === 'PE')?.percentile10y || 0)) > 10, ((compareB.result.percentileCloud?.find((p) => p.metric === 'PE')?.percentile10y || 0) - (compareA.result.percentileCloud?.find((p) => p.metric === 'PE')?.percentile10y || 0)) > 10) ? (
                <div className="compare-row">
                  <div>PE/PB/PCF 分位(5Y/10Y)</div>
                  <div>
                    {formatMaybeNumber(compareA.result.percentileCloud?.find((p) => p.metric === 'PE')?.percentile5y || 0)} / {formatMaybeNumber(compareA.result.percentileCloud?.find((p) => p.metric === 'PE')?.percentile10y || 0)}<br />
                    {formatMaybeNumber(compareA.result.percentileCloud?.find((p) => p.metric === 'PB')?.percentile5y || 0)} / {formatMaybeNumber(compareA.result.percentileCloud?.find((p) => p.metric === 'PB')?.percentile10y || 0)}<br />
                    {formatMaybeNumber(compareA.result.percentileCloud?.find((p) => p.metric === 'PCF')?.percentile5y || 0)} / {formatMaybeNumber(compareA.result.percentileCloud?.find((p) => p.metric === 'PCF')?.percentile10y || 0)}
                  </div>
                  <div>
                    {formatMaybeNumber(compareB.result.percentileCloud?.find((p) => p.metric === 'PE')?.percentile5y || 0)} / {formatMaybeNumber(compareB.result.percentileCloud?.find((p) => p.metric === 'PE')?.percentile10y || 0)}<br />
                    {formatMaybeNumber(compareB.result.percentileCloud?.find((p) => p.metric === 'PB')?.percentile5y || 0)} / {formatMaybeNumber(compareB.result.percentileCloud?.find((p) => p.metric === 'PB')?.percentile10y || 0)}<br />
                    {formatMaybeNumber(compareB.result.percentileCloud?.find((p) => p.metric === 'PCF')?.percentile5y || 0)} / {formatMaybeNumber(compareB.result.percentileCloud?.find((p) => p.metric === 'PCF')?.percentile10y || 0)}
                  </div>
                  <div className={((compareB.result.percentileCloud?.find((p) => p.metric === 'PE')?.percentile10y || 0) - (compareA.result.percentileCloud?.find((p) => p.metric === 'PE')?.percentile10y || 0)) >= 0 ? 'delta-up' : 'delta-down'}>
                    ΔPE(5Y) {formatMaybeNumber((compareB.result.percentileCloud?.find((p) => p.metric === 'PE')?.percentile5y || 0) - (compareA.result.percentileCloud?.find((p) => p.metric === 'PE')?.percentile5y || 0))}<br />
                    ΔPE(10Y) {formatMaybeNumber((compareB.result.percentileCloud?.find((p) => p.metric === 'PE')?.percentile10y || 0) - (compareA.result.percentileCloud?.find((p) => p.metric === 'PE')?.percentile10y || 0))}
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="compare-row compare-row-collapsed-note">
              <div>矩阵扩展项</div>
              <div>已折叠</div>
              <div>点击上方按钮展开</div>
              <div>-</div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
