import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { LegalityService } from './legality.service';
import { BanlistService } from './banlist.service';
import { YgoCard } from '../models/ygo-card.model';
import { YgoFormat } from '../models/ygo-format.model';
import tenguBanlist from '../../assets/data/banlists/tengu-2011-09.json';
import edisonBanlist from '../../assets/data/banlists/edison-2010-03.json';

const orbital7: YgoCard = {
  id: 71071546,
  name: 'Orbital 7',
  type: 'Effect Monster',
  desc: '',
  card_images: [{ id: 71071546, image_url: '', image_url_small: '' }],
  misc_info: [{ tcg_date: '2013-01-25', formats: ['Duel Links', 'TCG', 'OCG', 'Master Duel'] }],
};

const tenguFormat: YgoFormat = {
  id: 'tengu',
  name: { it: 'Tengu Format', en: 'Tengu Format' },
  banlistId: 'tengu-2011-09',
  banlistEffectiveDate: '2011-09-01',
  cardPoolEndDate: '2011-09-17',
  cardPoolStartDate: '2002-03-08',
  banlistSource: 'local',
  description: { it: '', en: '' },
};

const edisonFormat: YgoFormat = {
  id: 'edison',
  name: { it: 'Edison Format', en: 'Edison Format' },
  banlistId: 'edison-2010-03',
  banlistEffectiveDate: '2010-03-01',
  cardPoolEndDate: '2010-04-20',
  cardPoolStartDate: '2002-03-08',
  banlistSource: 'local',
  description: { it: '', en: '' },
};

describe('LegalityService', () => {
  let service: LegalityService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [LegalityService, BanlistService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(LegalityService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('evaluates Orbital 7 for Tengu with real banlist snapshot', async () => {
    const resultPromise = firstValueFrom(
      service.evaluateWithLocalBanlist$(orbital7, tenguFormat),
    );
    httpMock.expectOne('/assets/data/banlists/tengu-2011-09.json').flush(tenguBanlist);
    const result = await resultPromise;
    expect(result.verdict).toBe('not-legal');
    expect(result.reasons.some((r) => r.key === 'reason.notInPool')).toBeTrue();
  });

  it('evaluates Orbital 7 for Edison with real banlist snapshot', async () => {
    const resultPromise = firstValueFrom(
      service.evaluateWithLocalBanlist$(orbital7, edisonFormat),
    );
    httpMock.expectOne('/assets/data/banlists/edison-2010-03.json').flush(edisonBanlist);
    const result = await resultPromise;
    expect(result.verdict).toBe('not-legal');
  });

  it('handles missing formats field without throwing', () => {
    const card: YgoCard = {
      ...orbital7,
      misc_info: [{ tcg_date: '2013-01-25' }],
    };
    const result = service.evaluate(card, tenguFormat, 'Unlimited');
    expect(result.verdict).toBe('not-legal');
  });

  it('handles malformed formats field without throwing', () => {
    const card: YgoCard = {
      ...orbital7,
      misc_info: [{ tcg_date: '2013-01-25', formats: 'TCG' as unknown as string[] }],
    };
    const result = service.evaluate(card, tenguFormat, 'Unlimited');
    expect(result.verdict).toBe('not-legal');
  });
});
