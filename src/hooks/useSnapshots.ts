import { useEffect, useMemo, useState } from 'react'
import { deleteSnapshot, loadSnapshots, saveSnapshot, updateSnapshotTags } from '../lib/snapshotStore'
import type { AnalysisResult, FormState, Snapshot } from '../types'

type SaveSnapshotOutcome = {
  created: Snapshot
  overwritten: boolean
}

export function useSnapshots() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>(() => loadSnapshots())
  const [compareAId, setCompareAId] = useState('')
  const [compareBId, setCompareBId] = useState('')

  const compareA = useMemo(() => snapshots.find((s) => s.id === compareAId), [snapshots, compareAId])
  const compareB = useMemo(() => snapshots.find((s) => s.id === compareBId), [snapshots, compareBId])

  useEffect(() => {
    if (snapshots.length === 0) {
      if (compareAId) setCompareAId('')
      if (compareBId) setCompareBId('')
      return
    }

    let nextAId = snapshots.some((s) => s.id === compareAId) ? compareAId : (snapshots[0]?.id || '')
    let nextBId = snapshots.some((s) => s.id === compareBId) ? compareBId : ''

    if (!nextBId) {
      nextBId = snapshots.find((s) => s.id !== nextAId)?.id || ''
    }

    if (nextAId && nextBId && nextAId === nextBId) {
      nextBId = snapshots.find((s) => s.id !== nextAId)?.id || ''
    }

    // Keep comparison direction stable: A is older, B is newer.
    const a = snapshots.find((s) => s.id === nextAId)
    const b = snapshots.find((s) => s.id === nextBId)
    if (a && b && new Date(a.createdAt).getTime() > new Date(b.createdAt).getTime()) {
      const oldA = nextAId
      nextAId = nextBId
      nextBId = oldA
    }

    if (nextAId !== compareAId) setCompareAId(nextAId)
    if (nextBId !== compareBId) setCompareBId(nextBId)
  }, [snapshots, compareAId, compareBId])

  function refreshSnapshots(): Snapshot[] {
    const next = loadSnapshots()
    setSnapshots(next)
    return next
  }

  function saveSnapshotWithOverwrite(
    form: FormState,
    result: AnalysisResult,
    label: string,
    sourceTradeDate?: string,
    tags: string[] = [],
  ): SaveSnapshotOutcome | null {
    const trimmedLabel = label.trim()
    const duplicated = snapshots.find((snapshot) => snapshot.label === trimmedLabel)
    let overwritten = false

    if (duplicated) {
      const shouldOverwrite = window.confirm(`已存在同名快照「${trimmedLabel}」，是否覆盖原始快照？`)
      if (!shouldOverwrite) return null
      deleteSnapshot(duplicated.id)
      overwritten = true
    }

    const created = saveSnapshot(form, result, trimmedLabel, sourceTradeDate, tags)
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

  function addSnapshotTags(id: string, rawTags: string[]): void {
    const snapshot = snapshots.find((s) => s.id === id)
    if (!snapshot) return
    const merged = Array.from(new Set([...snapshot.tags, ...rawTags.map((tag) => tag.trim()).filter(Boolean)]))
    updateSnapshotTags(id, merged)
    refreshSnapshots()
  }

  function setSnapshotTags(id: string, rawTags: string[]): void {
    const normalized = Array.from(new Set(rawTags.map((tag) => tag.trim()).filter(Boolean)))
    updateSnapshotTags(id, normalized)
    refreshSnapshots()
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
    addSnapshotTags,
    setSnapshotTags,
    deleteSnapshotEntry,
  }
}
