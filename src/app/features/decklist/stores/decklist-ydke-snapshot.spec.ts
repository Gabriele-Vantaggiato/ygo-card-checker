import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { DecklistStore } from './decklist.store';
import { DecklistService } from '../../../services/decklist.service';
import { YdkeService, ydkeSectionsToUrl } from '../../../services/ydke.service';
import { YgoApiService } from '../../../services/ygo-api.service';
import { CardLegalityFacade } from '../../../services/card-legality.facade';
import { I18nService } from '../../../services/i18n.service';
import { AuthService } from '../../../services/auth.service';
import { DeckSyncService } from '../../../services/deck-sync.service';
import { YgoCard, LegalityResult } from '../../../models/ygo-card.model';
import { YgoFormat } from '../../../models/ygo-format.model';

describe('Exact YDKE snapshot import for combo study', () => {
  const format: YgoFormat = { id: 'hat', name: { it: 'HAT', en: 'HAT' }, banlistId: null, banlistEffectiveDate: null, cardPoolEndDate: null, cardPoolStartDate: '', banlistSource: 'local', description: { it: '', en: '' } };
  const card: YgoCard = { id: 54447022, name: 'Soul Charge', type: 'Spell Card', desc: '', card_images: [] };
  const forbidden: LegalityResult = { verdict: 'not-legal', banlistStatus: 'Forbidden', tcgDate: null, reasons: [] };
  let store: DecklistStore, api: jasmine.Spy;
  beforeEach(() => {
    const persistence = new DecklistService();
    spyOn(persistence, 'load').and.returnValue({ activeId: 'test', decklists: [{ id: 'test', name: 'Test', updatedAt: '', cards: [] }] });
    spyOn(persistence, 'save');
    api = jasmine.createSpy().and.returnValue(of([card]));
    TestBed.configureTestingModule({ providers: [DecklistStore, YdkeService,
      { provide: DecklistService, useValue: persistence },
      { provide: YgoApiService, useValue: { getCardsByIds$: api } },
      { provide: CardLegalityFacade, useValue: { evaluateMany$: () => of(new Map([[card.id, forbidden]])) } },
      { provide: I18nService, useValue: { t: (key: string) => key } },
      { provide: AuthService, useValue: { session$: of(null) } },
      { provide: DeckSyncService, useValue: {} },
    ] });
    store = TestBed.inject(DecklistStore);
  });
  it('preserves original quantities and separate Main/Side entries while retaining legality annotations', async () => {
    const url = ydkeSectionsToUrl({ main: [card.id, card.id], extra: [], side: [card.id] });
    const result = await firstValueFrom(store.importFromYdke$(url, 'test', true, format, { preserveSource: true }));
    expect(result.ok).toBeTrue(); expect(result.total).toBe(3);
    const cards = store.getDeckById('test')!.cards;
    expect(cards.map(c => [c.section, c.quantity])).toEqual([['main', 2], ['side', 1]]);
    expect(cards.every(c => c.banlistStatus === 'Forbidden' && c.legalityVerdict === 'not-legal')).toBeTrue();
  });
  it('keeps the normal importer behavior unchanged', async () => {
    const result = await firstValueFrom(store.importFromYdke$(ydkeSectionsToUrl({ main: [card.id], extra: [], side: [] }), 'test', true, format));
    expect(result.ok).toBeFalse(); expect(store.getDeckById('test')!.cards).toEqual([]);
  });
  it('rejects partially resolved snapshots before changing a deck', async () => {
    const result = await firstValueFrom(store.importFromYdke$(ydkeSectionsToUrl({ main: [card.id, 92826944], extra: [], side: [] }), 'test', true, format, { preserveSource: true }));
    expect(result.ok).toBeFalse(); expect(store.getDeckById('test')!.cards).toEqual([]);
  });
});
