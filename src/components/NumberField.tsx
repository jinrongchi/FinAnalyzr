import { useState } from 'react'
import type { FieldSource, FormState } from '../types'

const SOURCE_LABELS: Record<FieldSource, string> = {
  auto: 'TuShare',
  derived: '推导',
  default: '默认',
  manual: '手工',
}

type NumberFieldProps = {
  label: string
  name: keyof FormState
  step?: number
  min?: number
  max?: number
  value: number
  emptyIfZero?: boolean
  source?: FieldSource
  helperText?: string
  helperFormula?: string
  onChange: (name: keyof FormState, value: string) => void
}

export function NumberField(props: NumberFieldProps) {
  const [showFormula, setShowFormula] = useState(false)
  const [popAlign, setPopAlign] = useState<'left' | 'right'>('right')
  const hasPopover = Boolean(props.helperFormula || props.helperText)
  const isEmptyValue = props.emptyIfZero && props.value === 0
  const showSourceBadge = Boolean(props.source) && !isEmptyValue
  const showPending = isEmptyValue
  const showHelperTextInline = Boolean(props.helperText) && !(props.source === 'default' && props.helperFormula)

  function handleEnter(target: EventTarget | null): void {
    if (!hasPopover || !target || !(target instanceof HTMLElement)) return
    const rect = target.getBoundingClientRect()
    setPopAlign(rect.left < window.innerWidth / 2 ? 'left' : 'right')
    setShowFormula(true)
  }

  const popContent = props.helperFormula || props.helperText || ''

  return (
    <label>
      <span className="field-label-row">
        <span>{props.label}</span>
        {showSourceBadge && props.source ? (
          <span
            className="source-badge-wrap"
            onMouseEnter={(e) => handleEnter(e.currentTarget)}
            onMouseLeave={() => hasPopover && setShowFormula(false)}
          >
            <span
              className={`source-badge source-${props.source}`}
              onFocus={(e) => handleEnter(e.currentTarget)}
              onBlur={() => hasPopover && setShowFormula(false)}
              tabIndex={hasPopover ? 0 : -1}
              aria-label={hasPopover ? '悬停查看字段说明' : undefined}
            >
              {SOURCE_LABELS[props.source]}
            </span>
            {showFormula && popContent ? (
              <span className={`source-formula-pop ${popAlign === 'left' ? 'align-left' : 'align-right'}`} role="tooltip">
                {popContent}
              </span>
            ) : null}
          </span>
        ) : showPending ? <span className="source-badge source-pending">待补充</span> : null}
      </span>
      <input
        type="number"
        name={props.name}
        step={props.step ?? 0.1}
        min={props.min}
        max={props.max}
        value={props.emptyIfZero && props.value === 0 ? '' : props.value}
        placeholder={props.emptyIfZero ? 'N/A' : undefined}
        onChange={(e) => props.onChange(props.name, e.target.value)}
      />
      {showHelperTextInline ? (
        <span className={`field-helper ${isEmptyValue ? 'is-muted' : ''}`}>
          <span className="field-helper-text">{props.helperText}</span>
        </span>
      ) : null}
    </label>
  )
}
