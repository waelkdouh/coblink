import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { shareReplay, tap } from 'rxjs/operators';

import { LookupData, LookupItem, LookupListName, Member, Provider } from '../../models/models';
import { ApiService } from '../api/api.service';

/** Reference data (names of the enum values) plus the member and provider typeahead searches. */
@Injectable({ providedIn: 'root' })
export class LookupService {
  static readonly defaultSearchSize = 15;

  private lookups$: Observable<LookupData> | null = null;
  private loaded: LookupData | null = null;

  constructor(private readonly api: ApiService) {}

  get snapshot(): LookupData | null {
    return this.loaded;
  }

  get isLoaded(): boolean {
    return this.loaded !== null;
  }

  /** GET /api/Lookup/GetAll - requested once, then replayed from the cache. */
  getAll(): Observable<LookupData> {
    if (!this.lookups$) {
      this.lookups$ = this.api.get<LookupData>('Lookup/GetAll').pipe(
        tap(data => (this.loaded = data)),
        shareReplay({ bufferSize: 1, refCount: false })
      );
    }
    return this.lookups$;
  }

  /** Items of one list ordered by sortOrder. Empty until getAll() has completed. */
  getItems(list: LookupListName): LookupItem[] {
    const items = this.loaded ? this.loaded[list] : [];
    return [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  }

  /** Display name of an id, or null when the lookups are not loaded or the id is unknown. */
  getName(list: LookupListName, id: number | null | undefined): string | null {
    if (id === null || id === undefined || !this.loaded) {
      return null;
    }
    const item = this.loaded[list].find(candidate => candidate.id === id);
    return item ? item.name : null;
  }

  /** GET /api/Lookup/SearchMembers - the server needs a term of at least two characters. */
  searchMembers(term: string, max: number = LookupService.defaultSearchSize): Observable<Member[]> {
    return this.api.get<Member[]>('Lookup/SearchMembers', { term, max });
  }

  /** GET /api/Lookup/SearchProviders */
  searchProviders(term: string, max: number = LookupService.defaultSearchSize): Observable<Provider[]> {
    return this.api.get<Provider[]>('Lookup/SearchProviders', { term, max });
  }
}
