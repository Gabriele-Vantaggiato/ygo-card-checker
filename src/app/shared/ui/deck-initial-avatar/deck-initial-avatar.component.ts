import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { deckInitial } from '../../utils/deck-display.utils';

@Component({
  selector: 'app-deck-initial-avatar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="avatar placeholder shrink-0"
      [class]="sizeClass()"
      [attr.aria-hidden]="decorative()"
    >
      <span class="bg-primary/20 text-primary font-bold">{{ initial() }}</span>
    </span>
  `,
})
export class DeckInitialAvatarComponent {
  readonly name = input.required<string>();
  readonly size = input<'xs' | 'sm' | 'md'>('sm');
  readonly decorative = input(true);

  readonly initial = computed(() => deckInitial(this.name()));

  readonly sizeClass = computed(() => {
    switch (this.size()) {
      case 'xs':
        return 'w-8';
      case 'md':
        return 'w-12';
      default:
        return 'w-10';
    }
  });
}
