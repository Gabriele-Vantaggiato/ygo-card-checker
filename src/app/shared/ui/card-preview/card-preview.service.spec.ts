import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Subject } from 'rxjs';
import { CardPreviewService } from './card-preview.service';
import { I18nService } from '../../../services/i18n.service';
import { YgoApiService } from '../../../services/ygo-api.service';
import { YgoCard } from '../../../models/ygo-card.model';

describe('CardPreviewService', () => {
  let preview: CardPreviewService;
  let owner: HTMLButtonElement;
  let api: { getCardById$: jasmine.Spy };
  const card = { id: 1, name: 'First card', desc: 'A readable effect.' };
  beforeEach(() => {
    api = { getCardById$: jasmine.createSpy('getCardById$') };
    TestBed.configureTestingModule({ providers: [
      { provide: I18nService, useValue: { lang: signal('it'), translate: (key: string) => key } },
      { provide: YgoApiService, useValue: api },
    ] });
    preview = TestBed.inject(CardPreviewService);
    owner = document.createElement('button');
    document.body.appendChild(owner);
  });
  afterEach(() => { preview.close(); owner.remove(); });

  it('does not fetch or show anything when a hover is abandoned', fakeAsync(() => {
    preview.show(owner, { id: 1, name: 'First' });
    tick(100);
    preview.leave(owner);
    tick(300);
    expect(document.querySelector('app-card-preview')).toBeNull();
    expect(api.getCardById$).not.toHaveBeenCalled();
  }));

  it('uses existing details and restores accessible descriptions when dismissed', fakeAsync(() => {
    owner.setAttribute('aria-describedby', 'existing-help');
    preview.show(owner, card);
    tick(280);
    expect(document.querySelector('app-card-preview')?.textContent).toContain('A readable effect.');
    expect(owner.getAttribute('aria-describedby')).toContain('duel-card-preview-');
    expect(api.getCardById$).not.toHaveBeenCalled();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('app-card-preview')).toBeNull();
    expect(owner.getAttribute('aria-describedby')).toBe('existing-help');
  }));

  it('ignores a late response belonging to the previous card', fakeAsync(() => {
    const response = new Subject<YgoCard | null>();
    api.getCardById$.and.returnValue(response);
    preview.show(owner, { id: 1, name: 'Pending card' });
    tick(280);
    preview.close();
    preview.show(owner, { id: 2, name: 'Second card', desc: 'Second effect' });
    tick(280);
    response.next({ id: 1, name: 'Wrong old card', type: '', desc: 'Old', card_images: [] });
    expect(document.querySelector('app-card-preview')?.textContent).toContain('Second card');
    expect(document.querySelector('app-card-preview')?.textContent).not.toContain('Wrong old card');
    preview.close();
  }));

  it('stays open while its own text scrolls and closes when the page scrolls', fakeAsync(() => {
    preview.show(owner, card);
    tick(280);
    const popup = document.querySelector('app-card-preview')!;
    popup.dispatchEvent(new Event('scroll'));
    expect(document.querySelector('app-card-preview')).not.toBeNull();
    document.dispatchEvent(new Event('scroll'));
    expect(document.querySelector('app-card-preview')).toBeNull();
  }));
});
