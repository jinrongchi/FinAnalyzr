import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_FORM } from '../data/defaults'
import type { AnalysisResult } from '../types'
import { getStorage, getStorageKey } from './storage'
import { deleteSnapshot, loadSnapshots, saveSnapshot, updateSnapshotTags } from './snapshotStore'

const STORAGE = getStorage()
const STORAGE_KEY = getStorageKey('snapshots.v1')

const RESULT_STUB: AnalysisResult = {
  intrinsicValue: 100,
  marginSafety: 10,
  confidence: 60,
  qualityScore: 70,
  models: [],
  sensitivity: [],
  warnings: [],
}

beforeEach(() => {
  STORAGE.removeItem(STORAGE_KEY)
  vi.restoreAllMocks()
})

describe('snapshotStore cache', () => {
  it('reuses cached parse result when raw storage payload is unchanged', () => {
    const payload = [
      {
        id: 's1',
        createdAt: '2026-01-01T00:00:00.000Z',
        sourceTradeDate: '20260101',
        tags: ['alpha'],
        label: 'S1',
        form: DEFAULT_FORM,
        result: RESULT_STUB,
      },
    ]
    STORAGE.setItem(STORAGE_KEY, JSON.stringify(payload))

    const parseSpy = vi.spyOn(JSON, 'parse')
    const first = loadSnapshots()
    const second = loadSnapshots()

    expect(first).toHaveLength(1)
    expect(second).toHaveLength(1)
    expect(parseSpy).toHaveBeenCalledTimes(1)
  })

  it('invalidates cache after save/delete/update operations', () => {
    const parseSpy = vi.spyOn(JSON, 'parse')

    const created = saveSnapshot(DEFAULT_FORM, RESULT_STUB, 'S-new', '20260102', ['x'])
    const afterSave = loadSnapshots()
    expect(afterSave.some((s) => s.id === created.id)).toBe(true)

    updateSnapshotTags(created.id, ['x', 'y'])
    const afterTagUpdate = loadSnapshots()
    expect(afterTagUpdate.find((s) => s.id === created.id)?.tags).toEqual(['x', 'y'])

    deleteSnapshot(created.id)
    const afterDelete = loadSnapshots()
    expect(afterDelete.some((s) => s.id === created.id)).toBe(false)

    expect(parseSpy.mock.calls.length).toBeGreaterThanOrEqual(3)
  })
})
