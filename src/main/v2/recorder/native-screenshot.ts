import { spawn, type ChildProcess } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import log from '../../logger'

const SCREENSHOT_EXECUTABLE_ENV = 'MEMORYLANE_SCREENSHOT_EXECUTABLE'
const REQUEST_TIMEOUT_MS = 10_000

interface ScreenshotExecutable {
  readonly command: string
  readonly args: readonly string[]
}

export interface DesktopCaptureOptions {
  outputPath: string
  displayId?: number
  maxDimensionPx?: number
}

export interface DesktopCaptureResult {
  filepath: string
  width: number
  height: number
  displayId: number
}

interface SwiftScreenCaptureSuccess {
  status: 'ok'
  mode: 'screen_only'
  filepath: string
  width: number
  height: number
  displayId: number
}

interface SwiftScreenCaptureError {
  status: 'error'
  code: string
  message: string
}

type SwiftHelperResponse = SwiftScreenCaptureSuccess | SwiftScreenCaptureError

interface HelperCaptureRequest {
  type: 'capture'
  outputPath: string
  displayId?: number
  maxDimensionPx?: number
}

interface HelperQuitRequest {
  type: 'quit'
}

type HelperRequest = HelperCaptureRequest | HelperQuitRequest

interface PendingResponse {
  proc: ChildProcess
  timeout: ReturnType<typeof setTimeout>
  resolve: (response: SwiftHelperResponse) => void
  reject: (error: Error) => void
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isSwiftScreenCaptureSuccess(value: unknown): value is SwiftScreenCaptureSuccess {
  if (!isObjectRecord(value)) {
    return false
  }

  return (
    value.status === 'ok' &&
    value.mode === 'screen_only' &&
    typeof value.filepath === 'string' &&
    typeof value.width === 'number' &&
    typeof value.height === 'number' &&
    typeof value.displayId === 'number'
  )
}

function isSwiftScreenCaptureError(value: unknown): value is SwiftScreenCaptureError {
  if (!isObjectRecord(value)) {
    return false
  }

  return (
    value.status === 'error' && typeof value.code === 'string' && typeof value.message === 'string'
  )
}

function getExecutable(): ScreenshotExecutable {
  const overridePath = process.env[SCREENSHOT_EXECUTABLE_ENV]
  if (overridePath && overridePath.length > 0) {
    if (!fs.existsSync(overridePath)) {
      throw new Error(`screenshot executable override does not exist: ${overridePath}`)
    }
    return { command: overridePath, args: [] }
  }

  let isPackaged = false
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    isPackaged = require('electron').app.isPackaged
  } catch {
    // Running under ELECTRON_RUN_AS_NODE — treat as dev
  }

  if (isPackaged) {
    const binaryPath = path.join(process.resourcesPath, 'swift', 'screenshot')
    if (fs.existsSync(binaryPath)) {
      return { command: binaryPath, args: [] }
    }
    throw new Error(`screenshot binary not found at ${binaryPath}`)
  }

  const devBinaryPath = path.resolve(process.cwd(), 'build', 'swift', 'screenshot')
  if (fs.existsSync(devBinaryPath)) {
    return { command: devBinaryPath, args: [] }
  }

  throw new Error(
    `screenshot binary not found at ${devBinaryPath}. Run "npm run build:swift" before starting capture.`,
  )
}

function ensureParentDirExists(outputPath: string): void {
  const parentDir = path.dirname(outputPath)
  fs.mkdirSync(parentDir, { recursive: true })
}

let helperProc: ChildProcess | null = null
let helperStdoutBuffer = ''
let helperStderrBuffer = ''
let helperPending: PendingResponse | null = null
let helperRequestChain: Promise<void> = Promise.resolve()
let helperShuttingDown = false

function appendRecentStderr(chunk: string): void {
  helperStderrBuffer += chunk
  if (helperStderrBuffer.length > 8_000) {
    helperStderrBuffer = helperStderrBuffer.slice(-8_000)
  }
}

