import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { CardDecisionService, DECISION_WORKER } from './card-decision.service';
import { DecisionRequest, DecisionResponse, DecisionScore } from './card-decision.model';

class FakeWorker {
  onmessage: ((event: MessageEvent<DecisionResponse>) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  messages: DecisionRequest[] = [];
  terminate = jasmine.createSpy('terminate');
  postMessage(message: DecisionRequest): void { this.messages.push(message); }
  result(id: number): void {
    this.onmessage?.({ data: { kind: 'result', id, scores: [0.7, 0.95, 0.8, 0.72]
      .map((score, i) => ({ cardId: i + 1, score })) } } as MessageEvent<DecisionResponse>);
  }
}
describe('CardDecisionService', () => {
  let worker: FakeWorker;
  let create: jasmine.Spy;
  let service: CardDecisionService;
  const pool = [1, 2, 3, 4].map(cardId => ({ cardId, text: `card ${cardId}` }));
  beforeEach(() => {
    worker = new FakeWorker();
    create = jasmine.createSpy('createWorker').and.returnValue(worker);
    TestBed.configureTestingModule({ providers: [{ provide: DECISION_WORKER, useValue: create }] });
    service = TestBed.inject(CardDecisionService);
  });
  afterEach(() => TestBed.resetTestingModule());
  it('does not load a model until the user opts in', () => {
    service.rank$('draw cards', pool).subscribe(result => expect(result).toEqual([]));
    expect(create).not.toHaveBeenCalled();
  });
  it('ignores late messages and terminates abandoned computations', () => {
    service.setPreferences(true, 'draw');
    const next = jasmine.createSpy('next');
    const first = service.rank$('draw', pool).subscribe(next);
    first.unsubscribe();
    worker.result(1);
    expect(worker.terminate).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
  it('correlates concurrent requests and never applies one result to another', () => {
    service.setPreferences(true, 'draw');
    const first = jasmine.createSpy('first');
    const second = jasmine.createSpy('second');
    service.rank$('draw', pool).subscribe(first);
    service.rank$('remove', pool).subscribe(second);
    worker.result(2);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    worker.result(1);
    expect(first).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
  });
  it('falls back on browser errors, creation errors and disabling during a request', () => {
    service.setPreferences(true, 'draw');
    let received: DecisionScore[] | undefined;
    service.rank$('draw', pool).subscribe(result => received = result);
    worker.onerror?.();
    expect(received).toEqual([]);
    create.and.throwError('unsupported browser');
    service.rank$('draw', pool).subscribe(result => expect(result).toEqual([]));
    create.and.returnValue(worker);
    service.rank$('draw', pool).subscribe(result => received = result);
    service.setPreferences(false, 'draw');
    expect(received).toEqual([]);
    expect(service.status()).toBe('idle');
  });
  it('bounds download/inference time and terminates timed-out work', fakeAsync(() => {
    service.setPreferences(true, 'draw');
    const next = jasmine.createSpy('next');
    service.rank$('draw', pool).subscribe(next);
    tick(90_000);
    expect(next).toHaveBeenCalledWith([]);
    expect(worker.terminate).toHaveBeenCalled();
    service.setPreferences(false, '');
  }));
});
