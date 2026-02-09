# Single-Environment Test Plan

Quick validation to confirm vitest and tsx work under Electron's Node.js
via `ELECTRON_RUN_AS_NODE=1`. Run these steps manually before committing
to the full migration.

## Background

Native modules (better-sqlite3, sharp, etc.) are compiled for Electron's
ABI after `npm install`. Running tests or scripts under system Node.js
requires rebuilding them for a different ABI, which causes the
`.forge-meta` cache desync bug. If everything runs under Electron's
Node.js instead, we eliminate the two-runtime problem entirely.

## Prerequisites

- Fresh `npm install` (native modules built for Electron via postinstall)
- Do NOT run `npm run rebuild:node` beforehand

## Step 1: Verify Electron binary path

```bash
node -e "console.log(require('electron'))"
```

Should print something like:
`/Users/.../node_modules/electron/dist/Electron.app/Contents/MacOS/Electron`

## Step 2: Confirm Electron's Node.js ABI

```bash
ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron -e \
  "console.log('Node:', process.version, 'ABI:', process.versions.modules)"
```

Expected: ABI should be `143` (matching Electron 40). This is the same
ABI the native modules were compiled for.

## Step 3: Run vitest under Electron's Node

```bash
ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron \
  ./node_modules/vitest/vitest.mjs
```

Check:

- [ ] All 4 test files discovered
- [ ] All 71 tests pass
- [ ] No NODE_MODULE_VERSION errors
- [ ] Watch mode works (press `a` to re-run, `q` to quit)

If vitest fails to start, try with the forks pool (isolates via
child_process instead of worker_threads):

```bash
ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron \
  ./node_modules/vitest/vitest.mjs --pool=forks
```

## Step 4: Run tsx scripts under Electron's Node

```bash
ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron \
  ./node_modules/.bin/tsx scripts/db-stats.ts
```

```bash
ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron \
  ./node_modules/.bin/tsx scripts/db-search.ts "test query"
```

Check:

- [ ] Scripts execute without ABI errors
- [ ] Output is identical to running via system Node after rebuild

## Step 5: Verify npm run dev still works

```bash
npm run dev
```

Check:

- [ ] No NODE_MODULE_VERSION errors
- [ ] App starts normally
- [ ] No rebuild step was needed (postinstall already built for Electron)

## Step 6: Full cycle test

Run the tests, then immediately start dev — no rebuilds in between:

```bash
ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron \
  ./node_modules/vitest/vitest.mjs --run

npm run dev
```

Check:

- [ ] Tests pass
- [ ] Dev starts without ABI errors
- [ ] No rebuild was needed between the two commands

## Results

| Step           | Pass/Fail | Notes |
| -------------- | --------- | ----- |
| 2. ABI check   |           |       |
| 3. vitest      |           |       |
| 4. tsx scripts |           |       |
| 5. npm run dev |           |       |
| 6. Full cycle  |           |       |

## Decision

- **All pass** → Proceed with migration-to-single-env-plan.md
- **vitest fails, tsx works** → Use single-env for scripts, fall back to
  `npx @electron/rebuild -f` for the test↔dev cycle
- **Both fail** → Abandon single-env, use `npx @electron/rebuild -f` in
  the `rebuild:electron` script