function parseHelperStdout(proc: ChildProcess, chunk: string): void {
  helperStdoutBuffer += chunk

  let newlineIdx = helperStdoutBuffer.indexOf('\n')
  while (newlineIdx !== -1) {
    const line = helperStdoutBuffer.slice(0, newlineIdx).trim()
    helperStdoutBuffer = helperStdoutBuffer.slice(newlineIdx + 1)
    if (!line) {
      newlineIdx = helperStdoutBuffer.indexOf('\n')
      continue
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(line) as unknown
    } catch {
      const pending = helperPending
      if (pending && pending.proc === proc) {
        clearTimeout(pending.timeout)
        helperPending = null
        pending.reject(new Error(`Screenshot helper returned invalid JSON: ${line}`))
        killHelperProcess(proc, 'SIGTERM')
      } else {
        log.warn(`[NativeScreenshot] Ignoring invalid helper JSON without pending request: ${line}`)
      }
      continue
    }

    const pending = helperPending
    if (!pending || pending.proc !== proc) {
      log.warn(`[NativeScreenshot] Ignoring helper response without pending request: ${line}`)
      continue
    }

    clearTimeout(pending.timeout)
    helperPending = null

    if (isSwiftScreenCaptureSuccess(parsed) || isSwiftScreenCaptureError(parsed)) {
      pending.resolve(parsed)
    } else {
      pending.reject(new Error(`Unexpected screenshot helper response: ${line}`))
    }

    newlineIdx = helperStdoutBuffer.indexOf('\n')
  }
}

function killHelperProcess(proc: ChildProcess, signal: NodeJS.Signals): void {
  if (proc.exitCode !== null || proc.killed) return
  try {
    proc.kill(signal)
  } catch {
    // best effort
  }
}

function resetHelperStateIfCurrent(proc: ChildProcess): void {
  if (helperProc === proc) {
    helperProc = null
    helperStdoutBuffer = ''
    helperStderrBuffer = ''
  }
}

function attachHelperListeners(proc: ChildProcess): void {
  proc.stdout?.on('data', (chunk) => {
    parseHelperStdout(proc, chunk.toString())
  })

  proc.stderr?.on('data', (chunk) => {
    const text = chunk.toString()
    appendRecentStderr(text)
    const lines = text.split(/\r?\n/).filter((line) => line.length > 0)
    for (const line of lines) {
      log.debug(`[NativeScreenshot.Helper] ${line}`)
    }
  })

  proc.on('error', (error) => {
    const pending = helperPending
    if (pending && pending.proc === proc) {
      clearTimeout(pending.timeout)
      helperPending = null
      pending.reject(new Error(`Screenshot helper process error: ${error.message}`))
    }
    resetHelperStateIfCurrent(proc)
  })

  proc.on('close', (code, signal) => {
    const pending = helperPending
    if (pending && pending.proc === proc) {
      clearTimeout(pending.timeout)
      helperPending = null
      const details = helperStderrBuffer.trim() || 'Unknown error'
      pending.reject(
        new Error(
          `Screenshot process failed with code ${code} signal ${signal ?? 'none'}: ${details}`,
        ),
      )
    } else if (!helperShuttingDown) {
      log.debug(
        `[NativeScreenshot] Helper exited code=${code} signal=${signal ?? 'none'} (no pending request)`,
      )
    }
    resetHelperStateIfCurrent(proc)
  })
}

function spawnHelper(): ChildProcess {
  const { command, args } = getExecutable()
  const proc = spawn(command, [...args], {
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  if (!proc.stdin || !proc.stdout || !proc.stderr) {
    throw new Error('Screenshot helper stdio pipes are not available')
  }

  helperProc = proc
  helperStdoutBuffer = ''
  helperStderrBuffer = ''
  attachHelperListeners(proc)
  log.debug(`[NativeScreenshot] Spawned persistent helper pid=${proc.pid ?? 'unknown'}`)
  return proc
}

function getLiveHelper(): ChildProcess | null {
  if (!helperProc) return null
  if (helperProc.exitCode !== null || helperProc.killed) {
    helperProc = null
    return null
  }
  if (!helperProc.stdin || helperProc.stdin.destroyed) {
    helperProc = null
    return null
  }
  return helperProc
}

function ensureHelper(): ChildProcess {
  return getLiveHelper() ?? spawnHelper()
}

function writeHelperCommand(proc: ChildProcess, command: HelperRequest): Promise<void> {
  const stdin = proc.stdin
  if (!stdin || stdin.destroyed) {
    return Promise.reject(new Error('Screenshot helper stdin is not writable'))
  }

  const payload = `${JSON.stringify(command)}\n`
  return new Promise((resolve, reject) => {
    stdin.write(payload, (error) => {
      if (error) {
        reject(new Error(`Failed to write to screenshot helper: ${error.message}`))
        return
      }
      resolve()
    })
  })
}

function waitForHelperClose(proc: ChildProcess, timeoutMs: number): Promise<void> {
  if (proc.exitCode !== null) {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    let settled = false

    const finish = (): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      proc.off('close', onClose)
      resolve()
    }

    const onClose = (): void => finish()
    const timeout = setTimeout(() => finish(), timeoutMs)

    proc.once('close', onClose)
  })
}

