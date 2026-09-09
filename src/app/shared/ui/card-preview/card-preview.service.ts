import { DOCUMENT } from '@angular/common';
import { ApplicationRef, ComponentRef, EnvironmentInjector, Injectable, OnDestroy, createComponent, inject } from '@angular/core';
import { Subscription } from 'rxjs';
import { I18nService } from '../../../services/i18n.service';
import { YgoApiService } from '../../../services/ygo-api.service';
import { CardPreviewComponent, PreviewCard } from './card-preview.component';

/** A single shared preview. Pending hover work and stale card responses are cancelled on close. */
@Injectable({ providedIn: 'root' })
export class CardPreviewService implements OnDestroy {
  ngOnDestroy(): void { this.close(); }
  private readonly document = inject(DOCUMENT);
  private readonly app = inject(ApplicationRef);
  private readonly environment = inject(EnvironmentInjector);
  private readonly api = inject(YgoApiService);
  private readonly i18n = inject(I18nService);
  private owner: HTMLElement | null = null;
  private popup: ComponentRef<CardPreviewComponent> | null = null;
  private request: Subscription | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private serial = 0;
  private previousDescription: string | null = null;

  show(owner: HTMLElement, card: PreviewCard): void {
    if (this.owner === owner && this.popup) { this.keepOpen(); return; }
    this.close();
    this.owner = owner;
    this.timer = setTimeout(() => this.mount(owner, card), 280);
  }

  leave(owner: HTMLElement): void {
    if (this.owner !== owner) return;
    this.keepOpen();
    this.timer = setTimeout(() => this.close(owner), 140);
  }

  keepOpen(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  close(owner?: HTMLElement): void {
    if (owner && this.owner !== owner) return;
    this.keepOpen();
    this.request?.unsubscribe();
    this.request = null;
    this.document.removeEventListener('keydown', this.onKeydown);
    this.document.removeEventListener('scroll', this.onScroll, true);
    this.document.defaultView?.removeEventListener('resize', this.onResize);
    if (this.popup) {
      const element = this.popup.location.nativeElement as HTMLElement;
      if (this.owner) {
        if (this.previousDescription === null) this.owner.removeAttribute('aria-describedby');
        else this.owner.setAttribute('aria-describedby', this.previousDescription);
      }
      this.app.detachView(this.popup.hostView);
      this.popup.destroy();
      element.remove();
      this.popup = null;
    }
    this.owner = null;
    this.previousDescription = null;
  }

  private mount(owner: HTMLElement, card: PreviewCard): void {
    this.timer = null;
    if (this.owner !== owner || !owner.isConnected) { this.close(owner); return; }
    const popup = createComponent(CardPreviewComponent, { environmentInjector: this.environment });
    this.popup = popup;
    const element = popup.location.nativeElement as HTMLElement;
    element.id = 'duel-card-preview-' + ++this.serial;
    element.setAttribute('popover', 'manual');
    this.previousDescription = owner.getAttribute('aria-describedby');
    owner.setAttribute('aria-describedby', [this.previousDescription, element.id].filter(Boolean).join(' '));
    this.app.attachView(popup.hostView);
    popup.setInput('card', card);
    popup.setInput('loading', !card.desc);
    this.document.body.appendChild(element);
    popup.changeDetectorRef.detectChanges();
    if (typeof element.showPopover === 'function') element.showPopover();
    element.addEventListener('pointerenter', () => this.keepOpen());
    element.addEventListener('pointerleave', () => this.leave(owner));
    this.document.addEventListener('keydown', this.onKeydown);
    this.document.addEventListener('scroll', this.onScroll, true);
    this.document.defaultView?.addEventListener('resize', this.onResize);
    this.position(owner, element);
    if (!card.desc) {
      this.request = this.api.getCardById$(card.id, this.i18n.lang()).subscribe({
        next: detail => {
          if (this.popup !== popup) return;
          if (detail) popup.setInput('card', detail);
          popup.setInput('loading', false);
          popup.changeDetectorRef.detectChanges();
          this.position(owner, element);
        },
        error: () => {
          if (this.popup !== popup) return;
          popup.setInput('loading', false);
          popup.changeDetectorRef.detectChanges();
        },
      });
    }
  }

  private position(owner: HTMLElement, element: HTMLElement): void {
    const viewport = this.document.defaultView;
    if (!viewport) return;
    const anchor = owner.getBoundingClientRect();
    const box = element.getBoundingClientRect();
    const gap = 12;
    let left = anchor.right + gap;
    if (left + box.width > viewport.innerWidth - gap) left = anchor.left - box.width - gap;
    left = Math.max(gap, Math.min(left, viewport.innerWidth - box.width - gap));
    const top = Math.max(gap, Math.min(anchor.top - 28, viewport.innerHeight - box.height - gap));
    element.style.left = left + 'px';
    element.style.top = top + 'px';
  }

  private readonly onKeydown = (event: KeyboardEvent): void => { if (event.key === 'Escape') this.close(); };
  private readonly onResize = (): void => this.close();
  private readonly onScroll = (event: Event): void => {
    const element = this.popup?.location.nativeElement as HTMLElement | undefined;
    if (element && event.target instanceof Node && element.contains(event.target)) return;
    this.close();
  };
}
