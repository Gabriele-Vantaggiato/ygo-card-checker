import { Directive, ElementRef, HostListener, OnDestroy, inject, input } from '@angular/core';
import { PreviewCard } from './card-preview.component';
import { CardPreviewService } from './card-preview.service';

@Directive({ selector: '[cardPreview]', standalone: true })
export class CardPreviewDirective implements OnDestroy {
  readonly cardPreview = input.required<PreviewCard | null>();
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly preview = inject(CardPreviewService);
  @HostListener('pointerenter', ['$event'])
  onEnter(event: PointerEvent): void {
    const card = this.cardPreview();
    if (event.pointerType === 'mouse' && card) this.preview.show(this.element.nativeElement, card);
  }
  @HostListener('focusin')
  onFocus(): void {
    const card = this.cardPreview();
    if (card && this.element.nativeElement.matches(':focus-visible'))
      this.preview.show(this.element.nativeElement, card);
  }
  @HostListener('pointerleave')
  @HostListener('focusout')
  onLeave(): void {
    this.preview.leave(this.element.nativeElement);
  }
  @HostListener('pointerdown')
  onPress(): void {
    this.preview.close(this.element.nativeElement);
  }
  ngOnDestroy(): void {
    this.preview.close(this.element.nativeElement);
  }
}
