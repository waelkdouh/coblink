import {
  addDaysIso,
  daysBetween,
  formatShortDate,
  parseCalendarDate,
  toDateInputValue,
  toDatePayload,
  toIsoDate,
  todayIso
} from './date-utils';

describe('date-utils', () => {
  describe('parseCalendarDate', () => {
    it('builds a local midnight date from the date parts of an API value', () => {
      const date = parseCalendarDate('2025-03-14T00:00:00');

      expect(date).not.toBeNull();
      expect(date?.getFullYear()).toBe(2025);
      expect(date?.getMonth()).toBe(2);
      expect(date?.getDate()).toBe(14);
      expect(date?.getHours()).toBe(0);
    });

    it('returns null for empty, malformed and impossible dates', () => {
      expect(parseCalendarDate(null)).toBeNull();
      expect(parseCalendarDate(undefined)).toBeNull();
      expect(parseCalendarDate('')).toBeNull();
      expect(parseCalendarDate('14/03/2025')).toBeNull();
      expect(parseCalendarDate('2025-13-01')).toBeNull();
      expect(parseCalendarDate('2023-02-29')).toBeNull();
      expect(parseCalendarDate(new Date(NaN))).toBeNull();
    });

    it('drops the time of a Date', () => {
      const date = parseCalendarDate(new Date(2025, 0, 31, 18, 45));

      expect(date && toIsoDate(date)).toBe('2025-01-31');
      expect(date?.getHours()).toBe(0);
    });
  });

  describe('toIsoDate and todayIso', () => {
    it('pads month and day', () => {
      expect(toIsoDate(new Date(2025, 0, 5))).toBe('2025-01-05');
    });

    it('todayIso is the local date of now', () => {
      expect(todayIso()).toBe(toIsoDate(new Date()));
      expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('addDaysIso', () => {
    it('does calendar arithmetic across month and year ends', () => {
      expect(addDaysIso('2025-03-14', 30)).toBe('2025-04-13');
      expect(addDaysIso('2025-12-31', 1)).toBe('2026-01-01');
      expect(addDaysIso('2024-03-01', -1)).toBe('2024-02-29');
    });

    it('is not fooled by a daylight saving change', () => {
      expect(addDaysIso('2025-03-08', 1)).toBe('2025-03-09');
      expect(addDaysIso('2025-03-09', 1)).toBe('2025-03-10');
      expect(addDaysIso('2025-11-01', 2)).toBe('2025-11-03');
    });

    it('returns an unparsable value unchanged', () => {
      expect(addDaysIso('soon', 3)).toBe('soon');
    });
  });

  describe('toDateInputValue and toDatePayload', () => {
    it('turns the API format into the yyyy-MM-dd of an input[type=date]', () => {
      expect(toDateInputValue('2025-03-14T00:00:00')).toBe('2025-03-14');
      expect(toDateInputValue('2025-03-14')).toBe('2025-03-14');
    });

    it('is empty without a valid date', () => {
      expect(toDateInputValue(null)).toBe('');
      expect(toDateInputValue('garbage')).toBe('');
    });

    it('sends yyyy-MM-dd or null', () => {
      expect(toDatePayload('2025-03-14T00:00:00')).toBe('2025-03-14');
      expect(toDatePayload('')).toBeNull();
      expect(toDatePayload(null)).toBeNull();
    });
  });

  describe('formatShortDate', () => {
    it('uses the en-US short date', () => {
      expect(formatShortDate('2025-03-14T00:00:00')).toBe('3/14/2025');
    });

    it('supports a different format and tolerates missing values', () => {
      expect(formatShortDate('2025-03-14', 'MMM d, y')).toBe('Mar 14, 2025');
      expect(formatShortDate(null)).toBe('');
    });
  });

  describe('daysBetween', () => {
    it('counts whole calendar days', () => {
      expect(daysBetween('2025-03-14', '2025-04-13')).toBe(30);
      expect(daysBetween('2025-03-14', '2025-03-14')).toBe(0);
      expect(daysBetween('2025-03-14', '2025-03-10')).toBe(-4);
    });

    it('counts a daylight saving day as one day', () => {
      expect(daysBetween('2025-03-08', '2025-03-10')).toBe(2);
    });

    it('is null when a date is invalid', () => {
      expect(daysBetween('x', '2025-03-14')).toBeNull();
    });
  });
});
