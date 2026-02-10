import * as React from 'react'
import { BringYourOwnKeyColumn } from './BringYourOwnKeyColumn'
import type { MainWindowAPI } from '@types'

interface ApiKeySetupSectionProps {
  api: MainWindowAPI
  onKeySet: () => void
}

export function ApiKeySetupSection({ api, onKeySet }: ApiKeySetupSectionProps): React.JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-4">
      <BringYourOwnKeyColumn api={api} onKeySet={onKeySet} />
    </div>
  )
}
