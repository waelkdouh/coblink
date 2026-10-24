import { Component, forwardRef } from '@angular/core';
import { NG_VALIDATORS, NG_VALUE_ACCESSOR } from '@angular/forms';
import { Observable } from 'rxjs';

import { LookupService } from '../../../core/services/lookup.service';
import { Provider } from '../../../models/models';
import { EntityPickerBase } from '../entity-picker/entity-picker.base';

/** Typeahead for providers. The form control value is the providerId (number | null). */
@Component({
  selector: 'app-provider-picker',
  templateUrl: '../entity-picker/entity-picker.component.html',
  styleUrls: ['../entity-picker/entity-picker.component.scss'],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => ProviderPickerComponent), multi: true },
    { provide: NG_VALIDATORS, useExisting: forwardRef(() => ProviderPickerComponent), multi: true }
  ]
})
export class ProviderPickerComponent extends EntityPickerBase<Provider> {
  readonly icon = 'bi-hospital';
  protected readonly entityName = 'Provider';

  constructor(private readonly lookups: LookupService) {
    super();
  }

  labelOf(provider: Provider): string {
    return `${provider.name} (${provider.providerNumber})`;
  }

  detailOf(provider: Provider): string {
    const place = [provider.city, provider.state].filter(part => !!part).join(', ');
    return [provider.npi ? `NPI ${provider.npi}` : '', place].filter(part => part !== '').join(' · ');
  }

  protected search(term: string): Observable<Provider[]> {
    return this.lookups.searchProviders(term);
  }

  protected idOf(provider: Provider): number {
    return provider.providerId;
  }
}
