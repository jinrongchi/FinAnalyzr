export type RefreshStatus = { canRefresh: boolean; reason: string }

export function formatTradeDate(sourceTradeDate?: string): string {
  if (!sourceTradeDate) return 'N/A'
  if (sourceTradeDate.length !== 8) return sourceTradeDate
  return `${sourceTradeDate.slice(0, 4)}-${sourceTradeDate.slice(4, 6)}-${sourceTradeDate.slice(6, 8)}`
}

export function parseTradeDate(sourceTradeDate?: string): Date | null {
  if (!sourceTradeDate || sourceTradeDate.length !== 8) return null
  const y = Number(sourceTradeDate.slice(0, 4))
  const m = Number(sourceTradeDate.slice(4, 6))
  const d = Number(sourceTradeDate.slice(6, 8))
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null
  return new Date(y, m - 1, d)
}

export function getRefreshStatus(sourceTradeDate?: string): RefreshStatus {
  if (!sourceTradeDate) {
    return { canRefresh: false, reason: '尚未加载数据' }
  }
  const tradeDate = parseTradeDate(sourceTradeDate)
  if (!tradeDate) {
    return { canRefresh: false, reason: '尚未加载数据' }
  }

  const now = new Date()
  const todayDay = now.getDay() // 0=Sun,1=Mon,...,6=Sat
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tradeStart = new Date(tradeDate.getFullYear(), tradeDate.getMonth(), tradeDate.getDate())
  const diffDays = Math.floor((todayStart.getTime() - tradeStart.getTime()) / (24 * 60 * 60 * 1000))

  // Find most recent Friday relative to today.
  const daysToLastFri = todayDay === 0 ? 2 : todayDay === 6 ? 1 : todayDay === 1 ? 3 : 0
  if (daysToLastFri > 0) {
    const lastFri = new Date(todayStart)
    lastFri.setDate(lastFri.getDate() - daysToLastFri)
    if (tradeStart.getTime() === lastFri.getTime()) {
      return { canRefresh: false, reason: `上一交易日（周五 ${formatTradeDate(sourceTradeDate)}）数据已是最新` }
    }
  }

  if (diffDays > 1) {
    return { canRefresh: true, reason: `数据交易日：${formatTradeDate(sourceTradeDate)}，可更新` }
  }

  return { canRefresh: false, reason: `数据交易日：${formatTradeDate(sourceTradeDate)}，已是最新` }
}

export function buildSnapshotName(stockName: string, ticker: string, sourceTradeDate?: string): string {
  const safeName = stockName || ticker || '未命名股票'
  return `${safeName} ${formatTradeDate(sourceTradeDate)}`
}
