import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-duel-field-bg',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="duel-field-bg" aria-hidden="true">
      <div class="duel-field-grid"></div>
      <div class="duel-field-beam duel-field-beam-a"></div>
      <div class="duel-field-beam duel-field-beam-b"></div>
      <div class="duel-field-orb duel-field-orb-a"></div>
      <div class="duel-field-orb duel-field-orb-b"></div>
      <div class="duel-field-orb duel-field-orb-c"></div>
    </div>
  `,
})
export class DuelFieldBackgroundComponent {}
