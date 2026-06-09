import { useEffect, useMemo, useState } from 'react'
import { COMPARISON_FIELDS } from '../../lib/comparisonFields'
import { formatMaybeNumber, formatMaybePct, formatMaybeYuan } from '../../lib/displayFormat'
import { formatTradeDate } from '../../lib/historyDate'
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
  onAddSnapshotTags: (id: string, tags: string[]) => void
  onSetSnapshotTags: (id: string, tags: string[]) => void
  onDeleteSnapshot: (id: string) => void
  onCompareAIdChange: (id: string) => void
  onCompareBIdChange: (id: string) => void
}

function tagColorClass(tag: string): string {
  const hash = tag.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0)
  return `tag-chip--${hash % 6}`
}

function formatThermometerStatus(value?: 'cold' | 'neutral' | 'hot'): string {
  if (!value) return 'N/A'
  if (value === 'cold') return '偏冷'
  if (value === 'hot') return '偏热'
  return '中性'
}

function formatCapeMethod(snapshot?: Snapshot): string {
  if (!snapshot) return 'N/A'
  const source = snapshot.fieldSources?.cape
  const note = snapshot.fieldNotes?.cape || ''
  if (source === 'manual') return '手工输入'
  if (note.includes('CPI不可用')) return '名义利润(降级)'
  if (note.includes('CPI均值')) return '通胀调整'
  if ((snapshot.form.cape || 0) > 0) return '已提供'
  return 'N/A'
}

function snapshotRiskBadge(snapshot: Snapshot): { text: string; cls: string; reasons: string[] } {
  const redFlagCount = snapshot.result.redFlags?.flags.length || 0
  const hot = snapshot.result.thermometer?.status === 'hot'
  const lowConfidence = snapshot.result.confidence < 0.6
  const reasons: string[] = []
  if (redFlagCount > 0) reasons.push(`红旗 ${redFlagCount} 项`) 
  if (hot) reasons.push('估值温度偏热')
  if (lowConfidence) reasons.push('估值置信度偏低')
  if (redFlagCount > 0) return { text: '高风险', cls: 'risk-high', reasons }
  if (hot || lowConfidence) return { text: '中风险', cls: 'risk-mid', reasons }
  return { text: '低风险', cls: 'risk-low', reasons: ['当前未触发明显风险信号'] }
}

