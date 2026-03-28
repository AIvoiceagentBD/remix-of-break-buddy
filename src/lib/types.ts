export type BreakType = 'smoke' | 'washroom' | 'short' | 'lunch' | 'prayer';

export const BREAK_LABELS: Record<BreakType, string> = {
  smoke: 'Smoke Break',
  washroom: 'Washroom Break',
  short: 'Short Break',
  lunch: 'Lunch Break',
  prayer: 'Prayer Break',
};

export const BREAK_ICONS: Record<BreakType, string> = {
  smoke: '🚬',
  washroom: '🚻',
  short: '☕',
  lunch: '🍽️',
  prayer: '🕌',
};

export const DAILY_LIMIT_MINUTES = 60;
