/**
 * Parses a time string into a Unix timestamp (ms).
 * Supports ISO 8601 and relative time strings like "now", "today", "yesterday", "X hours/days/minutes ago".
 * 
 * @param timeStr - The time string to parse
 * @returns Unix timestamp in milliseconds, or null if the string cannot be parsed
 */
export function parseTimeString(timeStr: string): number | null {
  const trimmed = timeStr.trim().toLowerCase();

  // Handle "now"
  if (trimmed === 'now') {
    return Date.now();
  }

  // Handle "today" (start of today)
  if (trimmed === 'today') {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now.getTime();
  }

  // Handle "yesterday" (start of yesterday)
  if (trimmed === 'yesterday') {
    const now = new Date();
    now.setDate(now.getDate() - 1);
    now.setHours(0, 0, 0, 0);
    return now.getTime();
  }

  // Handle relative time: "X unit(s) ago"
  const relativeMatch = trimmed.match(/^(\d+)\s*(minute|hour|day|week|month)s?\s*ago$/);
  if (relativeMatch) {
    const amount = parseInt(relativeMatch[1], 10);
    const unit = relativeMatch[2];
    const now = new Date();

    switch (unit) {
      case 'minute':
        now.setMinutes(now.getMinutes() - amount);
        break;
      case 'hour':
        now.setHours(now.getHours() - amount);
        break;
      case 'day':
        now.setDate(now.getDate() - amount);
        break;
      case 'week':
        now.setDate(now.getDate() - amount * 7);
        break;
      case 'month':
        now.setMonth(now.getMonth() - amount);
        break;
    }
    return now.getTime();
  }

  // Try ISO 8601 parsing
  const isoDate = new Date(timeStr);
  if (!isNaN(isoDate.getTime())) {
    return isoDate.getTime();
  }

  // Could not parse
  return null;
}
