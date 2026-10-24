import { Directive, ElementRef, Input, AfterViewChecked, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ControlValueAccessor, ValidationErrors, Validator } from '@angular/forms';
import { Observable, of, Subject } from 'rxjs';
import { catchError, debounceTime, map, switchMap, takeUntil } from 'rxjs/operators';

interface SearchOutcome<T> {
  items: T[];
  failed: boolean;
}

let nextPickerId = 0;

/**
 * Shared behaviour of the member and provider typeahead pickers: a ControlValueAccessor whose value is the id of the
 * chosen record (number | null). It searches after 2 characters with a 250 ms debounce, supports the keyboard
 * (arrow keys, Enter, Escape) and shows the chosen record as a removable chip. Follows the ARIA combobox pattern.
 * It is also a Validator: text that was typed but never turned into a selection makes the control invalid, so a form
 * cannot save without the record the user thinks they picked.
 */
@Directive()
export abstract class EntityPickerBase<T> implements ControlValueAccessor, Validator, OnInit, OnDestroy, AfterViewChecked {
  static readonly minChars = 2;
  static readonly debounceMs = 250;

  /** id of the text input (or of the remove button while a record is chosen), so a `<label for>` can point at it. */
  @Input() inputId = '';
  @Input() placeholder = 'Type at least 2 characters to search';
  /** Text shown for a preset id: edit forms know the name from the record they loaded. */
  @Input() initialLabel: string | null = null;
  /** Red border; the parent form drives it from its control state. */
  @Input() invalid = false;
  @Input() describedBy: string | null = null;

  term = '';
  results: T[] = [];
  isOpen = false;
  isLoading = false;
  hasSearched = false;
  searchFailed = false;
  activeIndex = -1;
  isDisabled = false;
  selectedId: number | null = null;

  readonly listboxId = `entity-picker-list-${++nextPickerId}`;

  protected abstract readonly entityName: string;

