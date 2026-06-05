import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_FORM } from '../data/defaults'
import type { AnalysisResult } from '../types'
import { useSnapshots } from './useSnapshots'

const RESULT_STUB: AnalysisResult = {
  intrinsicValue: 100,
  marginSafety: 10,
  confidence: 60,
  qualityScore: 70,
  models: [],
  sensitivity: [],
  warnings: [],
}

describe('useSnapshots', () => {
  it('saves snapshot and updates compare selection', () => {
    const { result } = renderHook(() => useSnapshots())

    act(() => {
      result.current.saveSnapshotWithOverwrite({ ...DEFAULT_FORM, ticker: '600519' }, RESULT_STUB, 'S1')
    })

    expect(result.current.snapshots).toHaveLength(1)
    expect(result.current.snapshots[0]?.label).toBe('S1')
    expect(result.current.compareAId).toBe(result.current.snapshots[0]?.id)
  })

  it('does not overwrite when user cancels confirmation', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { result } = renderHook(() => useSnapshots())

    act(() => {
      result.current.saveSnapshotWithOverwrite({ ...DEFAULT_FORM, ticker: '000001' }, RESULT_STUB, 'Duplicated')
    })

    let secondSave: ReturnType<typeof result.current.saveSnapshotWithOverwrite> = null
    act(() => {
      secondSave = result.current.saveSnapshotWithOverwrite({ ...DEFAULT_FORM, ticker: '000001' }, RESULT_STUB, 'Duplicated')
    })

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(secondSave).toBeNull()
    expect(result.current.snapshots).toHaveLength(1)
  })

  it('deletes snapshot entry', () => {
    const { result } = renderHook(() => useSnapshots())

    act(() => {
      result.current.saveSnapshotWithOverwrite({ ...DEFAULT_FORM, ticker: '300750' }, RESULT_STUB, 'ToDelete')
    })

    const id = result.current.snapshots[0]?.id
    expect(id).toBeTruthy()

    act(() => {
      result.current.deleteSnapshotEntry(String(id))
    })

    expect(result.current.snapshots).toHaveLength(0)
  })
})
