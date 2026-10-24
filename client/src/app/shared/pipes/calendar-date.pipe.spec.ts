import { CalendarDatePipe } from './calendar-date.pipe';

describe('CalendarDatePipe', () => {
  let pipe: CalendarDatePipe;

  beforeEach(() => {
    pipe = new CalendarDatePipe('en-US');
  });

  it('formats the zone-less date of the API as a short date', () => {
    expect(pipe.transform('2025-03-14T00:00:00')).toBe('3/14/2025');
  });

  it('formats a plain yyyy-MM-dd value', () => {
    expect(pipe.transform('2025-12-01')).toBe('12/1/2025');
  });

  it('never shifts the day, whatever the time zone', () => {
    expect(pipe.transform('2025-01-01T00:00:00')).toBe('1/1/2025');
    expect(pipe.transform('2025-12-31T00:00:00')).toBe('12/31/2025');
    expect(pipe.transform('2024-02-29T00:00:00')).toBe('2/29/2024');
  });

  it('accepts another format string', () => {
    expect(pipe.transform('2025-03-14T00:00:00', 'mediumDate')).toBe('Mar 14, 2025');
    expect(pipe.transform('2025-03-14', 'yyyy-MM-dd')).toBe('2025-03-14');
  });

  it('returns an empty string for missing or invalid values', () => {
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform(undefined)).toBe('');
    expect(pipe.transform('')).toBe('');
    expect(pipe.transform('not a date')).toBe('');
    expect(pipe.transform('2025-02-30')).toBe('');
  });

  it('formats a Date by its local calendar day', () => {
    expect(pipe.transform(new Date(2025, 5, 9, 23, 59))).toBe('6/9/2025');
  });
});
