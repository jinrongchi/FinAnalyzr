import { useEffect, useMemo, useState } from 'react'
import { AnalyzerView } from './components/views/analyzerPage/AnalyzerView'
import { HistoryView } from './components/views/HistoryView'
import { ReviewView } from './components/views/reviewPage/ReviewView'
import { useAnalyzerForm } from './hooks/useAnalyzerForm'
import { useAppViewState } from './hooks/useAppViewState'
import { useFieldMetadata } from './hooks/useFieldMetadata'
import { useHistoryActions } from './hooks/useHistoryActions'
import { useSearchHistory } from './hooks/useSearchHistory'
import { useSnapshots } from './hooks/useSnapshots'
import { useTushareSync } from './hooks/useTushareSync'
import { useTushareTokenSession } from './hooks/useTushareTokenSession'
import { buildBacktestSeries, computeAssumptionAttribution } from './lib/backtest'
import { ATTRIBUTION_FIELDS } from './lib/comparisonFields'
import { buildSnapshotName } from './lib/historyDate'
import { logger } from './lib/logger'
import { analyze, grade } from './lib/valuation/index'
import type { SearchHistoryEntry } from './types'

function App() {
  const [historyItemFeedback, setHistoryItemFeedback] = useState<{ id: string; message: string; tone: 'success' | 'error' | 'info' } | null>(null)
  const {
    fieldSources,
    fieldNotes,
    clearFieldMetadata,
    applySyncedMetadata,
    markManualField,
  } = useFieldMetadata()

  const {
    searchHistory,
    saveHistoryEntry,
    removeHistoryEntry,
  } = useSearchHistory()
  const {
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
  } = useTushareSync()
  const {
    editingToken,
    tokenDraft,
    setTokenDraft,
    handleSaveToken,
    handleChangeToken,
    handleClearToken,
    handleCancelTokenEdit,
  } = useTushareTokenSession({
    token,
    setToken,
    setSyncStatus,
  })
  const {
    snapshots,
    compareA,
    compareB,
    compareAId,
    setCompareAId,
    compareBId,
    setCompareBId,
    saveSnapshotWithOverwrite,
    addSnapshotTags,
    setSnapshotTags,
    deleteSnapshotEntry,
  } = useSnapshots()
  const {
    view,
    setView,
    switchView,
    snapshotDraftName,
    setSnapshotDraftName,
    snapshotDraftTags,
    setSnapshotDraftTags,
    snapshotMessage,
    setSnapshotMessage,
    historyMessage,
    setHistoryMessage,
    resetForTickerChange,
  } = useAppViewState(() => undefined)
  const {
    form,
    setForm,
    updateField,
    handleInputChange,
    resetForm,
  } = useAnalyzerForm(() => {
    resetForTickerChange()
    resetCurrentStockContext()
    clearFieldMetadata()
  })
  const {
    handleRefreshHistoryItem,
    handleSelectHistory,
    handleRemoveHistory,
  } = useHistoryActions({
    saveHistoryEntry,
    removeHistoryEntry,
    syncHistoryItem,
    setForm,
    setCurrentStockContext,
    setSnapshotDraftName,
    setSnapshotMessage,
    setHistoryMessage,
    setHistoryItemFeedback,
    setSyncStatus,
    setView: (nextView) => {
      if (nextView !== 'history') {
        setHistoryItemFeedback(null)
      }
      setView(nextView)
    },
    clearFieldMetadata,
  })

  async function handleFetchTushare(forceRefresh = false): Promise<void> {
    setSnapshotMessage('')
    const synced = await syncAnalyzerForm(form, forceRefresh)
    if (!synced.ok) return

    const { mergedForm, stockName, sourceTradeDate, fieldSources: sources, fieldNotes: notesByField } = synced.data
    setForm(mergedForm)
    applySyncedMetadata(sources, notesByField)
    setSnapshotDraftName(buildSnapshotName(stockName, mergedForm.ticker, sourceTradeDate))

    saveHistoryEntry({
      ticker: mergedForm.ticker,
      stockName,
      sourceTradeDate,
      form: mergedForm,
    })
    setHistoryMessage('')
  }

  function handleUpdateField(name: keyof typeof form, value: string): void {
    updateField(name, value)
    if (name === 'ticker') return

    markManualField(name)
  }

  const result = useMemo(() => analyze(form), [form])
  const finalGrade = grade(result.marginSafety)
  const sensitivityMax = Math.max(1, ...result.sensitivity.map((s) => s.value))
  const stockNameByTicker = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of searchHistory) {
      map.set(item.ticker, item.stockName)
    }
    return map
  }, [searchHistory])
  const activeStockName = useMemo(
    () => currentStockName || stockNameByTicker.get(form.ticker) || form.ticker || '未命名股票',
    [currentStockName, stockNameByTicker, form.ticker],
  )
  const backtestSeries = useMemo(() => {
    if (!compareAId || !compareBId || compareAId === compareBId) return []
    return buildBacktestSeries([compareA, compareB].filter((s): s is NonNullable<typeof s> => Boolean(s)))
  }, [compareA, compareAId, compareB, compareBId])
  const attribution = useMemo(
    () => (compareA && compareB ? computeAssumptionAttribution(compareA, compareB, ATTRIBUTION_FIELDS) : null),
    [compareA, compareB],
  )
  const backtestMax = useMemo(
    () => Math.max(
      0.01,
      ...backtestSeries.flatMap((point) => [
        Math.abs(point.predictedReturn),
        Math.abs(point.realizedReturn),
        Math.abs(point.predictionError),
      ]),
    ),
    [backtestSeries],
  )
  const attributionMax = useMemo(
    () => Math.max(0.01, ...(attribution?.items.map((item) => Math.abs(item.contribution)) || [0])),
    [attribution],
  )

  useEffect(() => {
    if (snapshotDraftName.trim()) return
    if (!form.ticker.trim()) return

    const stockLabel = currentStockName || stockNameByTicker.get(form.ticker) || form.ticker
    setSnapshotDraftName(buildSnapshotName(stockLabel, form.ticker, currentSourceTradeDate))
  }, [
    snapshotDraftName,
    form.ticker,
    currentStockName,
    currentSourceTradeDate,
    stockNameByTicker,
    setSnapshotDraftName,
  ])

  function handleSaveSnapshot(): void {
    const snapshotName = snapshotDraftName.trim() || buildSnapshotName(activeStockName, form.ticker, currentSourceTradeDate)
    const snapshotTags = snapshotDraftTags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
    const saved = saveSnapshotWithOverwrite(form, result, snapshotName, currentSourceTradeDate, snapshotTags, fieldSources, fieldNotes)
    if (!saved) return
    const message = saved.overwritten
      ? `已覆盖同名快照：${saved.created.label}`
      : `已保存快照：${saved.created.label}`
    setSnapshotMessage(message)
    setHistoryMessage('')
    setSyncStatus(message)
    logger.info('snapshot saved manually', { label: saved.created.label, ticker: form.ticker, overwritten: saved.overwritten })
  }

  function handleDeleteSnapshot(id: string): void {
    deleteSnapshotEntry(id)
    logger.info('snapshot deleted', { id })
  }

  function handleAddSnapshotFromHistory(item: SearchHistoryEntry): void {
    const label = buildSnapshotName(item.stockName, item.ticker, item.sourceTradeDate)
    const saved = saveSnapshotWithOverwrite(item.form, analyze(item.form), label, item.sourceTradeDate, [], fieldSources, fieldNotes)
    if (!saved) return
    const message = saved.overwritten
      ? `已覆盖同名快照：${saved.created.label}`
      : `已从历史记录添加快照：${saved.created.label}`
    setHistoryItemFeedback({ id: item.id, message, tone: 'success' })
    setHistoryMessage('')
    setSyncStatus(message)
    logger.info('snapshot added from history', { id: item.id, label: saved.created.label, overwritten: saved.overwritten })
  }

  function handleSwitchView(nextView: 'analyzer' | 'history' | 'review'): void {
    if (nextView !== 'history') {
      setHistoryItemFeedback(null)
    }
    if (nextView === 'analyzer') {
      resetForm()
      resetCurrentStockContext()
      setSyncStatus('')
      clearFieldMetadata()
    }
    switchView(nextView)
  }

  return (
    <>
      <div className="bg-grid" aria-hidden="true"></div>
      <header className="hero">
        <div className="badge">A股长期价值投资工具</div>
        <h1>{view === 'analyzer' && currentStockName ? `${currentStockName} · 长期价值评估` : '长期主义，不猜涨跌，只算价值与安全边际'}</h1>
        <p>用 DCF、ROE-PB、相对估值与财务过滤，形成可解释的内在价值区间。</p>
        <div className="top-nav">
          <button type="button" className={`nav-btn ${view === 'analyzer' ? 'is-active' : ''}`} onClick={() => handleSwitchView('analyzer')}>
            估值工具
          </button>
          <button type="button" className={`nav-btn ${view === 'history' ? 'is-active' : ''}`} onClick={() => handleSwitchView('history')}>
            股票历史
          </button>
          <button type="button" className={`nav-btn ${view === 'review' ? 'is-active' : ''}`} onClick={() => handleSwitchView('review')}>
            历史复盘
          </button>
        </div>
      </header>

      <section className="token-strip">
        <div className="token-strip-inner">
          <strong>TuShare Token</strong>
          {editingToken ? (
            <>
              <input
                type="password"
                value={tokenDraft}
                placeholder="输入 TuShare Token"
                onChange={(e) => setTokenDraft(e.target.value)}
              />
              <button type="button" onClick={handleSaveToken}>Save Token</button>
              <button type="button" className="nav-btn" onClick={handleCancelTokenEdit}>Cancel</button>
            </>
          ) : token ? (
            <>
              <span className="status-muted">Token Saved</span>
              <button type="button" className="nav-btn" onClick={handleChangeToken}>Change Token</button>
              <button type="button" className="nav-btn" onClick={handleClearToken}>Clear Token</button>
            </>
          ) : hasServerToken ? (
            <>
              <span className="status-muted">the token is already set from server side</span>
              <button type="button" className="nav-btn" onClick={handleChangeToken}>Set Token</button>
            </>
          ) : (
            <button type="button" className="nav-btn" onClick={handleChangeToken}>Set Token</button>
          )}
        </div>
      </section>

      <section className="principles">
        <article className="principle-card">
          <h2>长期价值投资理念</h2>
          <ul>
            <li><strong>能力圈优先：</strong>只研究看得懂、可持续跟踪的公司。</li>
            <li><strong>先业务后估值：</strong>先判断护城河，再做数字计算。</li>
            <li><strong>现金流胜于利润：</strong>长期自由现金流更接近真实价值。</li>
            <li><strong>安全边际纪律：</strong>没有折价不买入，高估不追涨。</li>
            <li><strong>治理与资本配置：</strong>管理层诚信与再投资效率同样重要。</li>
          </ul>
        </article>
        <article className="principle-card">
          <h2>工具使用边界</h2>
          <ul>
            <li>适用：A股长期跟踪标的的价值评估与假设推演。</li>
            <li>不适用：短线择时、题材博弈、杠杆交易、自动下单。</li>
            <li>风险提示：估值结果依赖增长率、折现率与数据质量。</li>
          </ul>
        </article>
      </section>

      {view === 'analyzer' ? (
        <AnalyzerView
          form={form}
          canUseTushare={canUseTushare}
          loadingTushare={loadingTushare}
          syncStatus={syncStatus}
          snapshotDraftName={snapshotDraftName}
          snapshotDraftTags={snapshotDraftTags}
          snapshotMessage={snapshotMessage}
          currentSourceTradeDate={currentSourceTradeDate}
          activeStockName={activeStockName}
          result={result}
          finalGrade={finalGrade}
          sensitivityMax={sensitivityMax}
          fieldSources={fieldSources}
          fieldNotes={fieldNotes}
          onInputChange={handleInputChange}
          onUpdateField={handleUpdateField}
          onFetchTushare={(forceRefresh) => void handleFetchTushare(forceRefresh)}
          onSnapshotDraftNameChange={setSnapshotDraftName}
          onSnapshotDraftTagsChange={setSnapshotDraftTags}
          onSaveSnapshot={handleSaveSnapshot}
        />
      ) : view === 'history' ? (
        <HistoryView
          historyMessage={historyMessage}
          historyItemFeedback={historyItemFeedback}
          searchHistory={searchHistory}
          loadingTushare={loadingTushare}
          updatingHistoryId={updatingHistoryId}
          onSelectHistory={handleSelectHistory}
          onRefreshHistoryItem={(item) => void handleRefreshHistoryItem(item)}
          onAddSnapshotFromHistory={handleAddSnapshotFromHistory}
          onRemoveHistory={handleRemoveHistory}
        />
      ) : (
        <ReviewView
          snapshots={snapshots}
          compareA={compareA}
          compareB={compareB}
          compareAId={compareAId}
          compareBId={compareBId}
          backtestSeries={backtestSeries}
          attribution={attribution}
          backtestMax={backtestMax}
          attributionMax={attributionMax}
          onAddSnapshotTags={addSnapshotTags}
          onSetSnapshotTags={setSnapshotTags}
          onDeleteSnapshot={handleDeleteSnapshot}
          onCompareAIdChange={setCompareAId}
          onCompareBIdChange={setCompareBId}
        />
      )}
    </>
  )
}

export default App
