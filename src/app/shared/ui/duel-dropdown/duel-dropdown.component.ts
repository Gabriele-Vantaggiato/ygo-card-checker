import { ChangeDetectionStrategy, Component, input } from '@angular/core';

type DuelDropdownAlign = 'start' | 'end';

/**
 * DaisyUI dropdown via the native Popover API (method 2).
 * Renders menu content on the top layer — no z-index or overflow hacks on parents.
 * @see https://daisyui.com/components/dropdown/
 */
@Component({
  selector: 'app-duel-dropdown',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      [class]="triggerClass()"
      [attr.popovertarget]="popoverId()"
      [attr.aria-label]="ariaLabel() ?? null"
      [style]="triggerStyle()"
    >
      <ng-content select="[duelDropdownTrigger]" />
    </button>

    <ul
      [class]="
        'dropdown dropdown-bottom menu bg-base-100 rounded-box shadow-lg border border-base-300 p-2 ' +
        menuClasses()
      "
      popover
      [id]="popoverId()"
      [style]="menuStyle()"
      (click)="onMenuClick($event)"
    >
      <ng-content />
    </ul>
  `,
})
export class DuelDropdownComponent {
  readonly popoverId = input.required<string>();
  readonly anchorName = input.required<string>();
  readonly align = input<DuelDropdownAlign>('start');
  readonly triggerClass = input('btn');
  readonly menuClass = input('');
  readonly ariaLabel = input<string | null>(null);

  protected menuClasses(): string {
    const alignClass = this.align() === 'end' ? 'dropdown-end' : 'dropdown-start';
    const extra = this.menuClass().trim();
    return extra ? `${alignClass} ${extra}` : alignClass;
  }

  protected triggerStyle(): Record<string, string> {
    return { 'anchor-name': this.anchorName() };
  }

  protected menuStyle(): Record<string, string> {
    return { 'position-anchor': this.anchorName() };
  }

  protected onMenuClick(event: MouseEvent): void {
    const item = (event.target as HTMLElement).closest('button, a');
    if (!item) {
      return;
    }
    const popover = document.getElementById(this.popoverId());
    if (popover && 'hidePopover' in popover) {
      (popover as HTMLElement & { hidePopover: () => void }).hidePopover();
    }
  }
}
