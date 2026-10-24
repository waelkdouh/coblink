import { Component } from '@angular/core';

import { SessionService } from '../../core/services/session.service';

@Component({
  selector: 'app-footer',
  templateUrl: './footer.component.html'
})
export class FooterComponent {
  readonly session$ = this.session.session$;

  constructor(private readonly session: SessionService) {}
}