  private selected: T | null = null;
  private focusRequested = false;
  private scrollRequested = false;
  private readonly term$ = new Subject<string>();
  private readonly destroy$ = new Subject<void>();
  private onChange: (value: number | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;
  private onValidatorChange: () => void = () => undefined;

  @ViewChild('searchInput')
  set searchInputRef(ref: ElementRef<HTMLInputElement> | undefined) {
    if (ref && this.focusRequested) {
      this.focusRequested = false;
      ref.nativeElement.focus();
    }
  }

  @ViewChild('listbox') private listboxRef?: ElementRef<HTMLElement>;

  protected abstract search(term: string): Observable<T[]>;
  protected abstract idOf(item: T): number;
  /** Primary text of a record: the option text and the chip text. */
  abstract labelOf(item: T): string;
  /** Secondary text of an option. */
  abstract detailOf(item: T): string;
  abstract readonly icon: string;

  ngOnInit(): void {
    this.term$
      .pipe(
        debounceTime(EntityPickerBase.debounceMs),
        switchMap(term => this.runSearch(term)),
        takeUntil(this.destroy$)
      )
      .subscribe(outcome => this.showResults(outcome));
  }

  ngAfterViewChecked(): void {
    if (this.scrollRequested) {
      this.scrollRequested = false;
      this.listboxRef?.nativeElement
        .querySelector<HTMLElement>('[aria-selected="true"]')
        ?.scrollIntoView?.({ block: 'nearest' });
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get displayLabel(): string {
    if (this.selected) {
      return this.labelOf(this.selected);
    }
    return this.initialLabel ?? `${this.entityName} #${this.selectedId}`;
  }

  get activeOptionId(): string | null {
    return this.isOpen && this.activeIndex >= 0 ? this.optionId(this.activeIndex) : null;
  }

  get statusMessage(): string {
    if (this.isLoading) {
      return 'Searching...';
    }
    if (!this.hasSearched) {
      return '';
    }
    if (this.searchFailed) {
      return `The ${this.entityName.toLowerCase()} search failed. Try again.`;
    }
    if (this.results.length === 0) {
      return 'No matches found.';
    }
    const count = this.results.length;
    return `${count} ${count === 1 ? 'result' : 'results'} available. Use the up and down arrow keys to review them.`;
  }

  optionId(index: number): string {
    return `${this.listboxId}-option-${index}`;
  }

  onInput(value: string): void {
    this.term = value;
    const trimmed = value.trim();
    if (trimmed.length < EntityPickerBase.minChars) {
      this.resetResults();
    } else {
      this.isLoading = true;
    }
    this.term$.next(trimmed);
    this.onValidatorChange();
  }

  onKeydown(event: KeyboardEvent): void {
    const count = this.results.length;
    switch (event.key) {
      case 'ArrowDown':
        if (count > 0) {
          event.preventDefault();
          this.moveActive(this.isOpen ? (this.activeIndex + 1) % count : Math.max(this.activeIndex, 0));
        }
        break;
      case 'ArrowUp':
        if (count > 0) {
          event.preventDefault();
          this.moveActive(this.isOpen ? (this.activeIndex - 1 + count) % count : count - 1);
        }
        break;
      case 'Enter':
        if (this.isOpen) {
          event.preventDefault();
          if (this.activeIndex >= 0 && this.activeIndex < count) {
            this.select(this.results[this.activeIndex]);
          }
        }
        break;
      case 'Escape':
        if (this.isOpen) {
          event.preventDefault();
          event.stopPropagation();
          this.isOpen = false;
        }
        break;
      case 'Tab':
        this.isOpen = false;
        break;
      default:
        break;
    }
  }

  onBlur(): void {
    this.isOpen = false;
    this.onTouched();
  }

  select(item: T): void {
    this.selected = item;
    this.selectedId = this.idOf(item);
    this.term = '';
    this.resetResults();
    this.onChange(this.selectedId);
    this.onTouched();
  }

  clear(): void {
    if (this.isDisabled) {
      return;
    }
    this.selected = null;
    this.selectedId = null;
    this.term = '';
    this.resetResults();
    this.focusRequested = true;
    this.onChange(null);
    this.onTouched();
  }

  writeValue(value: number | null | undefined): void {
    const id = value ?? null;
    // A reset to "nothing" must also drop text that was typed but never picked.
    if (id === this.selectedId && (id !== null || this.term === '')) {
      return;
    }
    this.selectedId = id;
    this.selected = null;
    this.term = '';
    this.resetResults();
  }

  registerOnChange(fn: (value: number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  validate(): ValidationErrors | null {
    return this.selectedId === null && this.term.trim().length > 0
      ? { pendingText: { message: `Pick a ${this.entityName.toLowerCase()} from the list or clear the text.` } }
      : null;
  }

  registerOnValidatorChange(fn: () => void): void {
    this.onValidatorChange = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isDisabled = isDisabled;
  }

  private runSearch(term: string): Observable<SearchOutcome<T> | null> {
    if (term.length < EntityPickerBase.minChars) {
      return of(null);
    }
    return this.search(term).pipe(
      map(items => ({ items, failed: false })),
      catchError(() => of({ items: [] as T[], failed: true }))
    );
  }

  private showResults(outcome: SearchOutcome<T> | null): void {
    // The user may have cleared the text or picked a record while the request was running.
    if (!outcome || this.term.trim().length < EntityPickerBase.minChars || this.selectedId !== null) {
      this.isLoading = false;
      return;
    }
    this.results = outcome.items;
    this.searchFailed = outcome.failed;
    this.hasSearched = true;
    this.isLoading = false;
    this.isOpen = true;
    this.activeIndex = outcome.items.length > 0 ? 0 : -1;
  }

  private moveActive(index: number): void {
    this.isOpen = true;
    this.activeIndex = index;
    this.scrollRequested = true;
  }

  private resetResults(): void {
    this.results = [];
    this.isOpen = false;
    this.isLoading = false;
    this.hasSearched = false;
    this.searchFailed = false;
    this.activeIndex = -1;
  }
}
