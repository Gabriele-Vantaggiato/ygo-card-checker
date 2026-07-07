import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-context-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'context-panel lg:sticky lg:top-[3.75rem] lg:max-h-[calc(100vh-4.5rem)] lg:overflow-y-auto lg:overscroll-y-contain block',
  },
  template: `<ng-content />`,
})
export class ContextPanelComponent {
  readonly hostClass = input('');
}
