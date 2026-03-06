import type { CustomEndpointStatus, KeyStatus, MainWindowAPI } from '@types'
import { CustomEndpointSection } from '../CustomEndpointSection'
import { ManageKeySection } from '../ManageKeySection'
import { SectionToggle } from './SectionToggle'

interface LlmConfigurationSectionProps {
  api: MainWindowAPI
  open: boolean
  onToggle: () => void
  keyStatus: KeyStatus | null
  endpointStatus: CustomEndpointStatus | null
  onKeyStatusChanged: () => void
  onEndpointStatusChanged: () => void
}

export function LlmConfigurationSection({
  api,
  open,
  onToggle,
  keyStatus,
  endpointStatus,
  onKeyStatusChanged,
  onEndpointStatusChanged,
}: LlmConfigurationSectionProps): React.JSX.Element {
  return (
    <section>
      <SectionToggle label="LLM Configuration" open={open} onToggle={onToggle} />
      {open && (
        <div className="mt-3 space-y-3">
          {keyStatus && !endpointStatus?.enabled && (
            <ManageKeySection
              api={api}
              keyStatus={keyStatus}
              onKeyDeleted={onKeyStatusChanged}
              onKeyUpdated={onKeyStatusChanged}
            />
          )}
          {endpointStatus && (
            <>
              {keyStatus && !endpointStatus.enabled && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="flex-1 h-px bg-border" />
                  <span>or</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
              )}
              <CustomEndpointSection
                api={api}
                endpointStatus={endpointStatus}
                onEndpointChanged={onEndpointStatusChanged}
              />
            </>
          )}
        </div>
      )}
    </section>
  )
}
