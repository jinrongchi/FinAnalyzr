import { formatMaybeYuan } from '../../lib/displayFormat'
import { formatTradeDate, getRefreshStatus } from '../../lib/historyDate'
import type { SearchHistoryEntry } from '../../types'

type HistoryViewProps = {
  historyMessage: string
  searchHistory: SearchHistoryEntry[]
  loadingTushare: boolean
  updatingHistoryId: string
  onSelectHistory: (item: SearchHistoryEntry) => void
  onRefreshHistoryItem: (item: SearchHistoryEntry) => void
  onAddSnapshotFromHistory: (item: SearchHistoryEntry) => void
  onRemoveHistory: (id: string) => void
}

export function HistoryView(props: HistoryViewProps) {
  return (
    <main className="layout review-layout">
      <section className="panel">
        <h2>股票搜索历史</h2>
        <p className="sub">复用已搜索过的数据，减少 TuShare 重复调用。</p>
        {props.historyMessage ? <p className="status-note">{props.historyMessage}</p> : null}
        {props.searchHistory.length === 0 ? <p>暂无历史记录，请先在估值页执行一次 TuShare 查询。</p> : (
          <div className="history-list">
            {props.searchHistory.map((item) => (
              <div className="history-item" key={item.id}>
                <div className="history-main">
                  <div className="history-title">
                    <strong>{item.stockName}</strong>
                    <span>股价 {formatMaybeYuan(item.form.price)}</span>
                  </div>
                  <div>{item.ticker}</div>
                  <div>股票数据日：{formatTradeDate(item.sourceTradeDate)}</div>
                  <div>查询时间：{new Date(item.fetchedAt).toLocaleString('zh-CN')}</div>
                </div>
                <div className="history-actions">
                  <button type="button" onClick={() => props.onSelectHistory(item)}>进入估值页</button>
                  {(() => {
                    const rs = getRefreshStatus(item.sourceTradeDate)
                    const disabled = props.loadingTushare || !rs.canRefresh
                    return (
                      <button
                        type="button"
                        className={disabled ? 'muted-action' : ''}
                        disabled={disabled}
                        title={rs.reason}
                        onClick={() => props.onRefreshHistoryItem(item)}
                      >
                        {props.updatingHistoryId === item.id ? '同步中...' : '更新数据'}
                      </button>
                    )
                  })()}
                  <button type="button" onClick={() => props.onAddSnapshotFromHistory(item)}>添加快照</button>
                  <button type="button" onClick={() => props.onRemoveHistory(item.id)}>删除</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
