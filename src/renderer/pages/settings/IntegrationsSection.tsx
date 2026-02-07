import { useCallback } from 'react'
import { useSettingsAPI } from '../../hooks/use-settings-api'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'

export function IntegrationsSection(): React.JSX.Element {
  const api = useSettingsAPI()

  const handleAddToClaude = useCallback(() => {
    void api.addToClaude()
  }, [api])

  const handleAddToCursor = useCallback(() => {
    void api.addToCursor()
  }, [api])

  return (
    <Card className="border-zinc-700/50 bg-zinc-800/50">
      <CardHeader>
        <CardTitle className="text-lg text-white">Integrations</CardTitle>
        <CardDescription className="text-zinc-400">
          Register MemoryLane as an MCP server for AI assistants.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Button
          className="w-full bg-zinc-700 hover:bg-zinc-600 text-white"
          onClick={handleAddToClaude}
        >
          Add to Claude Desktop
        </Button>
        <Button
          className="w-full bg-zinc-700 hover:bg-zinc-600 text-white"
          onClick={handleAddToCursor}
        >
          Add to Cursor
        </Button>
      </CardContent>
    </Card>
  )
}
