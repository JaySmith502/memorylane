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
    <Card>
      <CardHeader>
        <CardTitle>Integrations</CardTitle>
        <CardDescription>Register MemoryLane as an MCP server for AI assistants.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Button className="w-full" onClick={handleAddToClaude}>
          Add to Claude Desktop
        </Button>
        <Button className="w-full" onClick={handleAddToCursor}>
          Add to Cursor
        </Button>
      </CardContent>
    </Card>
  )
}
