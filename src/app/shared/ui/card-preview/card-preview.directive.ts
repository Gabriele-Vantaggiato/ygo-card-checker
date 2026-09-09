import { Directive, ElementRef, HostListener, OnDestroy, inject, input } from '@angular/core';
import { PreviewCard } from './card-preview.component';
import { CardPreviewService } from './card-preview.service';

@Directive({ selector: '[cardPreview]', standalone: true })
export class CardPreviewDirective implements OnDestroy {
  readonly cardPreview = input.required<PreviewCard>();
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly preview = inject(CardPreviewService);
  @HostListener('pointerenter', ['$event'])
  onEnter(event: PointerEvent): void {
    if (event.pointerType === 'mouse') this.preview.show(this.element.nativeElement, this.cardPreview());
  }
  @HostListener('focusin')
  onFocus(): void {
    if (this.element.nativeElement.matches(':focus-visible')) this.preview.show(this.element.nativeElement, this.cardPreview());
  }
  @HostListener('pointerleave')
  @HostListener('focusout')
  onLeave(): void { this.preview.leave(this.element.nativeElement); }
  @HostListener('pointerdown')
  onPress(): void { this.preview.close(this.element.nativeElement); }
  ngOnDestroy(): void { this.preview.close(this.element.nativeElement); }
}
