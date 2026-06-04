import { useMemo, useState, type ChangeEvent } from 'react'
import { DEFAULT_FORM } from './data/defaults'
import { buildBacktestSeries, computeAssumptionAttribution } from './lib/backtest'
import { loadSearchHistory, removeSearchHistory, upsertSearchHistory } from './lib/searchHistoryStore'
import { deleteSnapshot, loadSnapshots, saveSnapshot } from './lib/snapshotStore'
import { loadFromTushare } from './lib/tushare'
import { analyze, formatPct, formatYuan, grade } from './lib/valuation'
import type { AnalysisResult, FormState, SearchHistoryEntry, Snapshot } from './types'

function NumberField(props: {
  label: string
  name: keyof FormState
  step?: number
  min?: number
  max?: number
  value: number
  emptyIfZero?: boolean
  onChange: (name: keyof FormState, value: string) => void
}) {
  return (
    <label>
      {props.label}
      <input
        type="number"
        name={props.name}
        step={props.step ?? 0.1}
        min={props.min}
        max={props.max}
        value={props.emptyIfZero && props.value === 0 ? '' : props.value}
        placeholder={props.emptyIfZero ? 'N/A' : undefined}
        onChange={(e) => props.onChange(props.name, e.target.value)}
      />
    </label>
  )
}

function formatTradeDate(sourceTradeDate?: string): string {
  if (!sourceTradeDate) return 'N/A'
  if (sourceTradeDate.length !== 8) return sourceTradeDate
  return `${sourceTradeDate.slice(0, 4)}-${sourceTradeDate.slice(4, 6)}-${sourceTradeDate.slice(6, 8)}`
}

function parseTradeDate(sourceTradeDate?: string): Date | null {
  if (!sourceTradeDate || sourceTradeDate.length !== 8) return null
  const y = Number(sourceTradeDate.slice(0, 4))
  const m = Number(sourceTradeDate.slice(4, 6))
  const d = Number(sourceTradeDate.slice(6, 8))
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null
  return new Date(y, m - 1, d)
}

function shouldShowRefreshButton(sourceTradeDate?: string): boolean {
  const tradeDate = parseTradeDate(sourceTradeDate)
  if (!tradeDate) return false
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tradeStart = new Date(tradeDate.getFullYear(), tradeDate.getMonth(), tradeDate.getDate())
  const diffDays = Math.floor((todayStart.getTime() - tradeStart.getTime()) / (24 * 60 * 60 * 1000))
  return diffDays > 1
}

function buildSnapshotName(stockName: string, ticker: string, sourceTradeDate?: string): string {
  const safeName = stockName || ticker || '未命名股票'
  return `${safeName} ${formatTradeDate(sourceTradeDate)}`
}

function formatMaybeYuan(value: number): string {
  return value === 0 ? 'N/A' : formatYuan(value)
}

function formatMaybePct(value: number): string {
  return value === 0 ? 'N/A' : formatPct(value)
}

function formatMaybeNumber(value: number, digits = 2): string {
  return value === 0 ? 'N/A' : value.toFixed(digits)
}

const COMPARISON_FIELDS: Array<{ key: keyof FormState; label: string }> = [
  { key: 'price', label: '当前股价' },
  { key: 'fcf0', label: 'FCF0(亿元)' },
  { key: 'fcfGrowth', label: 'FCF增长率(%)' },
  { key: 'discountRate', label: '折现率(%)' },
  { key: 'terminalGrowth', label: '永续增长率(%)' },
  { key: 'eps', label: 'EPS' },
  { key: 'bvps', label: 'BVPS' },
  { key: 'dividend0', label: 'D0' },
  { key: 'roic', label: 'ROIC(%)' },
  { key: 'deRatio', label: 'D/E' },
]

const ATTRIBUTION_FIELDS: Array<{ key: keyof FormState; label: string }> = [
  { key: 'fcfGrowth', label: 'FCF增长率' },
  { key: 'discountRate', label: '折现率' },
  { key: 'terminalGrowth', label: '永续增长率' },
  { key: 'eps', label: 'EPS' },
  { key: 'bvps', label: 'BVPS' },
  { key: 'roic', label: 'ROIC' },
]

