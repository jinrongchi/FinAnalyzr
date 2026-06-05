import type { FormState } from '../types'

type NumberFieldProps = {
  label: string
  name: keyof FormState
  step?: number
  min?: number
  max?: number
  value: number
  emptyIfZero?: boolean
  onChange: (name: keyof FormState, value: string) => void
}

export function NumberField(props: NumberFieldProps) {
  return (
    <label>
      {props.label}
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
    </label>
  )
}
