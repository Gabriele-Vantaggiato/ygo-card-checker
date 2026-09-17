import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { DeckCooccurrenceService, CooccurrenceIndex } from './deck-cooccurrence.service';

describe('DeckCooccurrenceService', () => {
  let service: DeckCooccurrenceService;
  let http: HttpTestingController;

  const fixture: CooccurrenceIndex = {
    '1': [
      { id: 2, weight: 10 },
      { id: 3, weight: 4 },
    ],
    '2': [{ id: 1, weight: 10 }],
    '3': [{ id: 1, weight: 4 }],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(DeckCooccurrenceService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('scores a candidate by its strongest co-occurrence weight with any deck card', (done) => {
    service.loadIndex$().subscribe((index) => {
      expect(service.scoreFor(2, [1], index)).toBe(10);
      expect(service.scoreFor(3, [1], index)).toBe(4);
      done();
    });
    http.expectOne('assets/data/deck-builder/cooccurrence.json').flush(fixture);
  });

  it('scores 0 for a candidate with no recorded co-occurrence with the deck', (done) => {
    service.loadIndex$().subscribe((index) => {
      expect(service.scoreFor(999, [1], index)).toBe(0);
      done();
    });
    http.expectOne('assets/data/deck-builder/cooccurrence.json').flush(fixture);
  });

  it('caches the fetch across multiple calls', () => {
    let first: CooccurrenceIndex | undefined;
    let second: CooccurrenceIndex | undefined;
    service.loadIndex$().subscribe((index) => (first = index));
    http.expectOne('assets/data/deck-builder/cooccurrence.json').flush(fixture);
    service.loadIndex$().subscribe((index) => (second = index));
    expect(first).toBe(second as unknown as CooccurrenceIndex);
  });
});
