import { useMemo, useState } from 'react'
import { deleteSnapshot, loadSnapshots, saveSnapshot } from '../lib/snapshotStore'
import type { AnalysisResult, FormState, Snapshot } from '../types'

type SaveSnapshotOutcome = {
  created: Snapshot
  overwritten: boolean
}

export function useSnapshots() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>(() => loadSnapshots())
  const [compareAId, setCompareAId] = useState('')
  const [compareBId, setCompareBId] = useState('')

  const compareA = useMemo(() => snapshots.find((s) => s.id === compareAId) || snapshots[0], [snapshots, compareAId])
  const compareB = useMemo(() => snapshots.find((s) => s.id === compareBId) || snapshots[1], [snapshots, compareBId])

  function refreshSnapshots(): Snapshot[] {
    const next = loadSnapshots()
    setSnapshots(next)
    return next
  }

  function saveSnapshotWithOverwrite(form: FormState, result: AnalysisResult, label: string): SaveSnapshotOutcome | null {
    const trimmedLabel = label.trim()
    const duplicated = snapshots.find((snapshot) => snapshot.label === trimmedLabel)
    let overwritten = false

    if (duplicated) {
      const shouldOverwrite = window.confirm(`已存在同名快照「${trimmedLabel}」，是否覆盖原始快照？`)
      if (!shouldOverwrite) return null
      deleteSnapshot(duplicated.id)
      overwritten = true
    }

    const created = saveSnapshot(form, result, trimmedLabel)
    const next = refreshSnapshots()
    setCompareAId(created.id)
    if (!compareBId && next[1]) setCompareBId(next[1].id)
    return { created, overwritten }
  }

  function deleteSnapshotEntry(id: string): void {
    deleteSnapshot(id)
    refreshSnapshots()
    if (compareAId === id) setCompareAId('')
    if (compareBId === id) setCompareBId('')
  }

  return {
    snapshots,
    compareA,
    compareB,
    compareAId,
    setCompareAId,
    compareBId,
    setCompareBId,
    saveSnapshotWithOverwrite,
    deleteSnapshotEntry,
  }
}
