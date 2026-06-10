import { useCallback, useState } from 'react'
import type { FieldNotes, FieldSources, FormState } from '../types'

type ManualEditedFields = Partial<Record<keyof FormState, true>>

function mergeSourcesWithManualEdits(
  sources: FieldSources | undefined,
  manualEditedFields: ManualEditedFields,
): FieldSources {
  const next: FieldSources = { ...(sources || {}) }
  for (const key of Object.keys(manualEditedFields) as Array<keyof FormState>) {
    if (manualEditedFields[key] && !next[key]) {
      next[key] = 'manual'
    }
  }
  return next
}

function clearFieldNote(prev: FieldNotes, field: keyof FormState): FieldNotes {
  if (!prev[field]) return prev
  const next = { ...prev }
  delete next[field]
  return next
}

export function useFieldMetadata() {
  const [fieldSources, setFieldSources] = useState<FieldSources>({})
  const [fieldNotes, setFieldNotes] = useState<FieldNotes>({})
  const [manualEditedFields, setManualEditedFields] = useState<ManualEditedFields>({})

  const clearFieldMetadata = useCallback(() => {
    setFieldSources({})
    setFieldNotes({})
    setManualEditedFields({})
  }, [])

  const applySyncedMetadata = useCallback((sources?: FieldSources, notesByField?: FieldNotes) => {
    setFieldSources(() => mergeSourcesWithManualEdits(sources, manualEditedFields))
    setFieldNotes(notesByField || {})
  }, [manualEditedFields])

  const markManualField = useCallback((field: keyof FormState) => {
    setManualEditedFields((prev) => ({ ...prev, [field]: true }))
    setFieldSources((prev) => ({ ...prev, [field]: 'manual' }))
    setFieldNotes((prev) => clearFieldNote(prev, field))
  }, [])

  return {
    fieldSources,
    fieldNotes,
    clearFieldMetadata,
    applySyncedMetadata,
    markManualField,
  }
}
