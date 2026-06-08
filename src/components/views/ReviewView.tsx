import { useMemo, useState } from 'react'
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

export function ReviewView(props: ReviewViewProps) {
  const [snapshotQuery, setSnapshotQuery] = useState('')
  const [snapshotValuationFilter, setSnapshotValuationFilter] = useState<'all' | 'undervalued' | 'overvalued'>('all')
  const [snapshotSort, setSnapshotSort] = useState<'newest' | 'oldest' | 'gap-desc' | 'gap-asc'>('newest')
  const [addingTagForId, setAddingTagForId] = useState<string | null>(null)
  const [newTagsInput, setNewTagsInput] = useState('')
  const [editingTag, setEditingTag] = useState<{ snapshotId: string; originalTag: string; value: string } | null>(null)

  const aOptions = props.snapshots.filter((s) => s.id !== props.compareBId)
  const bOptions = props.snapshots.filter((s) => s.id !== props.compareAId)
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
      return matchesKeyword && matchesValuation
    })

    return [...filtered].sort((a, b) => {
      const aGap = a.result.intrinsicValue - a.form.price
      const bGap = b.result.intrinsicValue - b.form.price
      if (snapshotSort === 'newest') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      if (snapshotSort === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      if (snapshotSort === 'gap-desc') return bGap - aGap
      return aGap - bGap
    })
  }, [props.snapshots, snapshotQuery, snapshotSort, snapshotValuationFilter])

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
              <select value={snapshotSort} onChange={(e) => setSnapshotSort(e.target.value as 'newest' | 'oldest' | 'gap-desc' | 'gap-asc')}>
                <option value="newest">按时间：最新在前</option>
                <option value="oldest">按时间：最早在前</option>
                <option value="gap-desc">按差距：高到低</option>
                <option value="gap-asc">按差距：低到高</option>
              </select>
            </div>

            {filteredSnapshots.length === 0 ? <p className="status-note">没有符合筛选条件的快照。</p> : (
              <div className="snapshot-table-scroll">
                <table className="snapshot-table">
                  <thead>
                    <tr>
                      <th>快照</th>
                      <th>时间</th>
                      <th>股票</th>
                      <th>内在价值</th>
                      <th>当前股价</th>
                      <th>差距%</th>
                      <th>估值状态</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSnapshots.map((s) => {
                      const gap = s.result.intrinsicValue - s.form.price
                      const gapPct = s.form.price > 0 ? gap / s.form.price : 0
                      const valuationStatus = gap > 0 ? '低估' : gap < 0 ? '高估' : '接近合理'
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
