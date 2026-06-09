import { useMemo, useState } from 'react'
import { deleteSnapshot, loadSnapshots, saveSnapshot, updateSnapshotTags } from '../lib/snapshotStore'
import type { AnalysisResult, FieldNotes, FieldSources, FormState, Snapshot } from '../types'

type SaveSnapshotOutcome = {
  created: Snapshot
  overwritten: boolean
}

export function useSnapshots() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>(() => loadSnapshots())
  const [compareAId, setCompareAId] = useState('')
  const [compareBId, setCompareBId] = useState('')

  const effectiveCompareAId = useMemo(() => {
    if (snapshots.length === 0) return ''
    return snapshots.some((s) => s.id === compareAId) ? compareAId : (snapshots[0]?.id || '')
  }, [snapshots, compareAId])

  const effectiveCompareBId = useMemo(() => {
    if (!compareBId) return ''
    if (!snapshots.some((s) => s.id === compareBId)) return ''
    if (compareBId === effectiveCompareAId) {
      return snapshots.find((s) => s.id !== effectiveCompareAId)?.id || ''
    }
    return compareBId
  }, [snapshots, compareBId, effectiveCompareAId])

  const compareA = useMemo(() => snapshots.find((s) => s.id === effectiveCompareAId), [snapshots, effectiveCompareAId])
  const compareB = useMemo(() => snapshots.find((s) => s.id === effectiveCompareBId), [snapshots, effectiveCompareBId])

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
    fieldSources?: FieldSources,
    fieldNotes?: FieldNotes,
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

    const created = saveSnapshot(form, result, trimmedLabel, sourceTradeDate, tags, fieldSources, fieldNotes)
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
    compareAId: effectiveCompareAId,
    setCompareAId,
    compareBId: effectiveCompareBId,
    setCompareBId,
    saveSnapshotWithOverwrite,
    addSnapshotTags,
    setSnapshotTags,
    deleteSnapshotEntry,
  }
}