export function ReviewView(props: ReviewViewProps) {
  const { compareAId, compareBId, onCompareBIdChange } = props
  const [snapshotQuery, setSnapshotQuery] = useState('')
  const [snapshotValuationFilter, setSnapshotValuationFilter] = useState<'all' | 'undervalued' | 'overvalued'>('all')
  const [snapshotRiskFilter, setSnapshotRiskFilter] = useState<'all' | 'low' | 'mid' | 'high'>('all')
  const [sortConfig, setSortConfig] = useState<{
    priority: Array<'time' | 'stock' | 'gap' | 'valuation'>
    direction: Record<'time' | 'stock' | 'gap' | 'valuation', 'asc' | 'desc'>
  }>({
    priority: ['time'],
    direction: {
      time: 'desc',
      stock: 'asc',
      gap: 'desc',
      valuation: 'asc',
    },
  })
  const [addingTagForId, setAddingTagForId] = useState<string | null>(null)
  const [newTagsInput, setNewTagsInput] = useState('')
  const [editingTag, setEditingTag] = useState<{ snapshotId: string; originalTag: string; value: string } | null>(null)
  const [showOtherStocksForB, setShowOtherStocksForB] = useState(false)
  const [showAdvancedComparison, setShowAdvancedComparison] = useState(false)
  const [showRiskOnlyComparison, setShowRiskOnlyComparison] = useState(false)
  const [showWorseningOnlyComparison, setShowWorseningOnlyComparison] = useState(false)
  const [riskDetailSnapshotId, setRiskDetailSnapshotId] = useState<string | null>(null)
  const [riskReasonCopiedId, setRiskReasonCopiedId] = useState<string | null>(null)
  const [prioritizeRiskSorting, setPrioritizeRiskSorting] = useState(false)

  const aOptions = useMemo(() => props.snapshots, [props.snapshots])
  const selectedATicker = props.compareA?.form.ticker
  const bOptions = useMemo(() => {
    return props.snapshots.filter((s) => {
      if (s.id === compareAId) return false
      if (showOtherStocksForB || !selectedATicker) return true
      return s.form.ticker === selectedATicker
    })
  }, [props.snapshots, compareAId, showOtherStocksForB, selectedATicker])

  useEffect(() => {
    if (showOtherStocksForB || !compareAId) return
    if (!compareBId) return
    if (bOptions.some((s) => s.id === compareBId)) return

    // Keep B aligned with current A scope; fall back to the first eligible option.
    onCompareBIdChange(bOptions[0]?.id || '')
  }, [showOtherStocksForB, compareAId, compareBId, bOptions, onCompareBIdChange])

  useEffect(() => {
    if (!riskDetailSnapshotId) return

    function onDocClick(event: MouseEvent): void {
      const target = event.target as HTMLElement | null
      if (!target) return
      if (target.closest('.snapshot-risk-detail') || target.closest('.snapshot-risk-pill')) return
      setRiskDetailSnapshotId(null)
    }

    function onEsc(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setRiskDetailSnapshotId(null)
      }
    }

    window.addEventListener('click', onDocClick)
    window.addEventListener('keydown', onEsc)
    return () => {
      window.removeEventListener('click', onDocClick)
      window.removeEventListener('keydown', onEsc)
    }
  }, [riskDetailSnapshotId])

  const filteredSnapshots = useMemo(() => {
    const keyword = snapshotQuery.trim().toLowerCase()
    const filtered = props.snapshots.filter((s) => {
      const gap = s.result.intrinsicValue - s.form.price
      const matchesKeyword =
        !keyword ||
        s.label.toLowerCase().includes(keyword) ||
        s.form.ticker.toLowerCase().includes(keyword) ||
        s.tags.some((tag) => tag.toLowerCase().includes(keyword))
      const matchesValuation =
        snapshotValuationFilter === 'all'
          ? true
          : snapshotValuationFilter === 'undervalued'
            ? gap >= 0
            : gap < 0
      const risk = snapshotRiskBadge(s)
      const matchesRisk =
        snapshotRiskFilter === 'all'
          ? true
          : snapshotRiskFilter === 'low'
            ? risk.cls === 'risk-low'
            : snapshotRiskFilter === 'mid'
              ? risk.cls === 'risk-mid'
              : risk.cls === 'risk-high'
      return matchesKeyword && matchesValuation && matchesRisk
    })

    return [...filtered].sort((a, b) => {
      if (prioritizeRiskSorting) {
        const rank = (s: Snapshot): number => {
          const cls = snapshotRiskBadge(s).cls
          if (cls === 'risk-high') return 3
          if (cls === 'risk-mid') return 2
          return 1
        }
        const riskCmp = rank(b) - rank(a)
        if (riskCmp !== 0) return riskCmp
      }

      const aGap = a.result.intrinsicValue - a.form.price
      const bGap = b.result.intrinsicValue - b.form.price

      const valuationRank = (gap: number): number => {
        if (gap > 0) return 0 // low price vs intrinsic => undervalued
        if (gap < 0) return 2 // overvalued
        return 1 // fairly valued
      }

      for (const field of sortConfig.priority) {
        let cmp = 0

        if (field === 'time') {
          const aTime = Number(a.sourceTradeDate || 0)
          const bTime = Number(b.sourceTradeDate || 0)
          cmp = aTime - bTime
        } else if (field === 'stock') {
          cmp = a.form.ticker.localeCompare(b.form.ticker, 'zh-CN')
        } else if (field === 'gap') {
          cmp = aGap - bGap
        } else if (field === 'valuation') {
          cmp = valuationRank(aGap) - valuationRank(bGap)
        }

        if (cmp !== 0) {
          return sortConfig.direction[field] === 'asc' ? cmp : -cmp
        }
      }

      // Final tie-breaker keeps latest snapshots first.
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
  }, [props.snapshots, snapshotQuery, snapshotValuationFilter, snapshotRiskFilter, sortConfig, prioritizeRiskSorting])

  function toggleSort(field: 'time' | 'stock' | 'gap' | 'valuation'): void {
    setSortConfig((prev) => ({
      ...(() => {
        const active = prev.priority.includes(field)
        if (!active) {
          return {
            priority: [field, ...prev.priority],
            direction: {
              ...prev.direction,
              [field]: 'desc' as const,
            },
          }
        }

        const currentDir = prev.direction[field]
        if (currentDir === 'desc') {
          return {
            priority: [field, ...prev.priority.filter((f) => f !== field)],
            direction: {
              ...prev.direction,
              [field]: 'asc' as const,
            },
          }
        }

        return {
          priority: prev.priority.filter((f) => f !== field),
          direction: prev.direction,
        }
      })(),
    }))
  }

  function sortMarker(field: 'time' | 'stock' | 'gap' | 'valuation'): string {
    const index = sortConfig.priority.indexOf(field)
    if (index < 0) return ''
    return sortConfig.direction[field] === 'asc' ? ' ↑' : ' ↓'
  }

  function parseTags(raw: string): string[] {
    return raw.split(',').map((tag) => tag.trim()).filter(Boolean)
  }

  function startAddTag(snapshotId: string): void {
    setEditingTag(null)
    setAddingTagForId(snapshotId)
    setNewTagsInput('')
  }

  function cancelTagEditor(): void {
    setAddingTagForId(null)
    setNewTagsInput('')
    setEditingTag(null)
  }

  function confirmAddTag(snapshotId: string): void {
    const tags = parseTags(newTagsInput)
    if (tags.length) {
      props.onAddSnapshotTags(snapshotId, tags)
    }
    setAddingTagForId(null)
    setNewTagsInput('')
  }

  function startEditTag(snapshotId: string, tag: string): void {
    setAddingTagForId(null)
    setNewTagsInput('')
    setEditingTag({ snapshotId, originalTag: tag, value: tag })
  }

  function confirmEditTag(snapshot: Snapshot): void {
    if (!editingTag || editingTag.snapshotId !== snapshot.id) return
    const nextValue = editingTag.value.trim()
    const nextTags = snapshot.tags
      .map((tag) => (tag === editingTag.originalTag ? nextValue : tag))
      .filter(Boolean)
    props.onSetSnapshotTags(snapshot.id, nextTags)
    setEditingTag(null)
  }

  function canShowAdvancedRow(isRiskRow: boolean, isWorsening = false): boolean {
    const riskPass = !showRiskOnlyComparison || isRiskRow
    const worseningPass = !showWorseningOnlyComparison || isWorsening
    return riskPass && worseningPass
  }

  async function copyRiskReasons(id: string, reasons: string[]): Promise<void> {
    try {
      await navigator.clipboard.writeText(reasons.join('\n'))
      setRiskReasonCopiedId(id)
      window.setTimeout(() => setRiskReasonCopiedId((prev) => (prev === id ? null : prev)), 1200)
    } catch {
      setRiskReasonCopiedId(null)
    }
  }

  return (
    <main className="layout review-layout">
      <section className="panel">
        <h2>历史快照</h2>
        {props.snapshots.length === 0 ? <p>暂无快照，请先在估值页保存。</p> : (
          <div className="snapshot-table-wrap">
            <div className="snapshot-filters">
              <input
                type="text"
                value={snapshotQuery}
                placeholder="筛选：快照名称 / 股票代码 / 标签"
                onChange={(e) => setSnapshotQuery(e.target.value)}
              />
              <select value={snapshotValuationFilter} onChange={(e) => setSnapshotValuationFilter(e.target.value as 'all' | 'undervalued' | 'overvalued')}>
                <option value="all">全部估值状态</option>
                <option value="undervalued">仅低估（内在价值 {'>='} 当前股价）</option>
                <option value="overvalued">仅高估（内在价值 {'<'} 当前股价）</option>
              </select>
              <select value={snapshotRiskFilter} onChange={(e) => setSnapshotRiskFilter(e.target.value as 'all' | 'low' | 'mid' | 'high')}>
                <option value="all">全部风险等级</option>
                <option value="low">仅低风险</option>
                <option value="mid">仅中风险</option>
                <option value="high">仅高风险</option>
              </select>
              <label className="compare-risk-only-toggle snapshot-risk-sort-toggle">
                <input
                  type="checkbox"
                  checked={prioritizeRiskSorting}
                  onChange={(e) => setPrioritizeRiskSorting(e.target.checked)}
                />
                风险优先排序
              </label>
            </div>

            {filteredSnapshots.length === 0 ? <p className="status-note">没有符合筛选条件的快照。</p> : (
              <div className="snapshot-table-scroll">
                <table className="snapshot-table">
                  <thead>
                    <tr>
                      <th>快照</th>
                      <th className="sortable-th">
                        <button
                          type="button"
                          className="th-sort-btn"
                          onClick={() => toggleSort('time')}
                        >
                          时间{sortMarker('time')}
                        </button>
                      </th>
                      <th className="sortable-th">
                        <button
                          type="button"
                          className="th-sort-btn"
                          onClick={() => toggleSort('stock')}
                        >
                          股票{sortMarker('stock')}
                        </button>
                      </th>
                      <th>内在价值</th>
                      <th>当前股价</th>
                      <th>风险标签</th>
                      <th className="sortable-th">
                        <button
                          type="button"
                          className="th-sort-btn"
                          onClick={() => toggleSort('gap')}
                        >
                          差距%{sortMarker('gap')}
                        </button>
                      </th>
                      <th className="sortable-th">
                        <button
                          type="button"
                          className="th-sort-btn"
                          onClick={() => toggleSort('valuation')}
                        >
                          估值状态{sortMarker('valuation')}
                        </button>
                      </th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSnapshots.map((s) => {
                      const gap = s.result.intrinsicValue - s.form.price
                      const gapPct = s.form.price > 0 ? gap / s.form.price : 0
                      const valuationStatus = gap > 0 ? '低估' : gap < 0 ? '高估' : '接近合理'
                      const risk = snapshotRiskBadge(s)
                      return (
                        <tr key={s.id}>
                          <td>
                            <strong>{s.label}</strong>
                            <div className="snapshot-tag-row">
                              {s.tags.map((tag) => (
                                <span key={`${s.id}-${tag}`} className={`tag-chip ${tagColorClass(tag)}`}>
                                  <button
                                    type="button"
                                    className="tag-chip-label"
                                    onClick={() => startEditTag(s.id, tag)}
                                  >
                                    {tag}
                                  </button>
                                  <button
                                    type="button"
                                    className="tag-remove-btn"
                                    aria-label={`删除标签 ${tag}`}
                                    onClick={() => props.onSetSnapshotTags(s.id, s.tags.filter((t) => t !== tag))}
                                  >
                                    ✕
                                  </button>
                                </span>
                              ))}

                              {addingTagForId === s.id ? (
                                <div className="tag-inline-editor">
                                  <input
                                    type="text"
                                    value={newTagsInput}
                                    placeholder="输入标签（逗号分隔）"
                                    onChange={(e) => setNewTagsInput(e.target.value)}
                                  />
                                  <button type="button" className="tag-inline-cancel" aria-label="取消" onClick={cancelTagEditor}>✕</button>
                                  <button type="button" className="tag-inline-confirm" aria-label="确认" onClick={() => confirmAddTag(s.id)}>✔</button>
                                </div>
                              ) : editingTag?.snapshotId === s.id ? (
                                <div className="tag-inline-editor">
                                  <input
                                    type="text"
                                    value={editingTag.value}
                                    placeholder="编辑标签"
                                    onChange={(e) => setEditingTag({ ...editingTag, value: e.target.value })}
                                  />
                                  <button type="button" className="tag-inline-cancel" aria-label="取消" onClick={cancelTagEditor}>✕</button>
                                  <button type="button" className="tag-inline-confirm" aria-label="确认" onClick={() => confirmEditTag(s)}>✔</button>
                                </div>
                              ) : (
                                <button type="button" className="tag-add-btn" onClick={() => startAddTag(s.id)}>+tag</button>
                              )}
                            </div>
                          </td>
                          <td>{formatTradeDate(s.sourceTradeDate)}</td>
                          <td>{s.form.ticker}</td>
                          <td>{formatMaybeYuan(s.result.intrinsicValue)}</td>
                          <td>{formatMaybeYuan(s.form.price)}</td>
                          <td>
                            <button
                              type="button"
                              className={`snapshot-risk-pill ${risk.cls}`}
                              onClick={() => setRiskDetailSnapshotId((prev) => (prev === s.id ? null : s.id))}
                              title="点击查看风险原因"
                            >
                              {risk.text}
                            </button>
                            {riskDetailSnapshotId === s.id ? (
                              <div className="snapshot-risk-detail">
                                <div className="snapshot-risk-detail-title">风险原因</div>
                                <ul>
                                  {risk.reasons.map((r) => <li key={`${s.id}-${r}`}>{r}</li>)}
                                </ul>
                                <button type="button" className="history-btn-secondary" onClick={() => void copyRiskReasons(s.id, risk.reasons)}>
                                  {riskReasonCopiedId === s.id ? '已复制' : '复制原因'}
                                </button>
                              </div>
                            ) : null}
                          </td>
                          <td className={gap >= 0 ? 'delta-up' : 'delta-down'}>{formatMaybePct(gapPct)}</td>
                          <td className={gap >= 0 ? 'delta-up' : 'delta-down'}>{valuationStatus}</td>
                          <td><button type="button" onClick={() => props.onDeleteSnapshot(s.id)}>删除</button></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

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
            <select value={props.compareAId || ''} onChange={(e) => props.onCompareAIdChange(e.target.value)}>
              <option value="" disabled>请选择版本 A</option>
              {aOptions.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
          <label>
            版本 B
            <select value={props.compareBId || ''} onChange={(e) => props.onCompareBIdChange(e.target.value)}>
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
            {showAdvancedComparison ? (
              <>
            {canShowAdvancedRow(((props.compareB.result.intrinsicRange?.conservative || 0) - (props.compareA.result.intrinsicRange?.conservative || 0)) < 0, ((props.compareB.result.intrinsicRange?.conservative || 0) - (props.compareA.result.intrinsicRange?.conservative || 0)) < 0) ? (
            <div className={`compare-row emphasis ${((props.compareB.result.intrinsicRange?.conservative || 0) - (props.compareA.result.intrinsicRange?.conservative || 0)) < 0 ? 'compare-row-risk' : 'compare-row-good'}`}>
              <div>保守内在价值</div>
              <div>{formatMaybeYuan(props.compareA.result.intrinsicRange?.conservative || 0)}</div>
              <div>{formatMaybeYuan(props.compareB.result.intrinsicRange?.conservative || 0)}</div>
              <div className={(props.compareB.result.intrinsicRange?.conservative || 0) - (props.compareA.result.intrinsicRange?.conservative || 0) >= 0 ? 'delta-up' : 'delta-down'}>
                {formatMaybeYuan((props.compareB.result.intrinsicRange?.conservative || 0) - (props.compareA.result.intrinsicRange?.conservative || 0))}
              </div>
            </div>
            ) : null}
            {canShowAdvancedRow((((props.compareB.result.intrinsicRange?.bull || 0) - (props.compareB.result.intrinsicRange?.bear || 0)) - ((props.compareA.result.intrinsicRange?.bull || 0) - (props.compareA.result.intrinsicRange?.bear || 0))) > 0, (((props.compareB.result.intrinsicRange?.bull || 0) - (props.compareB.result.intrinsicRange?.bear || 0)) - ((props.compareA.result.intrinsicRange?.bull || 0) - (props.compareA.result.intrinsicRange?.bear || 0))) > 0) ? (
            <div className="compare-row">
              <div>估值区间(悲观-乐观)</div>
              <div>
                {formatMaybeYuan(props.compareA.result.intrinsicRange?.bear || 0)} - {formatMaybeYuan(props.compareA.result.intrinsicRange?.bull || 0)}
              </div>
              <div>
                {formatMaybeYuan(props.compareB.result.intrinsicRange?.bear || 0)} - {formatMaybeYuan(props.compareB.result.intrinsicRange?.bull || 0)}
              </div>
              <div className={((props.compareB.result.intrinsicRange?.bull || 0) - (props.compareB.result.intrinsicRange?.bear || 0)) - ((props.compareA.result.intrinsicRange?.bull || 0) - (props.compareA.result.intrinsicRange?.bear || 0)) >= 0 ? 'delta-up' : 'delta-down'}>
                {formatMaybeYuan(((props.compareB.result.intrinsicRange?.bull || 0) - (props.compareB.result.intrinsicRange?.bear || 0)) - ((props.compareA.result.intrinsicRange?.bull || 0) - (props.compareA.result.intrinsicRange?.bear || 0)))}
              </div>
            </div>
            ) : null}
            {canShowAdvancedRow(((props.compareB.result.conservativeMarginSafety || 0) - (props.compareA.result.conservativeMarginSafety || 0)) < 0, ((props.compareB.result.conservativeMarginSafety || 0) - (props.compareA.result.conservativeMarginSafety || 0)) < 0) ? (
            <div className="compare-row">
              <div>保守安全边际</div>
              <div>{formatMaybePct(props.compareA.result.conservativeMarginSafety || 0)}</div>
              <div>{formatMaybePct(props.compareB.result.conservativeMarginSafety || 0)}</div>
              <div className={(props.compareB.result.conservativeMarginSafety || 0) - (props.compareA.result.conservativeMarginSafety || 0) >= 0 ? 'delta-up' : 'delta-down'}>
                {formatMaybePct((props.compareB.result.conservativeMarginSafety || 0) - (props.compareA.result.conservativeMarginSafety || 0))}
              </div>
            </div>
            ) : null}
            {canShowAdvancedRow(((props.compareB.result.thermometer?.spread || 0) - (props.compareA.result.thermometer?.spread || 0)) < 0, ((props.compareB.result.thermometer?.spread || 0) - (props.compareA.result.thermometer?.spread || 0)) < 0) ? (
            <div className="compare-row">
              <div>股债利差(%)</div>
              <div>{formatMaybeNumber(props.compareA.result.thermometer?.spread || 0)}</div>
              <div>{formatMaybeNumber(props.compareB.result.thermometer?.spread || 0)}</div>
              <div className={(props.compareB.result.thermometer?.spread || 0) - (props.compareA.result.thermometer?.spread || 0) >= 0 ? 'delta-up' : 'delta-down'}>
                {formatMaybeNumber((props.compareB.result.thermometer?.spread || 0) - (props.compareA.result.thermometer?.spread || 0))}
              </div>
            </div>
            ) : null}
            {canShowAdvancedRow(props.compareA.result.thermometer?.status !== 'hot' && props.compareB.result.thermometer?.status === 'hot', props.compareA.result.thermometer?.status !== 'hot' && props.compareB.result.thermometer?.status === 'hot') ? (
            <div className="compare-row">
              <div>温度计状态</div>
              <div>{formatThermometerStatus(props.compareA.result.thermometer?.status)}</div>
              <div>{formatThermometerStatus(props.compareB.result.thermometer?.status)}</div>
              <div className={props.compareA.result.thermometer?.status !== 'hot' && props.compareB.result.thermometer?.status === 'hot' ? 'delta-down' : props.compareA.result.thermometer?.status !== 'cold' && props.compareB.result.thermometer?.status === 'cold' ? 'delta-up' : ''}>
                {formatThermometerStatus(props.compareA.result.thermometer?.status)} → {formatThermometerStatus(props.compareB.result.thermometer?.status)}
              </div>
            </div>
            ) : null}
            {canShowAdvancedRow(((props.compareB.result.redFlags?.flags.length || 0) - (props.compareA.result.redFlags?.flags.length || 0)) > 0, ((props.compareB.result.redFlags?.flags.length || 0) - (props.compareA.result.redFlags?.flags.length || 0)) > 0) ? (
            <div className={`compare-row ${((props.compareB.result.redFlags?.flags.length || 0) - (props.compareA.result.redFlags?.flags.length || 0)) > 0 ? 'compare-row-risk' : 'compare-row-good'}`}>
              <div>红旗数量</div>
              <div>{props.compareA.result.redFlags?.flags.length || 0}</div>
              <div>{props.compareB.result.redFlags?.flags.length || 0}</div>
              <div className={(props.compareB.result.redFlags?.flags.length || 0) - (props.compareA.result.redFlags?.flags.length || 0) <= 0 ? 'delta-up' : 'delta-down'}>
                {(props.compareB.result.redFlags?.flags.length || 0) - (props.compareA.result.redFlags?.flags.length || 0)}
              </div>
            </div>
            ) : null}
            {canShowAdvancedRow(((props.compareB.result.longTermReturn?.annualTotal || 0) - (props.compareA.result.longTermReturn?.annualTotal || 0)) < -0.01, ((props.compareB.result.longTermReturn?.annualTotal || 0) - (props.compareA.result.longTermReturn?.annualTotal || 0)) < -0.01) ? (
            <div className={`compare-row ${((props.compareB.result.longTermReturn?.annualTotal || 0) - (props.compareA.result.longTermReturn?.annualTotal || 0)) < -0.01 ? 'compare-row-risk' : 'compare-row-good'}`}>
              <div>长期年化回报</div>
              <div>{formatMaybePct(props.compareA.result.longTermReturn?.annualTotal || 0)}</div>
              <div>{formatMaybePct(props.compareB.result.longTermReturn?.annualTotal || 0)}</div>
              <div className={(props.compareB.result.longTermReturn?.annualTotal || 0) - (props.compareA.result.longTermReturn?.annualTotal || 0) >= 0 ? 'delta-up' : 'delta-down'}>
                {formatMaybePct((props.compareB.result.longTermReturn?.annualTotal || 0) - (props.compareA.result.longTermReturn?.annualTotal || 0))}
              </div>
            </div>
            ) : null}
            {canShowAdvancedRow(formatCapeMethod(props.compareA) !== formatCapeMethod(props.compareB), formatCapeMethod(props.compareA) !== formatCapeMethod(props.compareB)) ? (
            <div className="compare-row">
              <div>CAPE口径</div>
              <div>{formatCapeMethod(props.compareA)}</div>
              <div>{formatCapeMethod(props.compareB)}</div>
              <div>{formatCapeMethod(props.compareA)} → {formatCapeMethod(props.compareB)}</div>
            </div>
            ) : null}
            {canShowAdvancedRow(((props.compareB.result.percentileCloud?.find((p) => p.metric === 'PE')?.percentile10y || 0) - (props.compareA.result.percentileCloud?.find((p) => p.metric === 'PE')?.percentile10y || 0)) > 10, ((props.compareB.result.percentileCloud?.find((p) => p.metric === 'PE')?.percentile10y || 0) - (props.compareA.result.percentileCloud?.find((p) => p.metric === 'PE')?.percentile10y || 0)) > 10) ? (
            <div className="compare-row">
              <div>PE/PB/PCF 分位(5Y/10Y)</div>
              <div>
                {formatMaybeNumber(props.compareA.result.percentileCloud?.find((p) => p.metric === 'PE')?.percentile5y || 0)} / {formatMaybeNumber(props.compareA.result.percentileCloud?.find((p) => p.metric === 'PE')?.percentile10y || 0)}<br />
                {formatMaybeNumber(props.compareA.result.percentileCloud?.find((p) => p.metric === 'PB')?.percentile5y || 0)} / {formatMaybeNumber(props.compareA.result.percentileCloud?.find((p) => p.metric === 'PB')?.percentile10y || 0)}<br />
                {formatMaybeNumber(props.compareA.result.percentileCloud?.find((p) => p.metric === 'PCF')?.percentile5y || 0)} / {formatMaybeNumber(props.compareA.result.percentileCloud?.find((p) => p.metric === 'PCF')?.percentile10y || 0)}
              </div>
              <div>
                {formatMaybeNumber(props.compareB.result.percentileCloud?.find((p) => p.metric === 'PE')?.percentile5y || 0)} / {formatMaybeNumber(props.compareB.result.percentileCloud?.find((p) => p.metric === 'PE')?.percentile10y || 0)}<br />
                {formatMaybeNumber(props.compareB.result.percentileCloud?.find((p) => p.metric === 'PB')?.percentile5y || 0)} / {formatMaybeNumber(props.compareB.result.percentileCloud?.find((p) => p.metric === 'PB')?.percentile10y || 0)}<br />
                {formatMaybeNumber(props.compareB.result.percentileCloud?.find((p) => p.metric === 'PCF')?.percentile5y || 0)} / {formatMaybeNumber(props.compareB.result.percentileCloud?.find((p) => p.metric === 'PCF')?.percentile10y || 0)}
              </div>
              <div className={((props.compareB.result.percentileCloud?.find((p) => p.metric === 'PE')?.percentile10y || 0) - (props.compareA.result.percentileCloud?.find((p) => p.metric === 'PE')?.percentile10y || 0)) >= 0 ? 'delta-up' : 'delta-down'}>
                ΔPE(5Y) {formatMaybeNumber((props.compareB.result.percentileCloud?.find((p) => p.metric === 'PE')?.percentile5y || 0) - (props.compareA.result.percentileCloud?.find((p) => p.metric === 'PE')?.percentile5y || 0))}<br />
                ΔPE(10Y) {formatMaybeNumber((props.compareB.result.percentileCloud?.find((p) => p.metric === 'PE')?.percentile10y || 0) - (props.compareA.result.percentileCloud?.find((p) => p.metric === 'PE')?.percentile10y || 0))}
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
