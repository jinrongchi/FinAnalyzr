import { useEffect, useMemo, useState } from 'react'
import { formatTradeDate } from '../lib/historyDate'
import { logger } from '../lib/logger'
import { loadTushareToken, persistTushareToken } from '../lib/tokenStore'
import { getTushareHealthUrl, loadFromTushare } from '../lib/tushare'
import type { FieldNotes, FieldSources, FormState, SearchHistoryEntry } from '../types'

type SyncResult = {
  mergedForm: FormState
  stockName: string
  sourceTradeDate?: string
  createdAt?: string
  notes: string[]
  fieldSources?: FieldSources
  fieldNotes?: FieldNotes
}

type SyncOutcome =
  | { ok: true; data: SyncResult }
  | { ok: false; error: string }

export function useTushareSync() {
  const [token, setTokenState] = useState(() => loadTushareToken())
  const [hasServerToken, setHasServerToken] = useState(false)
  const [syncStatus, setSyncStatus] = useState('')
  const [loadingTushare, setLoadingTushare] = useState(false)
  const [updatingHistoryId, setUpdatingHistoryId] = useState('')
  const [currentStockName, setCurrentStockName] = useState('')
  const [currentSourceTradeDate, setCurrentSourceTradeDate] = useState<string | undefined>(undefined)
  const hasUiToken = token.trim().length > 0
  const canUseTushare = hasUiToken || hasServerToken
  const effectiveToken = useMemo(() => token.trim(), [token])

  useEffect(() => {
    let active = true

    async function detectServerToken(): Promise<void> {
      try {
        const response = await fetch(getTushareHealthUrl())
        if (!response.ok) return
        const json = (await response.json()) as { hasServerToken?: boolean }
        if (!active) return
        const available = Boolean(json.hasServerToken)
        setHasServerToken(available)
      } catch {
        if (!active) return
        setHasServerToken(false)
      }
    }

    void detectServerToken()

    return () => {
      active = false
    }
  }, [hasUiToken])

  function setToken(value: string): void {
    setTokenState(value)
    persistTushareToken(value)
  }

  function resetCurrentStockContext(): void {
    setCurrentStockName('')
    setCurrentSourceTradeDate(undefined)
  }

  function setCurrentStockContext(stockName: string, sourceTradeDate?: string): void {
    setCurrentStockName(stockName)
    setCurrentSourceTradeDate(sourceTradeDate)
  }

  async function syncAnalyzerForm(form: FormState, forceRefresh = false): Promise<SyncOutcome> {
    if (!form.ticker.trim()) {
      const error = '请先输入股票代码后再同步 TuShare。'
      setSyncStatus(error)
      return { ok: false, error }
    }

    if (!canUseTushare) {
      const error = '请先保存 TuShare Token 后再同步。'
      setSyncStatus(error)
      return { ok: false, error }
    }

    logger.info('fetch button clicked', {
      ticker: form.ticker,
      forceRefresh,
    })

    try {
      setLoadingTushare(true)
      const loaded = await loadFromTushare(effectiveToken, form.ticker, form, { forceRefresh })
      const mergedForm = { ...form, ...loaded.patch }
      const stockName = loaded.stockName || mergedForm.ticker

      setCurrentStockName(stockName)
      setCurrentSourceTradeDate(loaded.sourceTradeDate)

      setSyncStatus(`已加载 ${stockName}，交易日 ${formatTradeDate(loaded.sourceTradeDate)}。`)

      logger.info('fetch success', {
        ticker: mergedForm.ticker,
        sourceTradeDate: loaded.sourceTradeDate,
        stockName: loaded.stockName,
      })

      return {
        ok: true,
        data: {
          mergedForm,
          stockName,
          sourceTradeDate: loaded.sourceTradeDate,
          notes: loaded.notes,
          fieldSources: loaded.fieldSources,
          fieldNotes: loaded.fieldNotes,
        },
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : '未知错误'
      setSyncStatus(`TuShare 同步失败：${msg}`)
      logger.error('fetch failed', { ticker: form.ticker, error: msg })
      return { ok: false, error: msg }
    } finally {
      setLoadingTushare(false)
    }
  }

  async function syncHistoryItem(item: SearchHistoryEntry): Promise<SyncOutcome> {
    if (!canUseTushare) {
      const error = '请先保存 TuShare Token 后再更新历史数据。'
      setSyncStatus(error)
      return { ok: false, error }
    }

    try {
      setLoadingTushare(true)
      setUpdatingHistoryId(item.id)

      const loaded = await loadFromTushare(effectiveToken, item.ticker, item.form, { forceRefresh: true })
      const mergedForm = { ...item.form, ...loaded.patch }
      const stockName = loaded.stockName || item.stockName || mergedForm.ticker

      return {
        ok: true,
        data: {
          mergedForm,
          stockName,
          sourceTradeDate: loaded.sourceTradeDate,
          createdAt: item.createdAt,
          notes: loaded.notes,
          fieldSources: loaded.fieldSources,
          fieldNotes: loaded.fieldNotes,
        },
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : '未知错误'
      return { ok: false, error: msg }
    } finally {
      setLoadingTushare(false)
      setUpdatingHistoryId('')
    }
  }

  return {
    token,
    hasServerToken,
    canUseTushare,
    setToken,
    syncStatus,
    setSyncStatus,
    loadingTushare,
    updatingHistoryId,
    currentStockName,
    currentSourceTradeDate,
    resetCurrentStockContext,
    setCurrentStockContext,
    syncAnalyzerForm,
    syncHistoryItem,
  }
}
