/**
 * Get today's date string in EST/ET timezone (America/New_York).
 * Returns YYYY-MM-DD format.
 */
export function getTodayEST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}
