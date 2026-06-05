import { useState, type ChangeEvent } from 'react'
import { DEFAULT_FORM } from '../data/defaults'
import type { FormState } from '../types'

export function useAnalyzerForm(onTickerChanged: () => void) {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)

  function resetForm(): void {
    setForm(DEFAULT_FORM)
  }

  function updateField(name: keyof FormState, value: string): void {
    if (name === 'ticker') {
      onTickerChanged()
    }
    setForm((prev) => {
      if (name === 'ticker') return { ...prev, ticker: value }
      const num = Number(value)
      return { ...prev, [name]: Number.isFinite(num) ? num : 0 }
    })
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement>): void {
    updateField(e.target.name as keyof FormState, e.target.value)
  }

  return {
    form,
    setForm,
    resetForm,
    updateField,
    handleInputChange,
  }
}
