import { describe, expect, it } from 'vitest'
import { buildFallbackDbPath, isPackagedElectronExecutable } from './paths'

describe('isPackagedElectronExecutable', () => {
  it('detects the installed MemoryLane executable as packaged', () => {
    expect(isPackagedElectronExecutable('C:\\Program Files\\MemoryLane\\MemoryLane.exe')).toBe(true)
  })

  it('detects the local Electron dev executable as unpackaged', () => {
    expect(
      isPackagedElectronExecutable('C:\\repo\\node_modules\\electron\\dist\\electron.exe'),
    ).toBe(false)
  })
})

describe('fallback database paths', () => {
  it('uses the packaged Windows app directory and production database name', () => {
    expect(
      buildFallbackDbPath(
        'win32',
        'C:\\Users\\Example',
        'C:\\Users\\Example\\AppData\\Roaming',
        false,
      ),
    ).toBe('C:\\Users\\Example\\AppData\\Roaming\\MemoryLane\\memorylane.db')
  })

  it('uses the dev Windows app directory and dev database name', () => {
    expect(
      buildFallbackDbPath(
        'win32',
        'C:\\Users\\Example',
        'C:\\Users\\Example\\AppData\\Roaming',
        true,
      ),
    ).toBe('C:\\Users\\Example\\AppData\\Roaming\\memorylane\\memorylane-dev.db')
  })
})
