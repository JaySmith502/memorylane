import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { StorageService, StoredEvent } from './storage'
import * as path from 'path'
import * as fs from 'fs'

const deleteDbFiles = (dbPath: string): void => {
  for (const suffix of ['', '-wal', '-shm']) {
    const filePath = dbPath + suffix
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
  }
}

// Helper to create a complete StoredEvent with defaults
const createEvent = (overrides: Partial<StoredEvent> & { id: string }): StoredEvent => ({
  id: overrides.id,
  timestamp: overrides.timestamp ?? Date.now(),
  text: overrides.text ?? 'Sample text',
  summary: overrides.summary ?? 'Sample summary',
  appName: overrides.appName ?? 'TestApp',
  vector: overrides.vector ?? [0.1, 0.2, 0.3],
})

describe('StorageService', () => {
  const TEST_DB_PATH = path.join(process.cwd(), 'temp_test.db')
  const VECTOR_DIMS = 3
  let storage: StorageService

  beforeEach(async () => {
    deleteDbFiles(TEST_DB_PATH)
    storage = new StorageService(TEST_DB_PATH, { vectorDimensions: VECTOR_DIMS })
    await storage.init()
  })

  afterEach(async () => {
    await storage.close()
    deleteDbFiles(TEST_DB_PATH)
  })

  it('should add and retrieve an event with all fields', async () => {
    const event = createEvent({
      id: 'uuid-1',
      timestamp: 1234567890,
      text: 'Hello World',
      summary: 'User said hello',
      appName: 'VS Code',
      vector: [0.1, 0.2, 0.3],
    })

    await storage.addEvent(event)

    const retrieved = await storage.getEventById('uuid-1')
    expect(retrieved).not.toBeNull()
    expect(retrieved?.text).toBe('Hello World')
    expect(retrieved?.summary).toBe('User said hello')
    expect(retrieved?.appName).toBe('VS Code')

    // Check vector values with closeTo for floating point comparison
    expect(retrieved?.vector).toBeDefined()
    expect(retrieved?.vector.length).toBe(3)
    expect(retrieved?.vector[0]).toBeCloseTo(0.1)
    expect(retrieved?.vector[1]).toBeCloseTo(0.2)
    expect(retrieved?.vector[2]).toBeCloseTo(0.3)
  })

  it('should auto-initialize when addEvent is called without prior init', async () => {
    // Create a new storage instance without calling init()
    const autoInitStorage = new StorageService(TEST_DB_PATH, { vectorDimensions: VECTOR_DIMS })

    const event = createEvent({
      id: 'auto-init-1',
      timestamp: 1000,
      text: 'Test auto init',
      summary: 'Testing automatic initialization',
      appName: 'TestApp',
    })

    // Call addEvent directly without init()
    await autoInitStorage.addEvent(event)

    // Verify the event was stored
    const retrieved = await autoInitStorage.getEventById('auto-init-1')
    expect(retrieved).not.toBeNull()
    expect(retrieved?.id).toBe('auto-init-1')
    expect(retrieved?.text).toBe('Test auto init')

    await autoInitStorage.close()
  })

  describe('searchFTS', () => {
    it('should return matching results from text column', async () => {
      const event1 = createEvent({
        id: 'fts-1',
        timestamp: 1000,
        text: 'Apple Pie Recipe',
        summary: 'Baking dessert',
        appName: 'Safari',
      })

      const event2 = createEvent({
        id: 'fts-2',
        timestamp: 2000,
        text: 'Banana Bread Recipe',
        summary: 'Making bread',
        appName: 'Chrome',
      })

      await storage.addEvent(event1)
      await storage.addEvent(event2)

      const results = await storage.searchFTS('Apple', 10)

      expect(results.length).toBeGreaterThanOrEqual(1)
      const appleResult = results.find((r) => r.id === 'fts-1')
      expect(appleResult).toBeDefined()
      expect(appleResult?.text).toBe('Apple Pie Recipe')
    })

    it('should return empty array when table is empty', async () => {
      const results = await storage.searchFTS('nonexistent', 10)
      expect(results).toEqual([])
    })
  })

  describe('searchVectors', () => {
    it('should return results ordered by similarity', async () => {
      const event1 = createEvent({
        id: 'vec-1',
        timestamp: 1000,
        text: 'First event',
        vector: [1.0, 0.0, 0.0],
      })

      const event2 = createEvent({
        id: 'vec-2',
        timestamp: 2000,
        text: 'Second event',
        vector: [0.9, 0.1, 0.0],
      })

      const event3 = createEvent({
        id: 'vec-3',
        timestamp: 3000,
        text: 'Third event',
        vector: [0.0, 1.0, 0.0],
      })

      await storage.addEvent(event1)
      await storage.addEvent(event2)
      await storage.addEvent(event3)

      const queryVector = [1.0, 0.0, 0.0]
      const results = await storage.searchVectors(queryVector, 10)

      expect(results.length).toBe(3)
      // First result should be most similar (vec-1)
      expect(results[0].id).toBe('vec-1')
    })

    it('should return empty array on empty table', async () => {
      const results = await storage.searchVectors([1.0, 0.0, 0.0], 10)
      expect(results).toEqual([])
    })
  })

  describe('getDateRange', () => {
    it('should return correct oldest and newest timestamps', async () => {
      const event1 = createEvent({ id: 'date-1', timestamp: 5000 })
      const event2 = createEvent({ id: 'date-2', timestamp: 1000 })
      const event3 = createEvent({ id: 'date-3', timestamp: 3000 })

      await storage.addEvent(event1)
      await storage.addEvent(event2)
      await storage.addEvent(event3)

      const range = await storage.getDateRange()

      expect(range.oldest).toBe(1000)
      expect(range.newest).toBe(5000)
    })

    it('should return null values when table is empty', async () => {
      const range = await storage.getDateRange()

      expect(range.oldest).toBeNull()
      expect(range.newest).toBeNull()
    })
  })

  describe('searchVectorsWithFilters', () => {
    it('should handle appName with single quote (SQL escaping)', async () => {
      const event1 = createEvent({
        id: 'quote-1',
        timestamp: 1000,
        appName: "Editor's Choice",
        vector: [1.0, 0.0, 0.0],
      })

      const event2 = createEvent({
        id: 'quote-2',
        timestamp: 2000,
        appName: 'Regular App',
        vector: [0.9, 0.1, 0.0],
      })

      await storage.addEvent(event1)
      await storage.addEvent(event2)

      const results = await storage.searchVectorsWithFilters([1.0, 0.0, 0.0], 10, {
        appName: "Editor's Choice",
      })

      expect(results.length).toBe(1)
      expect(results[0].id).toBe('quote-1')
      expect(results[0].appName).toBe("Editor's Choice")
    })

    describe('comprehensive filter combinations', () => {
      beforeEach(async () => {
        // Seed realistic dataset: 6 events across 3 apps spanning time range
        const events = [
          createEvent({
            id: 'ev-1',
            timestamp: 1000,
            appName: 'VS Code',
            text: 'Writing TypeScript handler',
            summary: 'Coding a REST API endpoint',
            vector: [1.0, 0.0, 0.0],
          }),
          createEvent({
            id: 'ev-2',
            timestamp: 2000,
            appName: 'Chrome',
            text: 'Reading TypeScript docs on MDN',
            summary: 'Browsing documentation',
            vector: [0.8, 0.2, 0.0],
          }),
          createEvent({
            id: 'ev-3',
            timestamp: 3000,
            appName: 'VS Code',
            text: 'Reviewing pull request changes',
            summary: 'Code review in editor',
            vector: [0.6, 0.4, 0.0],
          }),
          createEvent({
            id: 'ev-4',
            timestamp: 4000,
            appName: 'Slack',
            text: 'Discussing TypeScript migration',
            summary: 'Team chat about refactoring',
            vector: [0.4, 0.6, 0.0],
          }),
          createEvent({
            id: 'ev-5',
            timestamp: 5000,
            appName: 'VS Code',
            text: 'Writing unit tests for TypeScript',
            summary: 'Testing the API endpoint',
            vector: [0.9, 0.1, 0.0],
          }),
          createEvent({
            id: 'ev-6',
            timestamp: 6000,
            appName: 'Chrome',
            text: 'Searching StackOverflow for errors',
            summary: 'Debugging a runtime exception',
            vector: [0.3, 0.7, 0.0],
          }),
        ]

        for (const event of events) {
          await storage.addEvent(event)
        }
      })

      it('should return all events ordered by similarity when no filters applied', async () => {
        const queryVector = [1.0, 0.0, 0.0]
        const results = await storage.searchVectorsWithFilters(queryVector, 10)

        expect(results.length).toBe(6)
        // Most similar should be ev-1 (exact match)
        expect(results[0].id).toBe('ev-1')
      })

      it('should filter by startTime only', async () => {
        const queryVector = [1.0, 0.0, 0.0]
        const results = await storage.searchVectorsWithFilters(queryVector, 10, {
          startTime: 3500,
        })

        expect(results.length).toBe(3)
        const ids = results.map((r) => r.id)
        expect(ids).toContain('ev-4')
        expect(ids).toContain('ev-5')
        expect(ids).toContain('ev-6')
      })

      it('should filter by endTime only', async () => {
        const queryVector = [1.0, 0.0, 0.0]
        const results = await storage.searchVectorsWithFilters(queryVector, 10, {
          endTime: 2500,
        })

        expect(results.length).toBe(2)
        const ids = results.map((r) => r.id)
        expect(ids).toContain('ev-1')
        expect(ids).toContain('ev-2')
      })

      it('should filter by time range only (no appName)', async () => {
        const queryVector = [1.0, 0.0, 0.0]
        const results = await storage.searchVectorsWithFilters(queryVector, 10, {
          startTime: 2000,
          endTime: 5000,
        })

        expect(results.length).toBe(4)
        const ids = results.map((r) => r.id)
        expect(ids).toContain('ev-2')
        expect(ids).toContain('ev-3')
        expect(ids).toContain('ev-4')
        expect(ids).toContain('ev-5')
      })

      it('should filter by appName and narrow time window combined', async () => {
        const queryVector = [1.0, 0.0, 0.0]
        const results = await storage.searchVectorsWithFilters(queryVector, 10, {
          appName: 'VS Code',
          startTime: 2500,
          endTime: 5500,
        })

        expect(results.length).toBe(2)
        const ids = results.map((r) => r.id)
        expect(ids).toContain('ev-3')
        expect(ids).toContain('ev-5')
      })

      it('should return empty array when filters match nothing', async () => {
        const queryVector = [1.0, 0.0, 0.0]
        const results = await storage.searchVectorsWithFilters(queryVector, 10, {
          appName: 'Figma',
        })

        expect(results.length).toBe(0)
      })

      it('should respect limit with filters', async () => {
        const queryVector = [1.0, 0.0, 0.0]
        const results = await storage.searchVectorsWithFilters(queryVector, 1, {
          appName: 'VS Code',
        })

        expect(results.length).toBe(1)
      })
    })
  })

  describe('searchFTSWithFilters', () => {
    it('should filter FTS results by appName (case-sensitive column)', async () => {
      const vscodeEvent = createEvent({
        id: 'vscode-fts-1',
        timestamp: 1000,
        text: 'TypeScript function implementation',
        summary: 'Implementing a function',
        appName: 'VS Code',
      })

      const chromeEvent = createEvent({
        id: 'chrome-fts-1',
        timestamp: 2000,
        text: 'TypeScript documentation page',
        summary: 'Reading TypeScript docs',
        appName: 'Chrome',
      })

      await storage.addEvent(vscodeEvent)
      await storage.addEvent(chromeEvent)

      // Both events contain "TypeScript", but filter should only return VS Code
      const results = await storage.searchFTSWithFilters('TypeScript', 10, {
        appName: 'VS Code',
      })

      expect(results.length).toBe(1)
      expect(results[0].id).toBe('vscode-fts-1')
      expect(results[0].appName).toBe('VS Code')
    })

    it('should search summary column when term appears only in summary', async () => {
      const event = createEvent({
        id: 'summary-only-1',
        timestamp: 1000,
        text: 'Regular text without special term',
        summary: 'Debugging TypeScript application',
        appName: 'VS Code',
      })

      await storage.addEvent(event)

      const results = await storage.searchFTSWithFilters('Debugging', 10)

      expect(results.length).toBe(1)
      expect(results[0].id).toBe('summary-only-1')
      expect(results[0].summary).toContain('Debugging')
    })

    it('should deduplicate results when event matches in both text and summary', async () => {
      const event = createEvent({
        id: 'duplicate-1',
        timestamp: 1000,
        text: 'Python script for data analysis',
        summary: 'Writing Python code',
        appName: 'VS Code',
      })

      await storage.addEvent(event)

      const results = await storage.searchFTSWithFilters('Python', 10)

      // Should only appear once even though it matches in both columns
      expect(results.length).toBe(1)
      expect(results[0].id).toBe('duplicate-1')
    })
  })

  describe('getEventsByTimeRange', () => {
    it('should return events with correct appName field', async () => {
      const event1 = createEvent({
        id: 'time-1',
        timestamp: 1000,
        appName: 'VS Code',
      })

      const event2 = createEvent({
        id: 'time-2',
        timestamp: 2000,
        appName: 'Chrome',
      })

      await storage.addEvent(event1)
      await storage.addEvent(event2)

      const results = await storage.getEventsByTimeRange(null, null)

      expect(results.length).toBe(2)

      const vsCodeResult = results.find((r) => r.id === 'time-1')
      const chromeResult = results.find((r) => r.id === 'time-2')

      expect(vsCodeResult?.appName).toBe('VS Code')
      expect(chromeResult?.appName).toBe('Chrome')
    })

    it('should filter by time range correctly', async () => {
      const event1 = createEvent({ id: 'range-1', timestamp: 1000 })
      const event2 = createEvent({ id: 'range-2', timestamp: 2000 })
      const event3 = createEvent({ id: 'range-3', timestamp: 3000 })

      await storage.addEvent(event1)
      await storage.addEvent(event2)
      await storage.addEvent(event3)

      const results = await storage.getEventsByTimeRange(1500, 2500)

      expect(results.length).toBe(1)
      expect(results[0].id).toBe('range-2')
    })

    it('should include text field when includeText is true', async () => {
      const event = createEvent({
        id: 'text-1',
        timestamp: 1000,
        text: 'Full text content here',
        summary: 'Short summary',
      })

      await storage.addEvent(event)

      const results = await storage.getEventsByTimeRange(null, null, { includeText: true })

      expect(results.length).toBe(1)
      expect(results[0].text).toBe('Full text content here')
      expect(results[0].summary).toBe('Short summary')
    })

    it('should exclude text field when includeText is false or undefined', async () => {
      const event = createEvent({
        id: 'text-2',
        timestamp: 1000,
        text: 'Full text content here',
      })

      await storage.addEvent(event)

      const results = await storage.getEventsByTimeRange(null, null)

      expect(results.length).toBe(1)
      expect(results[0].text).toBe('')
    })

    it('should filter with only startTime (no endTime)', async () => {
      const event1 = createEvent({ id: 'start-1', timestamp: 1000 })
      const event2 = createEvent({ id: 'start-2', timestamp: 2000 })
      const event3 = createEvent({ id: 'start-3', timestamp: 3000 })

      await storage.addEvent(event1)
      await storage.addEvent(event2)
      await storage.addEvent(event3)

      const results = await storage.getEventsByTimeRange(2000, null)

      expect(results.length).toBe(2)
      expect(results.find((r) => r.id === 'start-2')).toBeDefined()
      expect(results.find((r) => r.id === 'start-3')).toBeDefined()
    })

    it('should filter with only endTime (no startTime)', async () => {
      const event1 = createEvent({ id: 'end-1', timestamp: 1000 })
      const event2 = createEvent({ id: 'end-2', timestamp: 2000 })
      const event3 = createEvent({ id: 'end-3', timestamp: 3000 })

      await storage.addEvent(event1)
      await storage.addEvent(event2)
      await storage.addEvent(event3)

      const results = await storage.getEventsByTimeRange(null, 2000)

      expect(results.length).toBe(2)
      expect(results.find((r) => r.id === 'end-1')).toBeDefined()
      expect(results.find((r) => r.id === 'end-2')).toBeDefined()
    })
  })

  describe('countRows', () => {
    it('should return correct count of events', async () => {
      expect(await storage.countRows()).toBe(0)

      await storage.addEvent(createEvent({ id: 'count-1' }))
      expect(await storage.countRows()).toBe(1)

      await storage.addEvent(createEvent({ id: 'count-2' }))
      expect(await storage.countRows()).toBe(2)
    })
  })
})
