import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  NgZone,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { DecklistStore } from '../../decklist/stores/decklist.store';
import { FlowLibraryService } from '../../ygo-flow/services/flow-library.service';
import { I18nService } from '../../../services/i18n.service';
import { createLandingMotion } from '../utils/landing-motion';

@Component({
  selector: 'app-landing-page',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './landing.page.html',
})
export class LandingPage {
  readonly decks = inject(DecklistStore);
  readonly library = inject(FlowLibraryService);
  readonly i18n = inject(I18nService);
  private readonly landing = viewChild.required<ElementRef<HTMLElement>>('landing');
  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    afterNextRender(() => {
      // Scroll updates decorative CSS properties, never Angular application state.
      const motion = this.zone.runOutsideAngular(() =>
        createLandingMotion(this.landing().nativeElement),
      );
      this.destroyRef.onDestroy(() => motion.destroy());
    });
  }

  t(it: string, en: string): string {
    return this.i18n.lang() === 'it' ? it : en;
  }
}
