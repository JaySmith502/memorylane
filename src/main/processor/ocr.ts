import { spawn } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'

interface OcrExecutable {
  readonly command: string
  readonly args: readonly string[]
}

/**
 * Resolves the OCR executable.
 * In production, uses the pre-compiled binary shipped in the app resources.
 * In development, interprets the Swift script via the `swift` command.
 */
function getOcrExecutable(): OcrExecutable {
  let isPackaged = false
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    isPackaged = require('electron').app.isPackaged
  } catch {
    // Running under ELECTRON_RUN_AS_NODE — treat as dev
  }

  if (isPackaged) {
    const binaryPath = path.join(process.resourcesPath, 'swift', 'ocr')
    if (fs.existsSync(binaryPath)) {
      return { command: binaryPath, args: [] }
    }
    throw new Error(`OCR binary not found at ${binaryPath}`)
  }

  const scriptPath = path.resolve(process.cwd(), 'src', 'main', 'processor', 'swift', 'ocr.swift')
  if (fs.existsSync(scriptPath)) {
    return { command: 'swift', args: [scriptPath] }
  }

  throw new Error(`OCR script not found at ${scriptPath}`)
}

/**
 * Extracts text from an image using the native macOS Vision framework.
 * In production, runs a pre-compiled Swift binary. In development, interprets the Swift script.
 *
 * @param filepath Absolute path to the image file
 * @returns Promise resolving to the extracted text
 * @throws Error if the file doesn't exist or the OCR process fails
 */
export async function extractText(filepath: string): Promise<string> {
  const { command, args } = getOcrExecutable()

  return new Promise((resolve, reject) => {
    if (!fs.existsSync(filepath)) {
      return reject(new Error(`Image file not found: ${filepath}`))
    }

    const proc = spawn(command, [...args, filepath])

    let stdoutData = ''
    let stderrData = ''

    proc.stdout.on('data', (data) => {
      stdoutData += data.toString()
    })

    proc.stderr.on('data', (data) => {
      stderrData += data.toString()
    })

    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(
          new Error(
            `OCR process failed with code ${code}: ${stderrData.trim() || 'Unknown error'}`,
          ),
        )
      }

      resolve(stdoutData.trim())
    })

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn OCR process: ${err.message}`))
    })
  })
}
