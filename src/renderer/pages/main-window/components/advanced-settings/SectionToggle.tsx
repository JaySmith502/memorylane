interface SectionToggleProps {
  label: string
  open: boolean
  onToggle: () => void
}

export function SectionToggle({ label, open, onToggle }: SectionToggleProps): React.JSX.Element {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
      onClick={onToggle}
    >
      <span className="text-[10px]">{open ? '\u25BC' : '\u25B6'}</span>
      {label}
    </button>
  )
}
