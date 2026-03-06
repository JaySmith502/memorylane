import type { MainWindowAPI } from '@types'
import { DatabaseExportSection } from '../DatabaseExportSection'
import { SectionToggle } from './SectionToggle'

interface DataManagementSectionProps {
  api: MainWindowAPI
  open: boolean
  onToggle: () => void
}

export function DataManagementSection({
  api,
  open,
  onToggle,
}: DataManagementSectionProps): React.JSX.Element {
  return (
    <section>
      <SectionToggle label="Data Management" open={open} onToggle={onToggle} />
      {open && (
        <div className="mt-3">
          <DatabaseExportSection api={api} />
        </div>
      )}
    </section>
  )
}
