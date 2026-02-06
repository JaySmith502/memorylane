import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseTimeString } from './parse-time';

describe('parseTimeString', () => {
  const FIXED_TIME = new Date('2024-02-15T14:30:00.000Z').getTime();
  const FIXED_DATE = new Date(FIXED_TIME);

  beforeEach(() => {
    vi.useFakeTimers({ now: FIXED_TIME });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('keyword literals', () => {
    it('should parse "now" as current timestamp', () => {
      expect(parseTimeString('now')).toBe(FIXED_TIME);
    });

    it('should parse "today" as midnight of current day', () => {
      const expected = new Date(FIXED_DATE);
      expected.setHours(0, 0, 0, 0);
      expect(parseTimeString('today')).toBe(expected.getTime());
    });

    it('should parse "yesterday" as midnight of previous day', () => {
      const expected = new Date(FIXED_DATE);
      expected.setDate(expected.getDate() - 1);
      expected.setHours(0, 0, 0, 0);
      expect(parseTimeString('yesterday')).toBe(expected.getTime());
    });

    it('should be case insensitive for "now"', () => {
      expect(parseTimeString('NOW')).toBe(FIXED_TIME);
      expect(parseTimeString('Now')).toBe(FIXED_TIME);
      expect(parseTimeString('NoW')).toBe(FIXED_TIME);
    });

    it('should be case insensitive for "today"', () => {
      const expected = new Date(FIXED_DATE);
      expected.setHours(0, 0, 0, 0);
      expect(parseTimeString('TODAY')).toBe(expected.getTime());
      expect(parseTimeString('Today')).toBe(expected.getTime());
    });

    it('should be case insensitive for "yesterday"', () => {
      const expected = new Date(FIXED_DATE);
      expected.setDate(expected.getDate() - 1);
      expected.setHours(0, 0, 0, 0);
      expect(parseTimeString('YESTERDAY')).toBe(expected.getTime());
      expect(parseTimeString('Yesterday')).toBe(expected.getTime());
    });

    it('should handle leading and trailing whitespace', () => {
      expect(parseTimeString('  now  ')).toBe(FIXED_TIME);
      
      const today = new Date(FIXED_DATE);
      today.setHours(0, 0, 0, 0);
      expect(parseTimeString('  today  ')).toBe(today.getTime());
      
      const yesterday = new Date(FIXED_DATE);
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      expect(parseTimeString('  yesterday  ')).toBe(yesterday.getTime());
    });
  });

  describe('relative time strings - singular units', () => {
    it('should parse "1 minute ago"', () => {
      const expected = new Date(FIXED_TIME);
      expected.setMinutes(expected.getMinutes() - 1);
      expect(parseTimeString('1 minute ago')).toBe(expected.getTime());
    });

    it('should parse "1 hour ago"', () => {
      const expected = new Date(FIXED_TIME);
      expected.setHours(expected.getHours() - 1);
      expect(parseTimeString('1 hour ago')).toBe(expected.getTime());
    });

    it('should parse "1 day ago"', () => {
      const expected = new Date(FIXED_TIME);
      expected.setDate(expected.getDate() - 1);
      expect(parseTimeString('1 day ago')).toBe(expected.getTime());
    });

    it('should parse "1 week ago"', () => {
      const expected = new Date(FIXED_TIME);
      expected.setDate(expected.getDate() - 7);
      expect(parseTimeString('1 week ago')).toBe(expected.getTime());
    });

    it('should parse "1 month ago"', () => {
      const expected = new Date(FIXED_TIME);
      expected.setMonth(expected.getMonth() - 1);
      expect(parseTimeString('1 month ago')).toBe(expected.getTime());
    });
  });

  describe('relative time strings - plural units', () => {
    it('should parse "5 minutes ago"', () => {
      const expected = new Date(FIXED_TIME);
      expected.setMinutes(expected.getMinutes() - 5);
      expect(parseTimeString('5 minutes ago')).toBe(expected.getTime());
    });

    it('should parse "3 hours ago"', () => {
      const expected = new Date(FIXED_TIME);
      expected.setHours(expected.getHours() - 3);
      expect(parseTimeString('3 hours ago')).toBe(expected.getTime());
    });

    it('should parse "2 days ago"', () => {
      const expected = new Date(FIXED_TIME);
      expected.setDate(expected.getDate() - 2);
      expect(parseTimeString('2 days ago')).toBe(expected.getTime());
    });

    it('should parse "2 weeks ago"', () => {
      const expected = new Date(FIXED_TIME);
      expected.setDate(expected.getDate() - 14);
      expect(parseTimeString('2 weeks ago')).toBe(expected.getTime());
    });

    it('should parse "6 months ago"', () => {
      const expected = new Date(FIXED_TIME);
      expected.setMonth(expected.getMonth() - 6);
      expect(parseTimeString('6 months ago')).toBe(expected.getTime());
    });
  });

  describe('relative time strings - edge cases', () => {
    it('should parse "0 days ago" as current time', () => {
      const expected = new Date(FIXED_TIME);
      expected.setDate(expected.getDate() - 0);
      expect(parseTimeString('0 days ago')).toBe(expected.getTime());
    });

    it('should parse large values like "100 days ago"', () => {
      const expected = new Date(FIXED_TIME);
      expected.setDate(expected.getDate() - 100);
      expect(parseTimeString('100 days ago')).toBe(expected.getTime());
    });

    it('should be case insensitive', () => {
      const expected = new Date(FIXED_TIME);
      expected.setHours(expected.getHours() - 2);
      expect(parseTimeString('2 Hours Ago')).toBe(expected.getTime());
      expect(parseTimeString('2 HOURS AGO')).toBe(expected.getTime());
    });

    it('should handle extra whitespace between tokens', () => {
      const expected = new Date(FIXED_TIME);
      expected.setHours(expected.getHours() - 2);
      expect(parseTimeString('2  hours  ago')).toBe(expected.getTime());
    });

    it('should handle no space between number and unit', () => {
      const expected = new Date(FIXED_TIME);
      expected.setMinutes(expected.getMinutes() - 5);
      expect(parseTimeString('5minutes ago')).toBe(expected.getTime());
    });

    it('should handle leading and trailing whitespace', () => {
      const expected = new Date(FIXED_TIME);
      expected.setHours(expected.getHours() - 3);
      expect(parseTimeString('  3 hours ago  ')).toBe(expected.getTime());
    });
  });

  describe('ISO 8601 strings', () => {
    it('should parse full datetime', () => {
      const expected = new Date('2024-01-15T10:30:00').getTime();
      expect(parseTimeString('2024-01-15T10:30:00')).toBe(expected);
    });

    it('should parse datetime with Z timezone', () => {
      const expected = new Date('2024-01-15T10:30:00Z').getTime();
      expect(parseTimeString('2024-01-15T10:30:00Z')).toBe(expected);
    });

    it('should parse datetime with offset timezone', () => {
      const expected = new Date('2024-01-15T10:30:00+05:00').getTime();
      expect(parseTimeString('2024-01-15T10:30:00+05:00')).toBe(expected);
    });

    it('should parse date only', () => {
      const expected = new Date('2024-01-15').getTime();
      expect(parseTimeString('2024-01-15')).toBe(expected);
    });

    it('should parse various valid ISO formats', () => {
      expect(parseTimeString('2024-12-31T23:59:59.999Z')).not.toBeNull();
      expect(parseTimeString('2024-06-15T12:00:00-08:00')).not.toBeNull();
      expect(parseTimeString('2024-03-01')).not.toBeNull();
    });
  });

  describe('invalid inputs', () => {
    it('should return null for empty string', () => {
      expect(parseTimeString('')).toBeNull();
    });

    it('should return null for random text', () => {
      expect(parseTimeString('not a date')).toBeNull();
      expect(parseTimeString('foo bar')).toBeNull();
      expect(parseTimeString('random string')).toBeNull();
    });

    it('should return null for partial relative time strings', () => {
      expect(parseTimeString('ago')).toBeNull();
      expect(parseTimeString('5 ago')).toBeNull();
      expect(parseTimeString('hours ago')).toBeNull();
    });

    it('should return null for unsupported time units', () => {
      expect(parseTimeString('2 seconds ago')).toBeNull();
      expect(parseTimeString('1 year ago')).toBeNull();
      expect(parseTimeString('3 decades ago')).toBeNull();
    });

    it('should return null for negative numbers', () => {
      expect(parseTimeString('-1 days ago')).toBeNull();
      expect(parseTimeString('-5 hours ago')).toBeNull();
    });

    it('should return null for malformed relative strings', () => {
      expect(parseTimeString('5 days')).toBeNull();
      expect(parseTimeString('ago 5 days')).toBeNull();
      expect(parseTimeString('days 5 ago')).toBeNull();
    });

    it('should return null for invalid ISO dates', () => {
      expect(parseTimeString('2024-13-01')).toBeNull();
      // Note: JavaScript Date constructor is lenient and rolls over invalid dates
      // '2024-02-30' becomes '2024-03-01', so we test truly invalid formats instead
      expect(parseTimeString('not-a-date-format')).toBeNull();
      expect(parseTimeString('2024-99-99')).toBeNull();
    });

    it('should return null for keywords with extra text', () => {
      expect(parseTimeString('now please')).toBeNull();
      expect(parseTimeString('today morning')).toBeNull();
      expect(parseTimeString('yesterday evening')).toBeNull();
    });
  });

  describe('boundary and special cases', () => {
    it('should handle month boundaries correctly', () => {
      vi.useRealTimers();
      vi.useFakeTimers({ now: new Date('2024-03-31T12:00:00.000Z').getTime() });
      const result = parseTimeString('1 month ago');
      const expected = new Date('2024-03-31T12:00:00.000Z');
      expected.setMonth(expected.getMonth() - 1);
      expect(result).toBe(expected.getTime());
    });

    it('should handle year boundaries correctly', () => {
      vi.useRealTimers();
      vi.useFakeTimers({ now: new Date('2024-01-15T12:00:00.000Z').getTime() });
      const result = parseTimeString('1 month ago');
      const expected = new Date('2023-12-15T12:00:00.000Z').getTime();
      expect(result).toBe(expected);
    });

    it('should handle DST transitions gracefully', () => {
      vi.useRealTimers();
      vi.useFakeTimers({ now: new Date('2024-03-10T12:00:00.000Z').getTime() });
      const result = parseTimeString('1 day ago');
      expect(result).not.toBeNull();
      expect(typeof result).toBe('number');
    });

    it('should handle very large time values', () => {
      const result = parseTimeString('1000 days ago');
      expect(result).not.toBeNull();
      expect(result).toBeLessThan(FIXED_TIME);
    });

    it('should preserve millisecond precision for ISO strings', () => {
      const isoString = '2024-01-15T10:30:00.123Z';
      const expected = new Date(isoString).getTime();
      expect(parseTimeString(isoString)).toBe(expected);
    });
  });
});
