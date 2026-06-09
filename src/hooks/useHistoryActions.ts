import { buildSnapshotName, formatTradeDate } from '../lib/historyDate'
import { logger } from '../lib/logger'
import type { FormState, SearchHistoryEntry } from '../types'

type UseHistoryActionsOptions = {
  saveHistoryEntry: (input: {
    ticker: string
    stockName?: string
    sourceTradeDate?: string
    createdAt?: string
    form: FormState
  }) => void
  removeHistoryEntry: (id: string) => void
  syncHistoryItem: (item: SearchHistoryEntry) => Promise<
    | {
        ok: true
        data: {
          mergedForm: FormState
          stockName: string
          sourceTradeDate?: string
          createdAt?: string
          notes: string[]
        }
      }
    | { ok: false; error: string }
  >
  setForm: (form: FormState) => void
  setCurrentStockContext: (stockName: string, sourceTradeDate?: string) => void
  setSnapshotDraftName: (value: string) => void
  setSnapshotMessage: (value: string) => void
  setHistoryMessage: (value: string) => void
  setHistoryItemFeedback: (value: { id: string; message: string; tone: 'success' | 'error' | 'info' } | null) => void
  setSyncStatus: (value: string) => void
  setView: (view: 'analyzer' | 'history' | 'review') => void
  clearFieldMetadata: () => void
}

export function useHistoryActions(options: UseHistoryActionsOptions) {
  async function handleRefreshHistoryItem(item: SearchHistoryEntry): Promise<void> {
    const synced = await options.syncHistoryItem(item)
    if (!synced.ok) {
      options.setHistoryItemFeedback({ id: item.id, message: `更新失败：${synced.error}`, tone: 'error' })
      options.setHistoryMessage(`历史数据更新失败：${synced.error}`)
      return
    }

    const { mergedForm, stockName, sourceTradeDate, createdAt } = synced.data
    options.saveHistoryEntry({
      ticker: mergedForm.ticker,
      stockName,
      sourceTradeDate,
      createdAt,
      form: mergedForm,
    })
    const message = `已更新 ${stockName}，交易日 ${formatTradeDate(sourceTradeDate)}`
    options.setHistoryItemFeedback({ id: item.id, message, tone: 'success' })
    options.setHistoryMessage('')
  }

  function handleSelectHistory(item: SearchHistoryEntry): void {
    options.clearFieldMetadata()
    options.setForm(item.form)
    options.setCurrentStockContext(item.stockName, item.sourceTradeDate)
    options.setSnapshotDraftName(buildSnapshotName(item.stockName, item.ticker, item.sourceTradeDate))
    options.setSnapshotMessage('')
    options.setView('analyzer')
    options.setSyncStatus(`已加载历史记录：${item.stockName} (${item.ticker})，交易日 ${formatTradeDate(item.sourceTradeDate)}`)
    logger.info('history item selected', {
      ticker: item.ticker,
      sourceTradeDate: item.sourceTradeDate,
    })
  }

  function handleRemoveHistory(id: string): void {
    options.removeHistoryEntry(id)
  }

  return {
    handleRefreshHistoryItem,
    handleSelectHistory,
    handleRemoveHistory,
  }
}
