import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';

import { BlankComponent } from '../../testing/blank.component';
import { navigateInZone } from '../../testing/test-helpers';
import { NavigationHistoryService } from './navigation-history.service';

describe('NavigationHistoryService', () => {
  let service: NavigationHistoryService;
  let router: Router;
  let location: Location;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [BlankComponent],
      imports: [
        RouterTestingModule.withRoutes([
          { path: 'first', component: BlankComponent },
          { path: 'second', component: BlankComponent }
        ])
      ]
    });
    service = TestBed.inject(NavigationHistoryService);
    router = TestBed.inject(Router);
    location = TestBed.inject(Location);
  });

  it('cannot go back when the application was opened on the current page', async () => {
    expect(service.canGoBack).toBeFalse();

    await navigateInZone('/first');

    expect(service.canGoBack).toBeFalse();
  });

  it('can go back after the user moved to another page', async () => {
    await navigateInZone('/first');
    await navigateInZone('/second');

    expect(service.canGoBack).toBeTrue();
  });

  it('opens the fallback page when there is nothing to go back to', async () => {
    await navigateInZone('/first');
    const back = spyOn(location, 'back');
    const navigate = spyOn(router, 'navigateByUrl').and.resolveTo(true);

    service.back('/second');

    expect(back).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledOnceWith('/second');
  });

  it('returns to the previous page through the browser history when it can', async () => {
    await navigateInZone('/first');
    await navigateInZone('/second');
    const back = spyOn(location, 'back');
    const navigate = spyOn(router, 'navigateByUrl');

    service.back('/first');

    expect(back).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
  });
});
