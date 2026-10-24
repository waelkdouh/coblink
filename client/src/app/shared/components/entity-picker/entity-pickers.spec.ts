import { Component } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { Subject, of, throwError } from 'rxjs';

import { LookupService } from '../../../core/services/lookup.service';
import { Member, Provider } from '../../../models/models';
import { TEST_LOOKUPS, buildMember, buildProvider } from '../../../testing/test-data';
import { createLookupServiceSpy } from '../../../testing/test-doubles';
import { keydown, query, queryAll, textOf } from '../../../testing/test-helpers';
import { SharedModule } from '../../shared.module';

@Component({
  template: `
    <label for="member-input">Member</label>
    <app-member-picker inputId="member-input" [formControl]="member" [initialLabel]="initialLabel" [invalid]="memberInvalid"></app-member-picker>
    <label for="provider-input">Provider</label>
    <app-provider-picker inputId="provider-input" [formControl]="provider"></app-provider-picker>
  `
})
class PickerHostComponent {
  member = new FormControl<number | null>(null);
  provider = new FormControl<number | null>(null);
  initialLabel: string | null = null;
  memberInvalid = false;
}

describe('typeahead pickers', () => {
  let fixture: ComponentFixture<PickerHostComponent>;
  let host: PickerHostComponent;
  let lookups: jasmine.SpyObj<LookupService>;

  const maria = buildMember();
  const marcus = buildMember({ memberId: 12, memberNumber: 'M-0012', firstName: 'Marcus', fullName: 'Marcus Lee', dateOfBirth: null });

  beforeEach(() => {
    lookups = createLookupServiceSpy(TEST_LOOKUPS);
    lookups.searchMembers.and.returnValue(of([maria, marcus]));
    lookups.searchProviders.and.returnValue(of([buildProvider(), buildProvider({ providerId: 22, providerNumber: 'P-0022', name: 'Hilltop Hospital', npi: null, city: null, state: null })]));
    TestBed.configureTestingModule({
      imports: [SharedModule],
      declarations: [PickerHostComponent],
      providers: [{ provide: LookupService, useValue: lookups }]
    });
    fixture = TestBed.createComponent(PickerHostComponent);
    host = fixture.componentInstance;
  });

  function render(): void {
    fixture.detectChanges();
  }

  function memberInput(): HTMLInputElement {
    return query<HTMLInputElement>(fixture, 'app-member-picker input[role="combobox"]') as HTMLInputElement;
  }

  function providerInput(): HTMLInputElement {
    return query<HTMLInputElement>(fixture, 'app-provider-picker input[role="combobox"]') as HTMLInputElement;
  }

  function type(input: HTMLInputElement, text: string): void {
    input.value = text;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function options(picker: 'member' | 'provider'): HTMLElement[] {
    return queryAll(fixture, `app-${picker}-picker [role="option"]`);
  }

  describe('MemberPickerComponent', () => {
    it('is a combobox wired to its label', fakeAsync(() => {
      render();

      expect(memberInput().id).toBe('member-input');
      expect(memberInput().getAttribute('aria-autocomplete')).toBe('list');
      expect(memberInput().getAttribute('aria-expanded')).toBe('false');
      expect(query(fixture, 'label[for="member-input"]')).not.toBeNull();
      fixture.destroy();
    }));

    it('tells assistive technology when the form marks it invalid', fakeAsync(() => {
      render();
      expect(memberInput().hasAttribute('aria-invalid')).toBeFalse();

      host.memberInvalid = true;
      fixture.detectChanges();

      expect(memberInput().getAttribute('aria-invalid')).toBe('true');
      expect(memberInput().classList).toContain('is-invalid');
      fixture.destroy();
    }));

    it('does not search for fewer than two characters', fakeAsync(() => {
      render();

      type(memberInput(), 'm');
      tick(1000);
      fixture.detectChanges();

      expect(lookups.searchMembers).not.toHaveBeenCalled();
      expect(options('member').length).toBe(0);
      fixture.destroy();
    }));

    it('waits 250 ms after the last keystroke and then searches once with the final text', fakeAsync(() => {
      render();

      type(memberInput(), 'lo');
      tick(100);
      type(memberInput(), 'lop');
      tick(249);
      expect(lookups.searchMembers).not.toHaveBeenCalled();

      tick(1);
      fixture.detectChanges();

      expect(lookups.searchMembers).toHaveBeenCalledTimes(1);
      expect(lookups.searchMembers).toHaveBeenCalledWith('lop');
      fixture.destroy();
    }));

    it('trims the term before searching', fakeAsync(() => {
      render();

      type(memberInput(), '  lo  ');
      tick(250);

      expect(lookups.searchMembers).toHaveBeenCalledWith('lo');
      fixture.destroy();
    }));

    it('lists the matches with name, member number and date of birth', fakeAsync(() => {
      render();

      type(memberInput(), 'ma');
      tick(250);
      fixture.detectChanges();

      const items = options('member');
      expect(items.length).toBe(2);
      expect(items[0].textContent).toContain('Maria Lopez (M-0011)');
      expect(items[0].textContent).toContain('Date of birth 2/29/1980');
      expect(items[1].textContent).not.toContain('Date of birth');
      expect(memberInput().getAttribute('aria-expanded')).toBe('true');
      expect(query(fixture, 'app-member-picker [role="listbox"]')).not.toBeNull();
      fixture.destroy();
    }));

    it('highlights the first match and exposes it as the active descendant', fakeAsync(() => {
      render();

      type(memberInput(), 'ma');
      tick(250);
      fixture.detectChanges();

      const first = options('member')[0];
      expect(first.getAttribute('aria-selected')).toBe('true');
      expect(memberInput().getAttribute('aria-activedescendant')).toBe(first.id);
      fixture.destroy();
    }));

    it('selects a match with a click: the form value is the member id and a chip appears', fakeAsync(() => {
      render();
      type(memberInput(), 'ma');
      tick(250);
      fixture.detectChanges();

      options('member')[1].click();
      fixture.detectChanges();

      expect(host.member.value).toBe(12);
      expect(textOf(fixture, 'app-member-picker [data-picker="selected"]')).toBe('Marcus Lee (M-0012)');
      expect(query(fixture, 'app-member-picker input[role="combobox"]')).toBeNull();
      expect(options('member').length).toBe(0);
      fixture.destroy();
    }));

    it('supports the keyboard: arrows move, Enter selects', fakeAsync(() => {
      render();
      type(memberInput(), 'ma');
      tick(250);
      fixture.detectChanges();

      keydown(memberInput(), 'ArrowDown');
      fixture.detectChanges();
      expect(options('member')[1].getAttribute('aria-selected')).toBe('true');

      keydown(memberInput(), 'ArrowDown');
      fixture.detectChanges();
      expect(options('member')[0].getAttribute('aria-selected')).toBe('true');

      keydown(memberInput(), 'ArrowUp');
      fixture.detectChanges();
      expect(options('member')[1].getAttribute('aria-selected')).toBe('true');

      const enter = keydown(memberInput(), 'Enter');
      fixture.detectChanges();

      expect(enter.defaultPrevented).toBeTrue();
      expect(host.member.value).toBe(12);
      fixture.destroy();
    }));

    it('closes the list with Escape and keeps the typed text', fakeAsync(() => {
      render();
      type(memberInput(), 'ma');
      tick(250);
      fixture.detectChanges();

      keydown(memberInput(), 'Escape');
      fixture.detectChanges();

      expect(options('member').length).toBe(0);
      expect(memberInput().value).toBe('ma');
      expect(host.member.value).toBeNull();
      fixture.destroy();
    }));

    it('does not swallow Enter while the list is closed (the form can submit)', fakeAsync(() => {
      render();

      const enter = keydown(memberInput(), 'Enter');

      expect(enter.defaultPrevented).toBeFalse();
      fixture.destroy();
    }));

    it('flags text that was typed but never picked, so a form cannot silently drop it', fakeAsync(() => {
      render();
      expect(host.member.valid).toBeTrue();

      type(memberInput(), 'lop');
      expect(host.member.errors).toEqual({ pendingText: { message: 'Pick a member from the list or clear the text.' } });

      type(memberInput(), '');
      expect(host.member.valid).toBeTrue();
      fixture.destroy();
    }));

    it('is valid again once a match was picked or the chip was removed', fakeAsync(() => {
      render();
      type(memberInput(), 'ma');
      tick(250);
      fixture.detectChanges();
      expect(host.member.hasError('pendingText')).toBeTrue();

      options('member')[0].click();
      fixture.detectChanges();
      expect(host.member.valid).toBeTrue();
      expect(host.member.value).toBe(11);

      (query<HTMLButtonElement>(fixture, 'app-member-picker .btn-close') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(host.member.valid).toBeTrue();
      expect(host.member.value).toBeNull();
      fixture.destroy();
    }));

    it('does not flag the typed text when the form resets the control', fakeAsync(() => {
      render();
      type(memberInput(), 'lop');
      expect(host.member.invalid).toBeTrue();

      host.member.reset();
      fixture.detectChanges();

      expect(host.member.valid).toBeTrue();
      expect(memberInput().value).toBe('');
      fixture.destroy();
    }));

    it('removes the selection with the chip button and returns to the search box', fakeAsync(() => {
      host.member.setValue(11);
      host.initialLabel = 'Maria Lopez (M-0011)';
      render();
      expect(textOf(fixture, 'app-member-picker [data-picker="selected"]')).toBe('Maria Lopez (M-0011)');

      const remove = query<HTMLButtonElement>(fixture, 'app-member-picker .btn-close') as HTMLButtonElement;
      expect(remove.getAttribute('aria-label')).toBe('Remove Maria Lopez (M-0011)');
      remove.click();
      fixture.detectChanges();

      expect(host.member.value).toBeNull();
      expect(memberInput()).not.toBeNull();
      expect(document.activeElement).toBe(memberInput());
      fixture.destroy();
    }));

    it('shows a generic label for a preset id the picker has no name for', fakeAsync(() => {
      host.member.setValue(77);
      render();

      expect(textOf(fixture, 'app-member-picker [data-picker="selected"]')).toBe('Member #77');
      fixture.destroy();
    }));

    it('marks the control as touched on blur', fakeAsync(() => {
      render();
      expect(host.member.touched).toBeFalse();

      memberInput().dispatchEvent(new Event('blur'));

      expect(host.member.touched).toBeTrue();
      fixture.destroy();
    }));

    it('can be disabled through the form control', fakeAsync(() => {
      render();

      host.member.disable();
      fixture.detectChanges();

      expect(memberInput().disabled).toBeTrue();
      fixture.destroy();
    }));

    it('tells the user when nothing matches', fakeAsync(() => {
      lookups.searchMembers.and.returnValue(of([]));
      render();

      type(memberInput(), 'zz');
      tick(250);
      fixture.detectChanges();

      expect(textOf(fixture, 'app-member-picker [role="listbox"]')).toBe('No matches found');
      expect(textOf(fixture, 'app-member-picker [role="status"]')).toBe('No matches found.');
      fixture.destroy();
    }));

    it('reports a failed search instead of breaking, and searches again on the next keystroke', fakeAsync(() => {
      lookups.searchMembers.and.returnValues(throwError(() => new Error('offline')), of([maria]));
      render();

      type(memberInput(), 'ma');
      tick(250);
      fixture.detectChanges();
      expect(textOf(fixture, 'app-member-picker [role="listbox"]')).toBe('The search failed. Try again.');

      type(memberInput(), 'mar');
      tick(250);
      fixture.detectChanges();

      expect(options('member').length).toBe(1);
      fixture.destroy();
    }));

    it('ignores a late answer for text the user has already deleted', fakeAsync(() => {
      const pending = new Subject<Member[]>();
      lookups.searchMembers.and.returnValue(pending);
      render();

      type(memberInput(), 'ma');
      tick(250);
      type(memberInput(), '');
      pending.next([maria]);
      pending.complete();
      fixture.detectChanges();

      expect(options('member').length).toBe(0);
      fixture.destroy();
    }));

    it('only shows the answer to the latest search', fakeAsync(() => {
      const first = new Subject<Member[]>();
      const second = new Subject<Member[]>();
      lookups.searchMembers.and.returnValues(first, second);
      render();

      type(memberInput(), 'ma');
      tick(250);
      type(memberInput(), 'mar');
      tick(250);
      second.next([maria]);
      first.next([maria, marcus]);
      fixture.detectChanges();

      expect(options('member').length).toBe(1);
      fixture.destroy();
    }));

    it('reflects a value written by the form (reset)', fakeAsync(() => {
      render();
      type(memberInput(), 'ma');
      tick(250);
      fixture.detectChanges();
      options('member')[0].click();
      fixture.detectChanges();
      expect(host.member.value).toBe(11);

      host.member.reset();
      fixture.detectChanges();

      expect(query(fixture, 'app-member-picker [data-picker="selected"]')).toBeNull();
      expect(memberInput().value).toBe('');
      fixture.destroy();
    }));
  });

  describe('ProviderPickerComponent', () => {
    it('searches providers with the same debounce and lists name, number, NPI and place', fakeAsync(() => {
      render();

      type(providerInput(), 'ri');
      tick(249);
      expect(lookups.searchProviders).not.toHaveBeenCalled();
      tick(1);
      fixture.detectChanges();

      expect(lookups.searchProviders).toHaveBeenCalledWith('ri');
      const items = options('provider');
      expect(items[0].textContent).toContain('Riverside Clinic (P-0021)');
      expect(items[0].textContent).toContain('NPI 1234567890 · Austin, TX');
      expect(items[1].textContent).toContain('Hilltop Hospital (P-0022)');
      fixture.destroy();
    }));

    it('selects a provider by Enter and exposes the provider id', fakeAsync(() => {
      render();
      type(providerInput(), 'ri');
      tick(250);
      fixture.detectChanges();

      keydown(providerInput(), 'Enter');
      fixture.detectChanges();

      expect(host.provider.value).toBe(21);
      expect(textOf(fixture, 'app-provider-picker [data-picker="selected"]')).toBe('Riverside Clinic (P-0021)');
      expect(host.member.value).toBeNull();
      fixture.destroy();
    }));

    it('has its own listbox ids so two pickers on one page do not clash', fakeAsync(() => {
      render();
      type(memberInput(), 'ma');
      type(providerInput(), 'ri');
      tick(250);
      fixture.detectChanges();

      const ids = [...options('member'), ...options('provider')].map(option => option.id);
      expect(new Set(ids).size).toBe(ids.length);
      fixture.destroy();
    }));

    it('can be cleared again', fakeAsync(() => {
      host.provider.setValue(21);
      render();

      (query<HTMLButtonElement>(fixture, 'app-provider-picker .btn-close') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(host.provider.value).toBeNull();
      expect(textOf(fixture, 'app-provider-picker [role="status"]')).toBe('');
      fixture.destroy();
    }));

    it('flags text that was typed but never picked', fakeAsync(() => {
      render();

      type(providerInput(), 'ri');

      expect(host.provider.errors).toEqual({ pendingText: { message: 'Pick a provider from the list or clear the text.' } });
      expect(host.member.valid).toBeTrue();
      fixture.destroy();
    }));
  });

  it('builds the provider chip label from the provider that was chosen', fakeAsync(() => {
    const provider: Provider = buildProvider();
    lookups.searchProviders.and.returnValue(of([provider]));
    render();

    type(providerInput(), 'ri');
    tick(250);
    fixture.detectChanges();
    options('provider')[0].click();
    fixture.detectChanges();

    expect(textOf(fixture, 'app-provider-picker [data-picker="selected"]')).toBe(`${provider.name} (${provider.providerNumber})`);
    fixture.destroy();
  }));
});
