import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { DeckBuilderCatalogService } from './deck-builder-catalog.service';
import { GateCardFacts } from './deck-builder-gate.util';

describe('DeckBuilderCatalogService', () => {
  let service: DeckBuilderCatalogService;
  let http: HttpTestingController;

  const fixture: GateCardFacts[] = [
    { id: 1, name: 'A', archetype: 'X', setcodes: [], type: 'Effect Monster', isExtraDeck: false, banTcg: null },
    { id: 2, name: 'B', archetype: 'Y', setcodes: [], type: 'Effect Monster', isExtraDeck: false, banTcg: null },
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(DeckBuilderCatalogService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('fetches and caches the catalog as a Map keyed by card id', (done) => {
    service.loadCatalog$().subscribe((catalog) => {
      expect(catalog.get(1)).toEqual(fixture[0]);
      expect(catalog.get(2)).toEqual(fixture[1]);
      expect(catalog.size).toBe(2);
      done();
    });
    http.expectOne('assets/data/deck-builder/catalog.json').flush(fixture);
  });

  it('reuses the cached observable across calls', () => {
    let first: unknown;
    let second: unknown;
    service.loadCatalog$().subscribe((c) => (first = c));
    http.expectOne('assets/data/deck-builder/catalog.json').flush(fixture);
    service.loadCatalog$().subscribe((c) => (second = c));
    expect(first).toBe(second);
  });
});
