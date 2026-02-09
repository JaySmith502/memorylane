# Migration to Single-Environment Plan

Migrate all Node.js scripts (tests, utilities) to run under Electron's
Node.js via `ELECTRON_RUN_AS_NODE=1`, eliminating the two-runtime ABI
mismatch problem.

Only proceed after completing single-env-test-plan.md successfully.

## Goal

- Native modules are compiled once (for Electron) and never rebuilt
- Tests, dev, utility scripts, and CI all use the same ABI
- No more `rebuild:node` / `rebuild:electron` dance
- No more `.forge-meta` cache desync bugs

## Step 1: Create the Electron Node wrapper script

Create `scripts/enode.sh`:

```bash
#!/bin/bash
# Run a command using Electron's Node.js runtime.
# Ensures native modules compiled for Electron work everywhere.
ELECTRON_RUN_AS_NODE=1 exec "$(dirname "$0")/../node_modules/.bin/electron" "$@"
```

Make it executable: `chmod +x scripts/enode.sh`

## Step 2: Update package.json scripts

```jsonc
{
  "scripts": {
    // Dev — no rebuild needed, postinstall already built for Electron
    "dev": "electron-vite dev",

    // Tests — run vitest under Electron's Node
    "test": "./scripts/enode.sh ./node_modules/vitest/vitest.mjs",

    // Build & package — unchanged
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "package": "npm run build && electron-builder --dir",
    "make": "npm run build && electron-builder",
    "make:mac": "npm run build && electron-builder --mac",
    "make:win": "npm run build && electron-builder --win",
    "make:linux": "npm run build && electron-builder --linux",

    // Linting & formatting — unchanged (no native modules)
    "lint": "eslint --ext .ts,.tsx .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",

    // Utility scripts — run tsx under Electron's Node
    "db:search": "./scripts/enode.sh ./node_modules/.bin/tsx scripts/db-search.ts",
    "db:stats": "./scripts/enode.sh ./node_modules/.bin/tsx scripts/db-stats.ts",
    "mcp:start": "./scripts/enode.sh ./node_modules/.bin/tsx scripts/mcp-server.ts",
    "mcp:inspector": "npx @modelcontextprotocol/inspector npm run mcp:start",

    // Keep postinstall — builds native modules for Electron
    "postinstall": "electron-builder install-app-deps",
    "prepare": "husky",
  },
}
```

### What changed

| Script      | Before                                          | After                                                              |
| ----------- | ----------------------------------------------- | ------------------------------------------------------------------ |
| `dev`       | `npm run rebuild:electron && electron-vite dev` | `electron-vite dev`                                                |
| `test`      | `npm run rebuild:node && vitest`                | `./scripts/enode.sh ./node_modules/vitest/vitest.mjs`              |
| `db:search` | `tsx scripts/db-search.ts`                      | `./scripts/enode.sh ./node_modules/.bin/tsx scripts/db-search.ts`  |
| `db:stats`  | `tsx scripts/db-stats.ts`                       | `./scripts/enode.sh ./node_modules/.bin/tsx scripts/db-stats.ts`   |
| `mcp:start` | `tsx scripts/mcp-server.ts`                     | `./scripts/enode.sh ./node_modules/.bin/tsx scripts/mcp-server.ts` |

### What was removed

- `rebuild:electron` script — no longer needed
- `rebuild:node` script — no longer needed
- Rebuild step in `dev` script — postinstall handles it

## Step 3: Verify everything works

Run each script and confirm no ABI errors:

```bash
npm test              # vitest under Electron's Node
npm run dev           # electron-vite dev (Ctrl+C to exit)
npm run db:stats      # utility script
npm run mcp:start     # MCP server (Ctrl+C to exit)
```

Then run the critical cycle: test → dev → test with zero rebuilds:

```bash
npm test -- --run && npm run dev
```

## Step 4: Update CLAUDE.md

Update the development commands section to remove references to
`rebuild:electron` and `rebuild:node`. Add a note explaining the
single-runtime approach:

> All scripts run under Electron's Node.js via `scripts/enode.sh`.
> Native modules are compiled once for Electron during `npm install`
> (via postinstall) and never need rebuilding.

## Step 5: Clean up

- Delete the `single-env-test-plan.md` and `migration-to-single-env-plan.md`
  files (they served their purpose)

## Rollback plan

If issues surface later (e.g., a vitest update breaks under Electron's
Node), the rollback is:

1. Remove `enode.sh` wrapper from scripts
2. Restore `rebuild:electron` and `rebuild:node` scripts
3. Set `"dev": "npx @electron/rebuild -f && electron-vite dev"`
4. Set `"test": "npm rebuild better-sqlite3 && vitest"`

This restores the two-runtime approach with force rebuild, which is the
known-good fallback.

## CI considerations

- `ELECTRON_RUN_AS_NODE=1` does not require a display — no xvfb needed
- `npm ci` triggers postinstall which builds native modules for Electron
- `npm test` uses Electron's Node automatically via enode.sh
- No additional CI configuration changes needed
