/*
 * Calendar dates (due date, notice date, date of service, recovery date, date of birth) have no time zone:
 * the API sends `2025-03-14T00:00:00` and expects `yyyy-MM-dd`. They are therefore never passed through
 * `new Date(string)`, which would read a date-only string as UTC and can show the previous day.
 */

import { formatDate } from '@angular/common';

import { APP_LOCALE } from '../../core/app-locale';

const DATE_PARTS = /^(\d{4,6})-(\d{2})-(\d{2})/;

/** Angular's `shortDate` ends in a two-digit year (3/14/25); dates of birth and old claims need the century. */
export const CALENDAR_DATE_FORMAT = 'M/d/yyyy';

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}

/** Local-midnight Date built from the year, month and day of `2025-03-14` / `2025-03-14T00:00:00`; null when invalid. */
export function parseCalendarDate(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const match = DATE_PARTS.exec(value);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  const isRealDate = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  return isRealDate ? date : null;
}

/** `yyyy-MM-dd` from the local year, month and day of a Date. */
export function toIsoDate(date: Date): string {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Today in the user's time zone as `yyyy-MM-dd`. */
export function todayIso(): string {
  return toIsoDate(new Date());
}

/** `yyyy-MM-dd` shifted by a number of days (calendar arithmetic, no time zone involved). */
export function addDaysIso(isoDate: string, days: number): string {
  const date = parseCalendarDate(isoDate);
  if (!date) {
    return isoDate;
  }
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

/** Value for `<input type="date">`: `yyyy-MM-dd`, or an empty string when there is no (valid) date. */
export function toDateInputValue(value: string | null | undefined): string {
  const date = parseCalendarDate(value);
  return date ? toIsoDate(date) : '';
}

/** `3/14/2025` style text of a calendar date, without any time zone shift; empty when there is no valid date. */
export function formatShortDate(value: string | Date | null | undefined, format = CALENDAR_DATE_FORMAT): string {
  const date = parseCalendarDate(value);
  return date ? formatDate(date, format, APP_LOCALE) : '';
}

/** Request value for a calendar date: `yyyy-MM-dd`, or null when empty. */
export function toDatePayload(value: string | null | undefined): string | null {
  const text = toDateInputValue(value);
  return text === '' ? null : text;
}

/** Whole days from one calendar date to another (positive when `to` is later). */
export function daysBetween(from: string, to: string): number | null {
  const start = parseCalendarDate(from);
  const end = parseCalendarDate(to);
  if (!start || !end) {
    return null;
  }
  const utcStart = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const utcEnd = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((utcEnd - utcStart) / 86_400_000);
}
