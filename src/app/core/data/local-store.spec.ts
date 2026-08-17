import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HttpClient, provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { computed } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { LocalStore } from './local-store';

interface RecordItem {
  id: number;
  name: string;
  isDeleted: boolean;
}

describe('LocalStore reactive cache', () => {
  it('updates computed consumers after an asynchronous refresh', async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const http = TestBed.inject(HttpTestingController);
    const store = new LocalStore<RecordItem>(TestBed.inject(HttpClient), '/records', ['name']);
    const names = computed(() => store.snapshot().map((item) => item.name));

    const loading = firstValueFrom(store.init());
    http.expectOne((request) => request.url === '/records' && request.params.get('includeDeleted') === 'true')
      .flush({ success: true, data: [{ id: 1, name: 'Finance', isDeleted: false }] });
    await loading;

    expect(names()).toEqual(['Finance']);
    http.verify();
  });
});
