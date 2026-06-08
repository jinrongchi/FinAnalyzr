import { useMemo, useState } from 'react'
import { formatMaybeYuan } from '../../lib/displayFormat'
import { formatTradeDate, getRefreshStatus } from '../../lib/historyDate'
import type { SearchHistoryEntry } from '../../types'

type HistoryViewProps = {
  historyMessage: string
  historyItemFeedback: { id: string; message: string; tone: 'success' | 'error' | 'info' } | null
  searchHistory: SearchHistoryEntry[]
  loadingTushare: boolean
  updatingHistoryId: string
  onSelectHistory: (item: SearchHistoryEntry) => void
  onRefreshHistoryItem: (item: SearchHistoryEntry) => void
  onAddSnapshotFromHistory: (item: SearchHistoryEntry) => void
  onRemoveHistory: (id: string) => void
}

function getUpdateBadge(updatedAt: string, isLatest: boolean): { text: string; cls: string } {
  if (isLatest) {
    return { text: '最新', cls: 'history-badge-latest' }
  }

  const ageMs = Date.now() - new Date(updatedAt).getTime()
  const ageHours = ageMs / (1000 * 60 * 60)
  if (ageHours <= 24) {
    return { text: '今日已更新', cls: 'history-badge-fresh' }
  }
  if (ageHours <= 72) {
    return { text: '近3天更新', cls: 'history-badge-mid' }
  }
  return { text: '超过3天未更新', cls: 'history-badge-stale' }
}

export function HistoryView(props: HistoryViewProps) {
  const [historyQuery, setHistoryQuery] = useState('')
  const latestHistoryId = useMemo(() => {
    return props.searchHistory.reduce<{ id: string; ts: number } | null>((latest, item) => {
      const ts = new Date(item.updatedAt).getTime()
      if (!latest || ts > latest.ts) {
        return { id: item.id, ts }
      }
      return latest
    }, null)?.id || ''
  }, [props.searchHistory])

  const filteredHistory = useMemo(() => {
    const keyword = historyQuery.trim().toLowerCase()
    if (!keyword) return props.searchHistory
    return props.searchHistory.filter((item) => {
      return (
        item.stockName.toLowerCase().includes(keyword)
        || item.ticker.toLowerCase().includes(keyword)
      )
    })
  }, [historyQuery, props.searchHistory])

  return (
    <main className="layout review-layout">
      <section className="panel">
        <h2>股票搜索历史</h2>
        <p className="sub">复用已搜索过的数据，减少 TuShare 重复调用。</p>
        <input
          type="text"
          className="history-search-input"
          value={historyQuery}
          placeholder="搜索：股票名称 / 代码"
          onChange={(e) => setHistoryQuery(e.target.value)}
        />
        {props.historyMessage ? <p className="status-note">{props.historyMessage}</p> : null}
        {props.searchHistory.length === 0 ? <p>暂无历史记录，请先在估值页执行一次 TuShare 查询。</p> : filteredHistory.length === 0 ? (
          <p className="status-note">没有匹配当前搜索条件的历史记录。</p>
        ) : (
          <div className="history-list">
            {filteredHistory.map((item) => {
              const badge = getUpdateBadge(item.updatedAt, item.id === latestHistoryId)
              return (
              <div className="history-item" key={item.id}>
                <div className="history-main">
                  <div className="history-title">
                    <strong>{item.stockName} {item.ticker}</strong>
                    <span className={`history-update-badge ${badge.cls}`}>{badge.text}</span>
                    <span>股价 {formatMaybeYuan(item.form.price)}</span>
                  </div>
                  <div>股票数据日：{formatTradeDate(item.sourceTradeDate)}</div>
                  <div>最后更新：{new Date(item.updatedAt).toLocaleString('zh-CN')}</div>
                </div>
                <div className="history-actions">
                  <button type="button" className="history-btn-primary" onClick={() => props.onSelectHistory(item)}>进入估值页</button>
                  {(() => {
                    const rs = getRefreshStatus(item.sourceTradeDate)
                    const disabled = props.loadingTushare || !rs.canRefresh
                    return (
                      <button
                        type="button"
                        className={`history-btn-secondary ${disabled ? 'muted-action' : ''}`}
                        disabled={disabled}
                        title={rs.reason}
                        onClick={() => props.onRefreshHistoryItem(item)}
                      >
                        {props.updatingHistoryId === item.id ? '同步中...' : '更新数据'}
                      </button>
                    )
                  })()}
                  <button type="button" className="history-btn-secondary" onClick={() => props.onAddSnapshotFromHistory(item)}>添加快照</button>
                  <button
                    type="button"
                    className="history-btn-danger"
                    onClick={() => {
                      const confirmed = window.confirm(`确认删除 ${item.stockName} (${item.ticker}) 的历史记录？`)
                      if (!confirmed) return
                      props.onRemoveHistory(item.id)
                    }}
                  >
                    删除
                  </button>
                  {props.historyItemFeedback?.id === item.id ? (
                    <p className={`history-inline-feedback history-inline-feedback-${props.historyItemFeedback.tone}`}>{props.historyItemFeedback.message}</p>
                  ) : null}
                </div>
              </div>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}
