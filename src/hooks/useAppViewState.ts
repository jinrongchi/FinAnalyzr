import { useState } from 'react'

export type AppView = 'analyzer' | 'history' | 'review'

export function useAppViewState(onEnterAnalyzer: () => void) {
  const [view, setView] = useState<AppView>('analyzer')
  const [snapshotDraftName, setSnapshotDraftName] = useState('')
  const [snapshotMessage, setSnapshotMessage] = useState('')
  const [historyMessage, setHistoryMessage] = useState('')

  function resetForTickerChange(): void {
    setSnapshotMessage('')
    setSnapshotDraftName('')
  }

  function switchView(nextView: AppView): void {
    if (nextView === 'analyzer') {
      onEnterAnalyzer()
    }
    setView(nextView)
    setSnapshotMessage('')
    setSnapshotDraftName('')
    if (nextView !== 'history') {
      setHistoryMessage('')
    }
  }

  return {
    view,
    setView,
    switchView,
    snapshotDraftName,
    setSnapshotDraftName,
    snapshotMessage,
    setSnapshotMessage,
    historyMessage,
    setHistoryMessage,
    resetForTickerChange,
  }
}
