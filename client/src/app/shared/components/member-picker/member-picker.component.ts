import { Component, forwardRef } from '@angular/core';
import { NG_VALIDATORS, NG_VALUE_ACCESSOR } from '@angular/forms';
import { Observable } from 'rxjs';

import { LookupService } from '../../../core/services/lookup.service';
import { Member } from '../../../models/models';
import { formatShortDate } from '../../utils/date-utils';
import { EntityPickerBase } from '../entity-picker/entity-picker.base';

/** Typeahead for members. The form control value is the memberId (number | null). */
@Component({
  selector: 'app-member-picker',
  templateUrl: '../entity-picker/entity-picker.component.html',
  styleUrls: ['../entity-picker/entity-picker.component.scss'],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => MemberPickerComponent), multi: true },
    { provide: NG_VALIDATORS, useExisting: forwardRef(() => MemberPickerComponent), multi: true }
  ]
})
export class MemberPickerComponent extends EntityPickerBase<Member> {
  readonly icon = 'bi-person';
  protected readonly entityName = 'Member';

  constructor(private readonly lookups: LookupService) {
    super();
  }

  labelOf(member: Member): string {
    return `${member.fullName} (${member.memberNumber})`;
  }

  detailOf(member: Member): string {
    return member.dateOfBirth ? `Date of birth ${formatShortDate(member.dateOfBirth)}` : '';
  }

  protected search(term: string): Observable<Member[]> {
    return this.lookups.searchMembers(term);
  }

  protected idOf(member: Member): number {
    return member.memberId;
  }
}
