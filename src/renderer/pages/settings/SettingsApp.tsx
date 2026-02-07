import { Toaster } from '../../components/ui/sonner'
import { ApiKeySection } from './ApiKeySection'
import { IntegrationsSection } from './IntegrationsSection'
import { CaptureSettingsSection } from './CaptureSettingsSection'

export function SettingsApp(): React.JSX.Element {
  return (
    <div className="min-h-screen antialiased">
      <div className="p-8 max-w-lg mx-auto space-y-6">
        <ApiKeySection />
        <IntegrationsSection />
        <CaptureSettingsSection />
      </div>
      <Toaster />
    </div>
  )
}
