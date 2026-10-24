import { NgZone } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { ServiceResponse } from '../models/api';

/** Navigates the way the application does (inside the Angular zone), so the router does not warn about it. */
export function navigateInZone(url: string): Promise<boolean> {
  return TestBed.inject(NgZone).run(() => TestBed.inject(Router).navigateByUrl(url));
}

/** A successful response envelope, as the API wraps every payload. */
export function envelope<T>(data: T): ServiceResponse<T> {
  return { success: true, message: null, errorCode: null, errors: [], data };
}

/** A failed envelope: the API answers HTTP 200 with success = false for validation and business errors. */
export function failedEnvelope(
  errorCode: string,
  message: string,
  errors: { field: string | null; message: string }[] = []
): ServiceResponse<null> {
  return { success: false, message, errorCode, errors, data: null };
}

export function query<T extends HTMLElement = HTMLElement>(fixture: ComponentFixture<unknown>, selector: string): T | null {
  return (fixture.nativeElement as HTMLElement).querySelector<T>(selector);
}

export function queryAll<T extends HTMLElement = HTMLElement>(fixture: ComponentFixture<unknown>, selector: string): T[] {
  return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<T>(selector));
}

/** Text of the first match with collapsed white space, or an empty string. */
export function textOf(fixture: ComponentFixture<unknown>, selector: string): string {
  return (query(fixture, selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

export function pageText(fixture: ComponentFixture<unknown>): string {
  return ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** Clicks the first match and runs change detection; fails loudly when the element does not exist. */
export function click(fixture: ComponentFixture<unknown>, selector: string): void {
  const element = query(fixture, selector);
  if (!element) {
    throw new Error(`Element not found: ${selector}`);
  }
  element.click();
  fixture.detectChanges();
}

/** Types into an input/textarea (or picks an option of a select) the way a user does, then runs change detection. */
export function setValue(fixture: ComponentFixture<unknown>, selector: string, value: string): void {
  const element = query<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(fixture, selector);
  if (!element) {
    throw new Error(`Element not found: ${selector}`);
  }
  element.value = value;
  element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input'));
  fixture.detectChanges();
}

export function setChecked(fixture: ComponentFixture<unknown>, selector: string, checked: boolean): void {
  const element = query<HTMLInputElement>(fixture, selector);
  if (!element) {
    throw new Error(`Element not found: ${selector}`);
  }
  element.checked = checked;
  element.dispatchEvent(new Event('change'));
  fixture.detectChanges();
}

/** Picks the option of a select by its visible text (the option values of `ngValue` bindings are internal ids). */
export function selectOption(fixture: ComponentFixture<unknown>, selector: string, label: string): void {
  const select = query<HTMLSelectElement>(fixture, selector);
  if (!select) {
    throw new Error(`Select not found: ${selector}`);
  }
  const option = Array.from(select.options).find(candidate => (candidate.textContent ?? '').trim() === label);
  if (!option) {
    throw new Error(`Option "${label}" not found in ${selector}`);
  }
  select.value = option.value;
  select.dispatchEvent(new Event('change'));
  fixture.detectChanges();
}

/** Submits a form element (the ngSubmit handler runs, no native navigation happens). */
export function submit(fixture: ComponentFixture<unknown>, selector: string): void {
  const form = query<HTMLFormElement>(fixture, selector);
  if (!form) {
    throw new Error(`Form not found: ${selector}`);
  }
  form.dispatchEvent(new Event('submit'));
  fixture.detectChanges();
}

export function keydown(target: HTMLElement, key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}
