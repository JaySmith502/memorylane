import { useCallback, useEffect, useState } from 'react'
import { useMainWindowAPI } from '../../hooks/use-main-window-api'
import { Button } from '../../components/ui/button'
import { Card, CardContent } from '../../components/ui/card'

export function MainWindowApp(): React.JSX.Element {
  const api = useMainWindowAPI()
  const [capturing, setCapturing] = useState(false)
  const [toggling, setToggling] = useState(false)

  useEffect(() => {
    void api.getStatus().then((status) => setCapturing(status.capturing))
    api.onStatusChanged((status) => setCapturing(status.capturing))
  }, [api])

  useEffect(() => {
    const handleFocus = (): void => {
      void api.getStatus().then((status) => setCapturing(status.capturing))
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [api])

  const handleToggle = useCallback(async () => {
    setToggling(true)
    try {
      const status = await api.toggleCapture()
      setCapturing(status.capturing)
    } finally {
      setToggling(false)
    }
  }, [api])

  const handleOpenSettings = useCallback(() => {
    api.openSettings()
  }, [api])

  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100 antialiased select-none">
      <div className="p-8 max-w-lg mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-white tracking-tight">MemoryLane</h1>
        </div>

        <Card className="border-zinc-700/50 bg-zinc-800/50">
          <CardContent>
            <Button
              className={
                capturing
                  ? 'w-full bg-red-700/80 hover:bg-red-700 text-white'
                  : 'w-full bg-zinc-700 hover:bg-zinc-600 text-white'
              }
              size="lg"
              disabled={toggling}
              onClick={() => void handleToggle()}
            >
              {capturing ? 'Stop Capture' : 'Start Capture'}
            </Button>
          </CardContent>
        </Card>

        <Button
          variant="outline"
          className="w-full border-zinc-700/50 bg-zinc-800/50 hover:bg-zinc-800 text-zinc-300 hover:text-white"
          onClick={handleOpenSettings}
        >
          Settings
        </Button>
      </div>
    </div>
  )
}
