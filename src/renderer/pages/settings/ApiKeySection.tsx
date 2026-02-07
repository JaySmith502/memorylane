import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useSettingsAPI } from '../../hooks/use-settings-api'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import type { KeyStatus } from '../../../shared/types'

function validateApiKey(key: string): boolean {
  return key.startsWith('sk-or-') && key.length > 10
}

export function ApiKeySection(): React.JSX.Element {
  const api = useSettingsAPI()
  const [keyStatus, setKeyStatus] = useState<KeyStatus | null>(null)
  const [inputValue, setInputValue] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const loadKeyStatus = useCallback(async () => {
    try {
      const status = await api.getKeyStatus()
      setKeyStatus(status)
    } catch {
      toast.error('Failed to load key status')
    }
  }, [api])

  useEffect(() => {
    void loadKeyStatus()
  }, [loadKeyStatus])

  useEffect(() => {
    const handleFocus = (): void => {
      void loadKeyStatus()
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [loadKeyStatus])

  const handleSave = useCallback(async () => {
    const key = inputValue.trim()
    if (key === '') {
      toast.error('Please enter an API key')
      return
    }
    if (!validateApiKey(key)) {
      toast.error('Invalid API key format (should start with sk-or-)')
      return
    }

    setSaving(true)
    try {
      const result = await api.saveApiKey(key)
      if (result.success) {
        setInputValue('')
        toast.success('API key saved successfully')
        await loadKeyStatus()
      } else {
        toast.error(result.error ?? 'Failed to save API key')
      }
    } finally {
      setSaving(false)
    }
  }, [api, inputValue, loadKeyStatus])

  const handleDelete = useCallback(async () => {
    setDeleting(true)
    try {
      const result = await api.deleteApiKey()
      if (result.success) {
        toast.success('API key deleted')
        await loadKeyStatus()
      } else {
        toast.error(result.error ?? 'Failed to delete API key')
      }
    } finally {
      setDeleting(false)
    }
  }, [api, loadKeyStatus])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        void handleSave()
      }
    },
    [handleSave],
  )

  const canDelete = keyStatus?.source === 'stored'

  return (
    <Card>
      <CardHeader>
        <CardTitle>API Key</CardTitle>
        <CardDescription>Required for activity classification.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {keyStatus !== null && (
          <Badge variant={keyStatus.source === 'none' ? 'secondary' : 'outline'}>
            {keyStatus.source === 'stored' && `Stored: ${keyStatus.maskedKey}`}
            {keyStatus.source === 'env' && `Environment: ${keyStatus.maskedKey}`}
            {keyStatus.source === 'none' && 'No key configured'}
          </Badge>
        )}

        <div className="relative">
          <Input
            type={passwordVisible ? 'text' : 'password'}
            placeholder="sk-or-v1-..."
            autoComplete="off"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className="pr-16 font-mono"
          />
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => setPasswordVisible((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2"
          >
            {passwordVisible ? 'Hide' : 'Show'}
          </Button>
        </div>

        <div className="flex gap-2">
          <Button className="flex-1" disabled={saving} onClick={() => void handleSave()}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
          <Button
            variant="destructive"
            disabled={!canDelete || deleting}
            onClick={() => void handleDelete()}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Your API key is encrypted and stored securely on this device.
        </p>
      </CardContent>
    </Card>
  )
}
