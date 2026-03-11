import { useCallback, useEffect, useState } from 'react'
import type { LlmHealthStatus, MainWindowAPI } from '@types'

interface UseLlmHealthParams {
  api: MainWindowAPI
  enabled: boolean
}

export function useLlmHealth({ api, enabled }: UseLlmHealthParams): {
  llmHealth: LlmHealthStatus | null
  refreshLlmHealth: () => Promise<void>
} {
  const [llmHealth, setLlmHealth] = useState<LlmHealthStatus | null>(null)

  const refreshLlmHealth = useCallback(async (): Promise<void> => {
    try {
      const status = await api.getLlmHealth()
      setLlmHealth(status)
    } catch {
      // Silently handle error
    }
  }, [api])

  useEffect(() => {
    if (!enabled) return
    void refreshLlmHealth()
  }, [enabled, refreshLlmHealth])

  useEffect(() => {
    if (!enabled) return

    const intervalId = window.setInterval(() => {
      void refreshLlmHealth()
    }, 5000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [enabled, refreshLlmHealth])

  useEffect(() => {
    if (!enabled || llmHealth?.state !== 'unknown') return

    void api.testLlmConnection().finally(() => {
      void refreshLlmHealth()
    })
  }, [api, enabled, llmHealth?.state, refreshLlmHealth])

  return { llmHealth, refreshLlmHealth }
}
