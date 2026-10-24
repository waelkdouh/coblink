import { LookupService } from '../../core/services/lookup.service';
import { ActivityStatus, RecoveryMethod, TakebackReason, TakebackStatus, UserRole } from '../../models/enums';
import { createLookupServiceSpy } from '../../testing/test-doubles';
import { LookupNamePipe } from './lookup-name.pipe';

describe('LookupNamePipe', () => {
  let lookups: jasmine.SpyObj<LookupService>;
  let pipe: LookupNamePipe;

  beforeEach(() => {
    lookups = createLookupServiceSpy();
    pipe = new LookupNamePipe(lookups);
  });

  it('shows the database name from the cached lookups', () => {
    lookups.getName.and.returnValue('Pending Approval');

    expect(pipe.transform(TakebackStatus.PendingApproval, 'takebackStatuses')).toBe('Pending Approval');
    expect(lookups.getName).toHaveBeenCalledWith('takebackStatuses', TakebackStatus.PendingApproval);
  });

  it('falls back to the enum member name when the lookups are not loaded', () => {
    lookups.getName.and.returnValue(null);

    expect(pipe.transform(TakebackStatus.PendingApproval, 'takebackStatuses')).toBe('PendingApproval');
    expect(pipe.transform(ActivityStatus.InProgress, 'activityStatuses')).toBe('InProgress');
    expect(pipe.transform(RecoveryMethod.Eft, 'recoveryMethods')).toBe('Eft');
    expect(pipe.transform(TakebackReason.OtherInsurancePrimary, 'takebackReasons')).toBe('OtherInsurancePrimary');
    expect(pipe.transform(UserRole.Admin, 'userRoles')).toBe('Admin');
  });

  it('shows the number for a value that no list knows', () => {
    lookups.getName.and.returnValue(null);

    expect(pipe.transform(99, 'activityTypes')).toBe('99');
  });

  it('returns an empty string for null and undefined', () => {
    expect(pipe.transform(null, 'activityTypes')).toBe('');
    expect(pipe.transform(undefined, 'activityTypes')).toBe('');
    expect(lookups.getName).not.toHaveBeenCalled();
  });
});