function App() {
  const [view, setView] = useState<'analyzer' | 'history' | 'review'>('analyzer')
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [token, setToken] = useState('')
  const [syncStatus, setSyncStatus] = useState('')
  const [loadingTushare, setLoadingTushare] = useState(false)
  const [currentStockName, setCurrentStockName] = useState('')
  const [currentSourceTradeDate, setCurrentSourceTradeDate] = useState<string | undefined>(undefined)
  const [snapshotDraftName, setSnapshotDraftName] = useState('')
  const [snapshotMessage, setSnapshotMessage] = useState('')
  const [historyMessage, setHistoryMessage] = useState('')
  const [updatingHistoryId, setUpdatingHistoryId] = useState('')
  const [searchHistory, setSearchHistory] = useState<SearchHistoryEntry[]>(() => loadSearchHistory())
  const [snapshots, setSnapshots] = useState<Snapshot[]>(() => loadSnapshots())
  const [compareAId, setCompareAId] = useState('')
  const [compareBId, setCompareBId] = useState('')

  function updateField(name: keyof FormState, value: string): void {
    if (name === 'ticker') {
      setSnapshotMessage('')
      setSnapshotDraftName('')
      setCurrentStockName('')
      setCurrentSourceTradeDate(undefined)
    }
    setForm((prev) => {
      if (name === 'ticker') return { ...prev, ticker: value }
      if (name === 'dataMode') return { ...prev, dataMode: value as FormState['dataMode'] }
      const num = Number(value)
      return { ...prev, [name]: Number.isFinite(num) ? num : 0 }
    })
  }

  function handleSelectChange(e: ChangeEvent<HTMLSelectElement>): void {
    updateField(e.target.name as keyof FormState, e.target.value)
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement>): void {
    updateField(e.target.name as keyof FormState, e.target.value)
  }

  async function handleFetchTushare(forceRefresh = false): Promise<void> {
    if (!form.ticker.trim()) {
      setSyncStatus('请先输入股票代码后再同步 TuShare。')
      return
    }

    console.info('[FinAnalyzr] fetch button clicked', {
      ticker: form.ticker,
      forceRefresh,
    })

    try {
      setLoadingTushare(true)
      setSnapshotMessage('')
      const loaded = await loadFromTushare(token, form.ticker, form, { forceRefresh })
      const mergedForm = { ...form, ...loaded.patch }
      setForm(mergedForm)
      setCurrentStockName(loaded.stockName || mergedForm.ticker)
      setCurrentSourceTradeDate(loaded.sourceTradeDate)
      setSnapshotDraftName(buildSnapshotName(loaded.stockName || mergedForm.ticker, mergedForm.ticker, loaded.sourceTradeDate))

      upsertSearchHistory({
        ticker: mergedForm.ticker,
        stockName: loaded.stockName || mergedForm.ticker,
        sourceTradeDate: loaded.sourceTradeDate,
        fetchedAt: loaded.fetchedAt,
        form: mergedForm,
      })
      setSearchHistory(loadSearchHistory())

      const notes = loaded.notes.length ? `；${loaded.notes.join(' ')}` : ''
      setSyncStatus(`已加载 ${loaded.stockName || mergedForm.ticker}，交易日 ${formatTradeDate(loaded.sourceTradeDate)}${notes}`)
      setHistoryMessage('')

      console.info('[FinAnalyzr] fetch success', {
        ticker: mergedForm.ticker,
        sourceTradeDate: loaded.sourceTradeDate,
        stockName: loaded.stockName,
      })
    } catch (error) {
      const msg = error instanceof Error ? error.message : '未知错误'
      setSyncStatus(`TuShare 同步失败：${msg}`)
      console.error('[FinAnalyzr] fetch failed', { ticker: form.ticker, error: msg })
    } finally {
      setLoadingTushare(false)
    }
  }

  async function handleRefreshHistoryItem(item: SearchHistoryEntry): Promise<void> {
    if (item.form.dataMode === 'manual') {
      setHistoryMessage(`该历史记录为手工模式，暂不支持更新：${item.stockName}`)
      return
    }

    try {
      setLoadingTushare(true)
      setUpdatingHistoryId(item.id)
      const loaded = await loadFromTushare(token, item.ticker, item.form, { forceRefresh: true })
      const mergedForm = { ...item.form, ...loaded.patch }
      upsertSearchHistory({
        ticker: mergedForm.ticker,
        stockName: loaded.stockName || item.stockName || mergedForm.ticker,
        sourceTradeDate: loaded.sourceTradeDate,
        fetchedAt: loaded.fetchedAt,
        form: mergedForm,
      })
      setSearchHistory(loadSearchHistory())
      setHistoryMessage(`已更新 ${loaded.stockName || item.stockName || mergedForm.ticker}，交易日 ${formatTradeDate(loaded.sourceTradeDate)}`)
    } catch (error) {
      const msg = error instanceof Error ? error.message : '未知错误'
      setHistoryMessage(`历史数据更新失败：${msg}`)
    } finally {
      setLoadingTushare(false)
      setUpdatingHistoryId('')
    }
  }

  function canRefreshInAnalyzer(): boolean {
    return form.dataMode !== 'manual' && form.ticker.trim().length > 0
  }

  function canRefreshHistoryItem(item: SearchHistoryEntry): boolean {
    return item.form.dataMode !== 'manual' && item.ticker.trim().length > 0
  }

  const result = useMemo(() => analyze(form), [form])
  const finalGrade = grade(result.marginSafety)
  const sensitivityMax = Math.max(1, ...result.sensitivity.map((s) => s.value))
  const activeStockName = currentStockName || searchHistory.find((item) => item.ticker === form.ticker)?.stockName || form.ticker || '未命名股票'
  const compareA = snapshots.find((s) => s.id === compareAId) || snapshots[0]
  const compareB = snapshots.find((s) => s.id === compareBId) || snapshots[1]
  const canRefreshCurrent = canRefreshInAnalyzer()
  const showRefreshButton = shouldShowRefreshButton(currentSourceTradeDate)
  const backtestSeries = useMemo(() => buildBacktestSeries(snapshots), [snapshots])
  const attribution = useMemo(
    () => (compareA && compareB ? computeAssumptionAttribution(compareA, compareB, ATTRIBUTION_FIELDS) : null),
    [compareA, compareB],
  )
  const backtestMax = Math.max(
    0.01,
    ...backtestSeries.flatMap((point) => [
      Math.abs(point.predictedReturn),
      Math.abs(point.realizedReturn),
      Math.abs(point.predictionError),
    ]),
  )
  const attributionMax = Math.max(0.01, ...(attribution?.items.map((item) => Math.abs(item.contribution)) || [0]))

  function persistSnapshot(formState: FormState, analysisResult: AnalysisResult, label: string): { created: Snapshot; overwritten: boolean } | null {
    const trimmedLabel = label.trim() || buildSnapshotName(activeStockName, formState.ticker, currentSourceTradeDate)
    const duplicated = snapshots.find((snapshot) => snapshot.label === trimmedLabel)
    let overwritten = false
    if (duplicated) {
      const shouldOverwrite = window.confirm(`已存在同名快照「${trimmedLabel}」，是否覆盖原始快照？`)
      if (!shouldOverwrite) return null
      deleteSnapshot(duplicated.id)
      overwritten = true
    }

    const created = saveSnapshot(formState, analysisResult, trimmedLabel)
    setSnapshots(loadSnapshots())
    return { created, overwritten }
  }

  function handleSaveSnapshot(): void {
    const snapshotName = snapshotDraftName.trim() || buildSnapshotName(activeStockName, form.ticker, currentSourceTradeDate)
    const saved = persistSnapshot(form, result, snapshotName)
    if (!saved) return
    setCompareAId(saved.created.id)
    const next = loadSnapshots()
    if (!compareBId && next[1]) setCompareBId(next[1].id)
    const message = saved.overwritten
      ? `已覆盖同名快照：${saved.created.label}`
      : `已保存快照：${saved.created.label}`
    setSnapshotMessage(message)
    setHistoryMessage('')
    setSyncStatus(message)
    console.info('[FinAnalyzr] snapshot saved manually', { label: saved.created.label, ticker: form.ticker, overwritten: saved.overwritten })
  }

  function handleDeleteSnapshot(id: string): void {
    deleteSnapshot(id)
    const next = loadSnapshots()
    setSnapshots(next)
    if (compareAId === id) setCompareAId('')
    if (compareBId === id) setCompareBId('')
    console.info('[FinAnalyzr] snapshot deleted', { id })
  }

  function handleSelectHistory(item: SearchHistoryEntry): void {
    setForm(item.form)
    setCurrentStockName(item.stockName)
    setCurrentSourceTradeDate(item.sourceTradeDate)
    setSnapshotDraftName(buildSnapshotName(item.stockName, item.ticker, item.sourceTradeDate))
    setSnapshotMessage('')
    setView('analyzer')
    setSyncStatus(`已加载历史记录：${item.stockName} (${item.ticker})，交易日 ${formatTradeDate(item.sourceTradeDate)}`)
    console.info('[FinAnalyzr] history item selected', {
      ticker: item.ticker,
      sourceTradeDate: item.sourceTradeDate,
    })
  }

  function handleRemoveHistory(id: string): void {
    removeSearchHistory(id)
    setSearchHistory(loadSearchHistory())
  }

  function handleAddSnapshotFromHistory(item: SearchHistoryEntry): void {
    const label = buildSnapshotName(item.stockName, item.ticker, item.sourceTradeDate)
    const saved = persistSnapshot(item.form, analyze(item.form), label)
    if (!saved) return
    setCompareAId(saved.created.id)
    const message = saved.overwritten
      ? `已覆盖同名快照：${saved.created.label}`
      : `已从历史记录添加快照：${saved.created.label}`
    setHistoryMessage(message)
    setSyncStatus(message)
    console.info('[FinAnalyzr] snapshot added from history', { id: item.id, label: saved.created.label, overwritten: saved.overwritten })
  }

  function handleSwitchView(nextView: 'analyzer' | 'history' | 'review'): void {
    setView(nextView)
    setSnapshotMessage('')
    setSnapshotDraftName('')
    if (nextView !== 'history') {
      setHistoryMessage('')
    }
  }

  return (
    <>
      <div className="bg-grid" aria-hidden="true"></div>
      <header className="hero">
        <div className="badge">A股长期价值投资工具</div>
        <h1>{view === 'analyzer' && currentStockName ? `${currentStockName} · 长期价值评估` : '长期主义，不猜涨跌，只算价值与安全边际'}</h1>
        <p>用 DCF、相对估值、DDM 与质量评分，形成可解释的内在价值区间。</p>
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
        <main className="layout">
          <section className="panel input-panel">
            <h2>输入参数</h2>
            <p className="sub">支持混合模式：API优先 + 手工补录（当前为手工录入演示版）</p>

            <div className="form-grid">
              <label>
                股票代码
                <input name="ticker" value={form.ticker} onChange={handleInputChange} />
              </label>
              <NumberField label="当前股价（元）" name="price" step={0.01} value={form.price} emptyIfZero onChange={updateField} />
              <label>
                数据来源
                <select name="dataMode" value={form.dataMode} onChange={handleSelectChange}>
                  <option value="api-first">API优先，缺失手工补录</option>
                  <option value="manual">仅手工</option>
                </select>
              </label>
            </div>

            {form.dataMode !== 'manual' ? (
              <>
                <h3>TuShare 同步</h3>
                <div className="form-grid">
                  <label>
                    TuShare Token
                    <input
                      type="password"
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      placeholder="可留空（若代理已配置服务端 token）"
                    />
                  </label>
                  <button type="button" disabled={loadingTushare} onClick={() => handleFetchTushare(false)}>
                    {loadingTushare ? '同步中...' : '从 TuShare 加载'}
                  </button>
                </div>
                <div className="refresh-row">
                  <button
                    type="button"
                    className={canRefreshCurrent ? '' : 'muted-action'}
                    disabled={loadingTushare || !canRefreshCurrent}
                    onClick={() => handleFetchTushare(true)}
                  >
                    {loadingTushare ? '同步中...' : '更新数据'}
                  </button>
                  <span className={canRefreshCurrent ? '' : 'status-muted'}>
                    {canRefreshCurrent
                      ? (showRefreshButton
                        ? `当前数据交易日：${formatTradeDate(currentSourceTradeDate)}（超过 1 天）`
                        : `当前数据交易日：${formatTradeDate(currentSourceTradeDate)}（可手动更新）`)
                      : '请先输入股票代码后再更新'}
                  </span>
                </div>
                {syncStatus ? <p className="status-note">{syncStatus}</p> : null}
              </>
            ) : null}

            <h3>DCF 参数</h3>
            <div className="form-grid">
              <NumberField label="基准自由现金流 FCF0（亿元）" name="fcf0" value={form.fcf0} emptyIfZero onChange={updateField} />
              <NumberField label="预测年数" name="forecastYears" min={3} max={20} step={1} value={form.forecastYears} onChange={updateField} />
              <NumberField label="FCF 增长率（%）" name="fcfGrowth" value={form.fcfGrowth} emptyIfZero onChange={updateField} />
              <NumberField label="折现率 r（%）" name="discountRate" value={form.discountRate} emptyIfZero onChange={updateField} />
              <NumberField label="永续增长率 g（%）" name="terminalGrowth" value={form.terminalGrowth} emptyIfZero onChange={updateField} />
              <NumberField label="净负债（亿元，净现金填负）" name="netDebt" value={form.netDebt} emptyIfZero onChange={updateField} />
              <NumberField label="总股本（亿股）" name="sharesOutstanding" value={form.sharesOutstanding} emptyIfZero onChange={updateField} />
            </div>

            <h3>相对估值参数</h3>
            <div className="form-grid">
              <NumberField label="每股收益 EPS（元）" name="eps" value={form.eps} emptyIfZero onChange={updateField} />
              <NumberField label="每股净资产 BVPS（元）" name="bvps" value={form.bvps} emptyIfZero onChange={updateField} />
              <NumberField label="每股 EBITDA（元）" name="ebitdaPerShare" value={form.ebitdaPerShare} emptyIfZero onChange={updateField} />
              <NumberField label="行业中位 PE" name="industryPE" value={form.industryPE} emptyIfZero onChange={updateField} />
              <NumberField label="行业中位 PB" name="industryPB" value={form.industryPB} emptyIfZero onChange={updateField} />
              <NumberField label="行业中位 EV/EBITDA" name="industryEVEBITDA" value={form.industryEVEBITDA} emptyIfZero onChange={updateField} />
            </div>

            <h3>DDM 参数</h3>
            <div className="form-grid">
              <NumberField label="每股分红 D0（元）" name="dividend0" value={form.dividend0} emptyIfZero onChange={updateField} />
              <NumberField label="阶段增长率 g1（%）" name="dividendGrowth" value={form.dividendGrowth} emptyIfZero onChange={updateField} />
              <NumberField label="阶段年数" name="ddmYears" min={1} max={20} step={1} value={form.ddmYears} emptyIfZero onChange={updateField} />
              <NumberField label="必要回报率 k（%）" name="requiredReturn" value={form.requiredReturn} emptyIfZero onChange={updateField} />
              <NumberField label="稳定增长率 g2（%）" name="stableGrowth" value={form.stableGrowth} emptyIfZero onChange={updateField} />
            </div>

            <h3>质量评分（0-100）</h3>
            <div className="form-grid">
              <NumberField label="ROIC（%）" name="roic" value={form.roic} emptyIfZero onChange={updateField} />
              <NumberField label="资产负债率替代：D/E" name="deRatio" value={form.deRatio} emptyIfZero onChange={updateField} />
              <NumberField label="FCF 转化率（%）" name="fcfConversion" value={form.fcfConversion} emptyIfZero onChange={updateField} />
              <NumberField label="治理评分" name="governanceScore" min={0} max={100} step={1} value={form.governanceScore} emptyIfZero onChange={updateField} />
              <NumberField label="护城河评分" name="moatScore" min={0} max={100} step={1} value={form.moatScore} emptyIfZero onChange={updateField} />
            </div>

            <h3>快照</h3>
            <div className="form-grid snapshot-grid">
              <label>
                快照名称
                <input
                  value={snapshotDraftName}
                  onChange={(e) => setSnapshotDraftName(e.target.value)}
                  placeholder={buildSnapshotName(activeStockName, form.ticker, currentSourceTradeDate)}
                />
              </label>
              <button type="button" onClick={handleSaveSnapshot}>保存当前快照</button>
            </div>
            {snapshotMessage ? <p className="snapshot-note">{snapshotMessage}</p> : null}
          </section>

          <section className="panel result-panel">
            <h2>评估结果</h2>
            <div className="overview">
              <div className="row">
                <strong>{activeStockName}</strong>
                <span className={`tag ${finalGrade.cls}`}>{finalGrade.label}</span>
              </div>
              <div className="kpi">
                <div className="item"><div>当前价格</div><div className="v">{formatMaybeYuan(form.price)}</div></div>
                <div className="item"><div>内在价值</div><div className="v">{formatMaybeYuan(result.intrinsicValue)}</div></div>
                <div className="item"><div>安全边际</div><div className="v">{formatMaybePct(result.marginSafety)}</div></div>
                <div className="item"><div>质量评分</div><div className="v">{result.qualityScore}</div></div>
                <div className="item"><div>结果置信度</div><div className="v">{formatPct(result.confidence)}</div></div>
                <div className="item"><div>数据模式</div><div className="v">{form.dataMode === 'api-first' ? '混合' : '手工'}</div></div>
              </div>
            </div>

            <div className="cards">
              {result.models.map((m) => (
                <div className="card" key={m.key}>
                  <div className="row">
                    <strong>{m.name}</strong>
                    <span className="tag">{m.valid ? `置信度 ${formatPct(m.confidence || 0)}` : '未采用'}</span>
                  </div>
                  {m.valid ? (
                    <>
                      <div>估值：<strong>{formatMaybeYuan(m.value || 0)}</strong></div>
                      <div>假设：{m.assumptions}</div>
                    </>
                  ) : (
                    <div>{m.reason}</div>
                  )}
                </div>
              ))}
            </div>

            <div className="sensitivity">
              <h3>DCF 敏感性分析</h3>
              {result.sensitivity.length ? result.sensitivity.map((s) => (
                <div className="bar" key={s.label}>
                  <div>{s.label}</div>
                  <div className="track"><div className="fill" style={{ width: `${(s.value / sensitivityMax) * 100}%` }}></div></div>
                  <div>{formatMaybeYuan(s.value)}</div>
                </div>
              )) : <p>DCF 不可用，无法生成敏感性分析。</p>}
            </div>

            <div className="warnings">
              {result.warnings.map((w) => <div key={w} className="warn-item">{w}</div>)}
            </div>
            <p className="disclaimer">免责声明：本工具仅用于学习研究，不构成任何投资建议。市场有风险，决策需独立判断。</p>
          </section>
        </main>
      ) : view === 'history' ? (
        <main className="layout review-layout">
          <section className="panel">
            <h2>股票搜索历史</h2>
            <p className="sub">复用已搜索过的数据，减少 TuShare 重复调用。</p>
            {historyMessage ? <p className="status-note">{historyMessage}</p> : null}
            {searchHistory.length === 0 ? <p>暂无历史记录，请先在估值页执行一次 TuShare 查询。</p> : (
              <div className="history-list">
                {searchHistory.map((item) => (
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
                      <button type="button" onClick={() => handleSelectHistory(item)}>进入估值页</button>
                      <button
                        type="button"
                        className={canRefreshHistoryItem(item) ? '' : 'muted-action'}
                        disabled={loadingTushare || !canRefreshHistoryItem(item)}
                        onClick={() => void handleRefreshHistoryItem(item)}
                      >
                        {updatingHistoryId === item.id ? '同步中...' : '更新数据'}
                      </button>
                      <button type="button" onClick={() => handleAddSnapshotFromHistory(item)}>添加快照</button>
                      <button type="button" onClick={() => handleRemoveHistory(item.id)}>删除</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </main>
      ) : (
        <main className="layout review-layout">
          <section className="panel">
            <h2>历史快照</h2>
            {snapshots.length === 0 ? <p>暂无快照，请先在估值页保存。</p> : (
              <div className="snapshots-list">
                {snapshots.map((s) => (
                  <div className="snapshot-item" key={s.id}>
                    <div>
                      <strong>{s.label}</strong>
                      <div>{new Date(s.createdAt).toLocaleString('zh-CN')}</div>
                      <div>{s.form.ticker} · 价值 {formatMaybeYuan(s.result.intrinsicValue)}</div>
                    </div>
                    <button type="button" onClick={() => handleDeleteSnapshot(s.id)}>删除</button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="panel">
            <h2>参数版本对比</h2>
            <div className="form-grid">
              <label>
                版本 A
                <select value={compareA?.id || ''} onChange={(e) => setCompareAId(e.target.value)}>
                  {snapshots.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </label>
              <label>
                版本 B
                <select value={compareB?.id || ''} onChange={(e) => setCompareBId(e.target.value)}>
                  {snapshots.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
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
                  const a = Number(compareA.form[f.key])
                  const b = Number(compareB.form[f.key])
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
              </div>
            )}
          </section>

          <section className="panel">
            <h2>估值回测图</h2>
            <p className="sub">基于相邻快照对比“当时预测收益率”与“后续实际收益率”。</p>
            {backtestSeries.length === 0 ? <p>至少保存 2 个快照后可生成回测图。</p> : (
              <div className="metric-chart">
                {backtestSeries.map((point) => (
                  <div className="metric-group" key={`${point.fromId}-${point.toId}`}>
                    <div className="metric-label">{point.fromLabel} → {point.toLabel}</div>
                    <div className="metric-row">
                      <span>预测</span>
                      <div className="metric-track">
                        <div
                          className={`metric-fill ${point.predictedReturn >= 0 ? 'metric-up' : 'metric-down'}`}
                          style={{ width: `${(Math.abs(point.predictedReturn) / backtestMax) * 100}%` }}
                        ></div>
                      </div>
                      <strong>{formatPct(point.predictedReturn)}</strong>
                    </div>
                    <div className="metric-row">
                      <span>实际</span>
                      <div className="metric-track">
                        <div
                          className={`metric-fill ${point.realizedReturn >= 0 ? 'metric-up' : 'metric-down'}`}
                          style={{ width: `${(Math.abs(point.realizedReturn) / backtestMax) * 100}%` }}
                        ></div>
                      </div>
                      <strong>{formatPct(point.realizedReturn)}</strong>
                    </div>
                    <div className="metric-row">
                      <span>偏差</span>
                      <div className="metric-track">
                        <div
                          className={`metric-fill ${point.predictionError >= 0 ? 'metric-up' : 'metric-down'}`}
                          style={{ width: `${(Math.abs(point.predictionError) / backtestMax) * 100}%` }}
                        ></div>
                      </div>
                      <strong>{formatPct(point.predictionError)}</strong>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="panel">
            <h2>假设偏差归因图</h2>
            <p className="sub">展示 A 版本到 B 版本内在价值变化中，各核心假设的贡献。</p>
            {!attribution ? <p>请先选择两个版本进行归因。</p> : (
              <>
                <div className="kpi attribution-kpi">
                  <div className="item"><div>总变化</div><div className="v">{formatMaybeYuan(attribution.totalDelta)}</div></div>
                  <div className="item"><div>已解释</div><div className="v">{formatMaybeYuan(attribution.explainedDelta)}</div></div>
                  <div className="item"><div>残差</div><div className="v">{formatMaybeYuan(attribution.residualDelta)}</div></div>
                </div>

                <div className="metric-chart attribution-chart">
                  {attribution.items.map((item) => (
                    <div className="metric-row" key={item.key}>
                      <span>{item.label}</span>
                      <div className="metric-track">
                        <div
                          className={`metric-fill ${item.contribution >= 0 ? 'metric-up' : 'metric-down'}`}
                          style={{ width: `${(Math.abs(item.contribution) / attributionMax) * 100}%` }}
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
      )}
    </>
  )
}

export default App
