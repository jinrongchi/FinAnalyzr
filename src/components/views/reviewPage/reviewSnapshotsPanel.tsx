import { useEffect, useMemo, useState } from 'react'
import { formatMaybePct, formatMaybeYuan } from '../../../lib/displayFormat'
import { formatTradeDate } from '../../../lib/historyDate'
import type { Snapshot } from '../../../types'
import { snapshotRiskBadge, tagColorClass } from './reviewHelpers'

type SnapshotSortField = 'time' | 'stock' | 'risk' | 'gap' | 'valuation'

type SnapshotPanelProps = {
  snapshots: Snapshot[]
  onAddSnapshotTags: (id: string, tags: string[]) => void
  onSetSnapshotTags: (id: string, tags: string[]) => void
  onDeleteSnapshot: (id: string) => void
}

export function ReviewSnapshotsPanel(props: SnapshotPanelProps) {
  const [snapshotQuery, setSnapshotQuery] = useState('')
  const [snapshotValuationFilter, setSnapshotValuationFilter] = useState<'all' | 'undervalued' | 'overvalued'>('all')
  const [snapshotRiskFilter, setSnapshotRiskFilter] = useState<'all' | 'low' | 'mid' | 'high'>('all')
  const [sortConfig, setSortConfig] = useState<{
    priority: SnapshotSortField[]
    direction: Record<SnapshotSortField, 'asc' | 'desc'>
  }>({
    priority: ['time'],
    direction: {
      time: 'desc',
      stock: 'asc',
      risk: 'desc',
      gap: 'desc',
      valuation: 'asc',
    },
  })
  const [addingTagForId, setAddingTagForId] = useState<string | null>(null)
  const [newTagsInput, setNewTagsInput] = useState('')
  const [editingTag, setEditingTag] = useState<{ snapshotId: string; originalTag: string; value: string } | null>(null)
  const [riskDetailSnapshotId, setRiskDetailSnapshotId] = useState<string | null>(null)
  const [riskReasonCopiedId, setRiskReasonCopiedId] = useState<string | null>(null)

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
        !keyword
        || s.label.toLowerCase().includes(keyword)
        || s.form.ticker.toLowerCase().includes(keyword)
        || s.tags.some((tag) => tag.toLowerCase().includes(keyword))
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
      const aGap = a.result.intrinsicValue - a.form.price
      const bGap = b.result.intrinsicValue - b.form.price
      const riskRank = (snapshot: Snapshot): number => {
        const cls = snapshotRiskBadge(snapshot).cls
        if (cls === 'risk-high') return 2
        if (cls === 'risk-mid') return 1
        return 0
      }

      const valuationRank = (gap: number): number => {
        if (gap > 0) return 0
        if (gap < 0) return 2
        return 1
      }

      for (const field of sortConfig.priority) {
        let cmp = 0

        if (field === 'time') {
          const aTime = Number(a.sourceTradeDate || 0)
          const bTime = Number(b.sourceTradeDate || 0)
          cmp = aTime - bTime
        } else if (field === 'stock') {
          cmp = a.form.ticker.localeCompare(b.form.ticker, 'zh-CN')
        } else if (field === 'risk') {
          cmp = riskRank(a) - riskRank(b)
        } else if (field === 'gap') {
          cmp = aGap - bGap
        } else if (field === 'valuation') {
          cmp = valuationRank(aGap) - valuationRank(bGap)
        }

        if (cmp !== 0) {
          return sortConfig.direction[field] === 'asc' ? cmp : -cmp
        }
      }

      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
  }, [props.snapshots, snapshotQuery, snapshotValuationFilter, snapshotRiskFilter, sortConfig])

  function toggleSort(field: SnapshotSortField): void {
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

  function sortMarker(field: SnapshotSortField): string {
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
          </div>

          {filteredSnapshots.length === 0 ? <p className="status-note">没有符合筛选条件的快照。</p> : (
            <div className="snapshot-table-scroll">
              <table className="snapshot-table">
                <thead>
                  <tr>
                    <th>快照</th>
                    <th className="sortable-th">
                      <button type="button" className="th-sort-btn" onClick={() => toggleSort('time')}>
                        时间{sortMarker('time')}
                      </button>
                    </th>
                    <th className="sortable-th">
                      <button type="button" className="th-sort-btn" onClick={() => toggleSort('stock')}>
                        股票{sortMarker('stock')}
                      </button>
                    </th>
                    <th>内在价值</th>
                    <th>当前股价</th>
                    <th className="sortable-th">
                      <button type="button" className="th-sort-btn" onClick={() => toggleSort('risk')}>
                        风险标签{sortMarker('risk')}
                      </button>
                    </th>
                    <th className="sortable-th">
                      <button type="button" className="th-sort-btn" onClick={() => toggleSort('gap')}>
                        差距%{sortMarker('gap')}
                      </button>
                    </th>
                    <th className="sortable-th">
                      <button type="button" className="th-sort-btn" onClick={() => toggleSort('valuation')}>
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
                                <button type="button" className="tag-chip-label" onClick={() => startEditTag(s.id, tag)}>
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
  )
}
