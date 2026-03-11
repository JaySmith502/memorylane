import * as React from 'react'
import { Button } from '@components/ui/button'
import { Card, CardContent } from '@components/ui/card'
import type { LlmHealthStatus } from '@types'

interface CaptureControlSectionProps {
  capturing: boolean
  captureHotkeyLabel: string
  llmHealth: LlmHealthStatus | null
  toggling: boolean
  onToggle: () => void
}

function describeLlmHealth(llmHealth: LlmHealthStatus | null): {
  dotClassName: string
  text: string
} | null {
  if (!llmHealth) return null

  if (llmHealth.state === 'active') {
    return {
      dotClassName: 'bg-emerald-500',
      text: 'LLM active',
    }
  }

  if (llmHealth.state === 'failing') {
    const requestsLabel = llmHealth.consecutiveFailures === 1 ? 'request' : 'requests'
    return {
      dotClassName: 'bg-destructive',
      text: `LLM issue: last ${llmHealth.consecutiveFailures} ${requestsLabel} failed`,
    }
  }

  if (llmHealth.state === 'unknown') {
    return {
      dotClassName: 'bg-muted-foreground/50',
      text: 'LLM ready, waiting for activity',
    }
  }

  return null
}

export function CaptureControlSection({
  capturing,
  captureHotkeyLabel,
  llmHealth,
  toggling,
  onToggle,
}: CaptureControlSectionProps): React.JSX.Element {
  const healthDescriptor = describeLlmHealth(llmHealth)

  return (
    <Card>
      <CardContent>
        <Button
          className="w-full gap-2"
          variant={capturing ? 'destructive' : 'default'}
          size="lg"
          disabled={toggling}
          onClick={onToggle}
        >
          {capturing ? (
            <>
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="1" />
              </svg>
              Stop Capture
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              Start Capture
            </>
          )}
        </Button>
        {healthDescriptor ? (
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <span className={`h-2 w-2 shrink-0 rounded-full ${healthDescriptor.dotClassName}`} />
            <span>{healthDescriptor.text}</span>
          </div>
        ) : null}
        {captureHotkeyLabel ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Start/Stop Shortcut: {captureHotkeyLabel}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
