import { act, renderHook } from '@testing-library/react'
import type { ChangeEvent } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_FORM } from '../data/defaults'
import { useAnalyzerForm } from './useAnalyzerForm'

describe('useAnalyzerForm', () => {
  it('updates ticker and triggers callback', () => {
    const onTickerChanged = vi.fn()
    const { result } = renderHook(() => useAnalyzerForm(onTickerChanged))

    act(() => {
      result.current.updateField('ticker', '600519')
    })

    expect(onTickerChanged).toHaveBeenCalledTimes(1)
    expect(result.current.form.ticker).toBe('600519')
  })

  it('updates numeric fields via handlers', () => {
    const { result } = renderHook(() => useAnalyzerForm(() => undefined))

    act(() => {
      result.current.handleInputChange({
        target: { name: 'price', value: '123.45' },
      } as unknown as ChangeEvent<HTMLInputElement>)
    })

    expect(result.current.form.price).toBe(123.45)
  })

  it('resets to default form', () => {
    const { result } = renderHook(() => useAnalyzerForm(() => undefined))

    act(() => {
      result.current.updateField('ticker', '000001')
      result.current.updateField('price', '88')
    })

    expect(result.current.form.ticker).toBe('000001')
    expect(result.current.form.price).toBe(88)

    act(() => {
      result.current.resetForm()
    })

    expect(result.current.form).toEqual(DEFAULT_FORM)
  })
})
