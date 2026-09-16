import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { YgoApiService } from './ygo-api.service';
describe('catalog search filters',()=>{
 let api:YgoApiService; let http:HttpTestingController;
 beforeEach(()=>{TestBed.configureTestingModule({providers:[provideHttpClient(),provideHttpClientTesting()]});api=TestBed.inject(YgoApiService);http=TestBed.inject(HttpTestingController);});
 afterEach(()=>http.verify());
 it('sends filters before pagination and supports browsing without a name',()=>{
  api.searchCards$('', 'en',40,{race:'Zombie',level:'4',atk:'0'}).subscribe();
  const request=http.expectOne(r=>r.params.get('race')==='Zombie');
  expect(request.request.params.has('fname')).toBeFalse();expect(request.request.params.get('num')).toBe('40');
  expect(request.request.params.get('level')).toBe('4');expect(request.request.params.get('atk')).toBe('0');request.flush({data:[]});
 });
 it('separates filter cache entries and preserves filters on language fallback',()=>{
  api.searchCards$('Mermail','it',20,{attribute:'WATER'}).subscribe();
  http.expectOne(r=>r.params.get('language')==='it').flush({data:[]});
  const fallback=http.expectOne(r=>!r.params.has('language'));expect(fallback.request.params.get('attribute')).toBe('WATER');fallback.flush({data:[]});
  api.searchCards$('Mermail','it',20,{attribute:'EARTH'}).subscribe();
  http.expectOne(r=>r.params.get('language')==='it'&&r.params.get('attribute')==='EARTH').flush({data:[]});
  http.expectOne(r=>r.params.get('attribute')==='EARTH').flush({data:[]});
 });
});
