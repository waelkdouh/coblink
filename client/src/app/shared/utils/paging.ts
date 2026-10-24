/** Page sizes offered by the pager (the API accepts 1-100). */
export const PAGE_SIZES: readonly number[] = [10, 20, 50, 100];

export const DEFAULT_PAGE_SIZE = 20;

export interface SortState<K extends string = string> {
  sortBy: K;
  sortDescending: boolean;
}

/** Clicking the active column flips the direction, clicking another column sorts it ascending. */
export function toggleSort<K extends string>(current: SortState<K>, key: K): SortState<K> {
  return { sortBy: key, sortDescending: current.sortBy === key ? !current.sortDescending : false };
}
