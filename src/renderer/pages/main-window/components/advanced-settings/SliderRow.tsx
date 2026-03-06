import { Label } from '@components/ui/label'
import { Slider } from '@components/ui/slider'
import { sliderVal } from './utils'

interface SliderRowProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  onChange: (v: number) => void
  onCommit: (v: number) => void
}

export function SliderRow({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
  onCommit,
}: SliderRowProps): React.JSX.Element {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <span className="text-xs font-mono text-foreground tabular-nums">{format(value)}</span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(sliderVal(v))}
        onValueCommitted={(v) => onCommit(sliderVal(v))}
      />
    </div>
  )
}
