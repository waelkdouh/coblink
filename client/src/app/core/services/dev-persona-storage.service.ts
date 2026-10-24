import { Injectable } from '@angular/core';

/** Reads and writes the development persona (`coblink.devUser`) that the DevUserInterceptor sends as X-CobLink-User. */
@Injectable({ providedIn: 'root' })
export class DevPersonaStorage {
  static readonly key = 'coblink.devUser';

  get(): string | null {
    try {
      const value = localStorage.getItem(DevPersonaStorage.key);
      return value && value.trim() ? value : null;
    } catch {
      return null;
    }
  }

  set(userName: string): void {
    try {
      localStorage.setItem(DevPersonaStorage.key, userName);
    } catch {
      // Storage can be unavailable (private mode, policy); the default user is used instead.
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(DevPersonaStorage.key);
    } catch {
      // Nothing to clean up when storage is unavailable.
    }
  }
}
