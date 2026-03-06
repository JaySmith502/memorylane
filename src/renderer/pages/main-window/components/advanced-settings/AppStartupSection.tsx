import { Button } from '@components/ui/button'
import { SectionToggle } from './SectionToggle'

interface AppStartupSectionProps {
  open: boolean
  onToggle: () => void
  autoStartEnabled: boolean
  onAutoStartEnabledChange: (enabled: boolean) => void
}

export function AppStartupSection({
  open,
  onToggle,
  autoStartEnabled,
  onAutoStartEnabledChange,
}: AppStartupSectionProps): React.JSX.Element {
  return (
    <section>
      <SectionToggle label="App Startup" open={open} onToggle={onToggle} />
      {open && (
        <div className="mt-3 space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">
                  Should the app start on login?
                </p>
              </div>
              <div className="grid shrink-0 grid-cols-2 gap-2">
                <Button
                  variant={autoStartEnabled ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => onAutoStartEnabledChange(true)}
                >
                  On
                </Button>
                <Button
                  variant={!autoStartEnabled ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => onAutoStartEnabledChange(false)}
                >
                  Off
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
