import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useAppViewState } from './useAppViewState'

describe('useAppViewState', () => {
  it('resets draft and snapshot message on ticker change', () => {
    const { result } = renderHook(() => useAppViewState(() => undefined))

    act(() => {
      result.current.setSnapshotDraftName('Draft Name')
      result.current.setSnapshotMessage('Saved')
      result.current.setHistoryMessage('History message')
    })

    act(() => {
      result.current.resetForTickerChange()
    })

    expect(result.current.snapshotDraftName).toBe('')
    expect(result.current.snapshotMessage).toBe('')
    expect(result.current.historyMessage).toBe('History message')
  })

  it('switches view and runs analyzer entry callback only for analyzer', () => {
    const onEnterAnalyzer = vi.fn()
    const { result } = renderHook(() => useAppViewState(onEnterAnalyzer))

    act(() => {
      result.current.setHistoryMessage('will clear')
      result.current.switchView('history')
    })

    expect(onEnterAnalyzer).not.toHaveBeenCalled()
    expect(result.current.view).toBe('history')
    expect(result.current.historyMessage).toBe('will clear')

    act(() => {
      result.current.switchView('analyzer')
    })

    expect(onEnterAnalyzer).toHaveBeenCalledTimes(1)
    expect(result.current.view).toBe('analyzer')
    expect(result.current.snapshotDraftName).toBe('')
    expect(result.current.snapshotMessage).toBe('')
    expect(result.current.historyMessage).toBe('')
  })
})
