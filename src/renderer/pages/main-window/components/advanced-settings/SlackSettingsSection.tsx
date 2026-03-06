import type { MainWindowAPI, SlackIntegrationStatus } from '@types'
import { SlackIntegrationSection } from '../SlackIntegrationSection'
import { SectionToggle } from './SectionToggle'

interface SlackSettingsSectionProps {
  api: MainWindowAPI
  open: boolean
  onToggle: () => void
  status: SlackIntegrationStatus | null
  onChanged: () => void
}

export function SlackSettingsSection({
  api,
  open,
  onToggle,
  status,
  onChanged,
}: SlackSettingsSectionProps): React.JSX.Element {
  return (
    <section>
      <SectionToggle label="Slack Integration" open={open} onToggle={onToggle} />
      {open && status && (
        <div className="mt-3">
          <SlackIntegrationSection api={api} status={status} onChanged={onChanged} />
        </div>
      )}
    </section>
  )
}
