# MemoryLane v0.13.7

Patch release focused on the packaged MCP server database path.

## What's Changed

- **Fixed packaged MCP database resolution** - the installed Windows app now opens `MemoryLane\memorylane.db` instead of falling back to the stale dev database path
- **Preserved dev MCP behavior** - local Electron dev runs still resolve to `memorylane\memorylane-dev.db`
- **Added regression coverage** - path resolution now has targeted tests for packaged vs dev Electron executables

## Full Changelog

https://github.com/deusXmachina-dev/memorylane/compare/v0.13.6...v0.13.7
