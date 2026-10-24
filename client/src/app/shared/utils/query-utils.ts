import { ParamMap } from '@angular/router';

import { toDateInputValue } from './date-utils';

/*
 * Helpers that read typed values from a query string. The list screens keep their whole state (filters, page,
 * sort) in the URL, so every value must survive hand-edited or stale links: anything invalid falls back.
 */

/** All numeric values of a TypeScript numeric enum (the reverse-mapping entries are skipped). */
export function numericEnumValues<T extends number>(enumObject: object): T[] {
  return (Object.values(enumObject) as unknown[]).filter((value): value is T => typeof value === 'number');
}

export function readText(params: ParamMap, key: string): string {
  return (params.get(key) ?? '').trim();
}

export function readInt(params: ParamMap, key: string): number | null {
  const raw = (params.get(key) ?? '').trim();
  return /^-?\d+$/.test(raw) ? Number(raw) : null;
}

export function readPositiveInt(params: ParamMap, key: string, fallback: number): number {
  const value = readInt(params, key);
  return value !== null && value > 0 ? value : fallback;
}

export function readDecimal(params: ParamMap, key: string): number | null {
  const raw = (params.get(key) ?? '').trim();
  if (raw === '') {
    return null;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function readBoolean(params: ParamMap, key: string, fallback: boolean): boolean {
  const raw = (params.get(key) ?? '').trim().toLowerCase();
  if (raw === 'true' || raw === '1') {
    return true;
  }
  if (raw === 'false' || raw === '0') {
    return false;
  }
  return fallback;
}

export function readEnum<T extends number>(params: ParamMap, key: string, allowed: readonly T[]): T | null {
  const value = readInt(params, key);
  return value !== null && (allowed as readonly number[]).includes(value) ? (value as T) : null;
}

/** A calendar date as `yyyy-MM-dd`, or an empty string when absent or not a real date. */
export function readDate(params: ParamMap, key: string): string {
  return toDateInputValue(params.get(key));
}

export function readChoice<T extends string>(params: ParamMap, key: string, allowed: readonly T[]): T | null {
  const raw = (params.get(key) ?? '').trim();
  return (allowed as readonly string[]).includes(raw) ? (raw as T) : null;
}