async function sendCaptureRequest(
  proc: ChildProcess,
  command: HelperCaptureRequest,
): Promise<SwiftHelperResponse> {
  if (helperPending) {
    throw new Error('Screenshot helper request attempted while another request is pending')
  }

  return new Promise<SwiftHelperResponse>((resolve, reject) => {
    const timeout = setTimeout(() => {
      const pending = helperPending
      if (pending && pending.proc === proc) {
        helperPending = null
        pending.reject(new Error(`Screenshot process timed out after ${REQUEST_TIMEOUT_MS}ms`))
      }
      killHelperProcess(proc, 'SIGTERM')
    }, REQUEST_TIMEOUT_MS)

    helperPending = {
      proc,
      timeout,
      resolve,
      reject,
    }

    void writeHelperCommand(proc, command).catch((error) => {
      const pending = helperPending
      if (pending && pending.proc === proc) {
        clearTimeout(pending.timeout)
        helperPending = null
      }
      reject(error instanceof Error ? error : new Error(String(error)))
      killHelperProcess(proc, 'SIGTERM')
    })
  })
}

function enqueueCapture<T>(task: () => Promise<T>): Promise<T> {
  const result = helperRequestChain.then(task)
  helperRequestChain = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

async function runCapture(options: DesktopCaptureOptions): Promise<SwiftScreenCaptureSuccess> {
  const proc = ensureHelper()
  const response = await sendCaptureRequest(proc, {
    type: 'capture',
    outputPath: options.outputPath,
    displayId: options.displayId,
    maxDimensionPx: options.maxDimensionPx,
  })

  if (isSwiftScreenCaptureSuccess(response)) {
    return response
  }

  if (isSwiftScreenCaptureError(response)) {
    throw new Error(`[${response.code}] ${response.message}`)
  }

  throw new Error(`Unexpected screenshot helper response: ${JSON.stringify(response)}`)
}

export async function disposeNativeScreenshotHelper(): Promise<void> {
  const result = helperRequestChain.then(async () => {
    const proc = getLiveHelper()
    if (!proc) return

    helperShuttingDown = true
    try {
      try {
        await writeHelperCommand(proc, { type: 'quit' })
      } catch (error) {
        log.debug(
          `[NativeScreenshot] Failed to send quit to screenshot helper: ${error instanceof Error ? error.message : String(error)}`,
        )
      }

      await waitForHelperClose(proc, 1_000)
      if (proc.exitCode === null && !proc.killed) {
        killHelperProcess(proc, 'SIGTERM')
        await waitForHelperClose(proc, 1_000)
      }
    } finally {
      if (proc.exitCode === null && !proc.killed) {
        killHelperProcess(proc, 'SIGTERM')
      }
      resetHelperStateIfCurrent(proc)
      helperShuttingDown = false
    }
  })

  helperRequestChain = result.then(
    () => undefined,
    () => undefined,
  )
  await result
}

export function __getNativeScreenshotHelperPidForTests(): number | null {
  return getLiveHelper()?.pid ?? null
}

export async function captureDesktop(
  options: DesktopCaptureOptions,
): Promise<DesktopCaptureResult> {
  ensureParentDirExists(options.outputPath)

  if (options.maxDimensionPx !== undefined) {
    if (!Number.isFinite(options.maxDimensionPx) || options.maxDimensionPx <= 0) {
      throw new Error(`maxDimensionPx must be a positive finite number: ${options.maxDimensionPx}`)
    }
    options = { ...options, maxDimensionPx: Math.floor(options.maxDimensionPx) }
  }

  const output = await enqueueCapture(() => runCapture(options))
  if (!isSwiftScreenCaptureSuccess(output)) {
    throw new Error(`Unexpected screen capture response: ${JSON.stringify(output)}`)
  }

  log.debug(
    `[NativeScreenshot] Screen captured display=${output.displayId} size=${output.width}x${output.height}`,
  )
  return {
    filepath: output.filepath,
    width: output.width,
    height: output.height,
    displayId: output.displayId,
  }
}
