import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { signal } from '@angular/core';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { of, Subject } from 'rxjs';
import { FlowBuilderComponent } from './flow-builder.component';
import { YgoFlowStore } from '../stores/ygo-flow.store';
import { YdkeService } from '../../../services/ydke.service';
import { YgoApiService } from '../../../services/ygo-api.service';
import { EffectScriptService } from '../../../services/effect-script.service';
import { I18nService } from '../../../services/i18n.service';
import { DecklistStore } from '../../decklist/stores/decklist.store';
import { ComboWizardService } from '../services/combo-wizard.service';
import { CardPreviewDirective } from '../../../shared/ui/card-preview/card-preview.directive';
import { YgoCard } from '../../../models/ygo-card.model';

const card: YgoCard = {
  id: 89631139,
  name: 'Blue-Eyes White Dragon',
  type: 'Normal Monster',
  desc: 'A legendary dragon.',
  atk: 3000,
  def: 2500,
  card_images: [],
};
describe('Flow card interaction', () => {
  let api: { getCardById$: jasmine.Spy; searchCards$: jasmine.Spy };
  beforeEach(() => {
    spyOn(Storage.prototype, 'getItem').and.returnValue(null);
    spyOn(Storage.prototype, 'setItem');
    api = {
      getCardById$: jasmine.createSpy().and.returnValue(of(card)),
      searchCards$: jasmine.createSpy().and.returnValue(of([card])),
    };
    TestBed.configureTestingModule({
      imports: [FlowBuilderComponent],
      providers: [
        provideRouter([]),
        YgoFlowStore,
        { provide: YdkeService, useValue: {} },
        { provide: YgoApiService, useValue: api },
        { provide: EffectScriptService, useValue: { getScript: () => undefined } },
        {
          provide: I18nService,
          useValue: {
            lang: signal('it'),
            t: (key: string) => key,
            translate: (key: string) => key,
          },
        },
        { provide: DecklistStore, useValue: { decklists: signal([]), encodeYdke: () => null } },
        { provide: ComboWizardService, useValue: {} },
      ],
    });
  });
  it('shows card effect on hover and in the selected node inspector', fakeAsync(() => {
    const fixture = TestBed.createComponent(FlowBuilderComponent),
      store = TestBed.inject(YgoFlowStore);
    const id = store.addNode(null);
    store.attachCard(id, card);
    fixture.detectChanges();
    const button = fixture.debugElement.query(By.directive(CardPreviewDirective));
    button.triggerEventHandler('pointerenter', { pointerType: 'mouse' });
    tick(300);
    fixture.detectChanges();
    expect(document.querySelector('app-card-preview')?.textContent).toContain(card.desc);
    fixture.componentInstance.selected.set(id);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.flow-card-effect').textContent).toContain(
      card.desc,
    );
    fixture.destroy();
    tick(400);
  }));
  it('cancels a pending catalog response when the query changes', fakeAsync(() => {
    const old = new Subject<YgoCard[]>();
    api.searchCards$.and.returnValue(old);
    const fixture = TestBed.createComponent(FlowBuilderComponent);
    fixture.detectChanges();
    fixture.componentInstance.catalogQuery.set('dragon');
    fixture.detectChanges();
    tick(310);
    fixture.componentInstance.catalogQuery.set('');
    fixture.detectChanges();
    old.next([card]);
    expect(fixture.componentInstance.catalogCards()).toEqual([]);
    expect(fixture.componentInstance.catalogLoading()).toBeFalse();
    fixture.destroy();
    tick(400);
  }));
});
